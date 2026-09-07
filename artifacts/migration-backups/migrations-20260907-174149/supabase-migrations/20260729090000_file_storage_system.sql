-- File storage metadata registry.
-- Storage bytes live in the configured provider; these tables keep ownership,
-- lifecycle, and business references portable across providers.

insert into storage.buckets (id, name, public, file_size_limit)
values ('app-files', 'app-files', false, 52428800)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

create table if not exists public.file_objects (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'app-files',
  object_key text not null,
  original_name text not null,
  mime_type text,
  size_bytes bigint,
  checksum text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  status text not null default 'created'
    check (status in ('created', 'uploading', 'uploaded', 'ready', 'rejected', 'deleted')),
  locked boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  upload_expires_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  deleted_at timestamp with time zone,
  unique (bucket, object_key)
);

alter table public.file_objects
  add column if not exists locked boolean not null default false;

drop trigger if exists set_file_objects_updated_at on public.file_objects;
create trigger set_file_objects_updated_at
before update on public.file_objects
for each row
execute function public.set_updated_at();

create index if not exists file_objects_owner_created_idx
  on public.file_objects (owner_id, created_at desc)
  where deleted_at is null;

create index if not exists file_objects_status_idx
  on public.file_objects (status)
  where deleted_at is null;

create table if not exists public.file_usages (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.file_objects(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  purpose text not null default 'attachment',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (file_id, entity_type, entity_id, purpose)
);

create table if not exists public.file_folders (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'app-files',
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  path text not null,
  parent_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  deleted_at timestamp with time zone,
  unique (bucket, owner_id, path)
);

drop trigger if exists set_file_folders_updated_at on public.file_folders;
create trigger set_file_folders_updated_at
before update on public.file_folders
for each row
execute function public.set_updated_at();

create index if not exists file_usages_entity_idx
  on public.file_usages (entity_type, entity_id, purpose);

create index if not exists file_folders_owner_path_idx
  on public.file_folders (owner_id, path)
  where deleted_at is null;

alter table public.file_objects enable row level security;
alter table public.file_usages enable row level security;
alter table public.file_folders enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'file_objects'
      and policyname = 'Users can read own or public files'
  ) then
    create policy "Users can read own or public files"
      on public.file_objects
      for select
      using (
        auth.uid() = owner_id
        or visibility = 'public'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'file_objects'
      and policyname = 'Users can create own files'
  ) then
    create policy "Users can create own files"
      on public.file_objects
      for insert
      with check (auth.uid() = owner_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'file_objects'
      and policyname = 'Users can update own files'
  ) then
    create policy "Users can update own files"
      on public.file_objects
      for update
      using (auth.uid() = owner_id)
      with check (auth.uid() = owner_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'file_usages'
      and policyname = 'Users can read usages for accessible files'
  ) then
    create policy "Users can read usages for accessible files"
      on public.file_usages
      for select
      using (
        exists (
          select 1
          from public.file_objects fo
          where fo.id = file_usages.file_id
            and (fo.owner_id = auth.uid() or fo.visibility = 'public')
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'file_usages'
      and policyname = 'Users can create usages for own files'
  ) then
    create policy "Users can create usages for own files"
      on public.file_usages
      for insert
      with check (
        exists (
          select 1
          from public.file_objects fo
          where fo.id = file_usages.file_id
            and fo.owner_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'file_folders'
      and policyname = 'Users can manage own file folders'
  ) then
    create policy "Users can manage own file folders"
      on public.file_folders
      for all
      using (auth.uid() = owner_id)
      with check (auth.uid() = owner_id);
  end if;
end $$;

do $$
begin
  if to_regclass('public.admin_routes') is not null then
    with business_root as (
      insert into public.admin_routes (
        code,
        title,
        path,
        route_type,
        icon,
        visible,
        keep_alive,
        layout,
        status,
        sort_order,
        metadata
      ) values (
        'business-root',
        U&'\8FD0\8425\7BA1\7406',
        '/dashboard/business/_group',
        'group',
        'ri-dashboard-line',
        true,
        true,
        'dashboard',
        'active',
        10,
        '{"group": "business"}'::jsonb
      )
      on conflict (code) do update set
        code = public.admin_routes.code
      returning id
    )
    insert into public.admin_routes (
      code,
      title,
      path,
      parent_id,
      route_type,
      icon,
      page_code,
      permission_code,
      visible,
      keep_alive,
      layout,
      status,
      sort_order,
      metadata
    )
    select
      'file-management',
      U&'\6587\4EF6\7BA1\7406',
      '/dashboard/files',
      business_root.id,
      'page',
      'ri-folder-3-line',
      null,
      null,
      true,
      true,
      'dashboard',
      'active',
      28,
      '{"group": "business", "module": "files", "pageKind": "manager"}'::jsonb
    from business_root
    on conflict (code) do update set
      title = excluded.title,
      path = excluded.path,
      parent_id = excluded.parent_id,
      route_type = excluded.route_type,
      icon = excluded.icon,
      page_code = excluded.page_code,
      permission_code = excluded.permission_code,
      visible = excluded.visible,
      keep_alive = excluded.keep_alive,
      layout = excluded.layout,
      status = excluded.status,
      sort_order = excluded.sort_order,
      metadata = excluded.metadata,
      updated_at = timezone('utc'::text, now());
  end if;
end $$;

do $$
declare
  next_page_id uuid;
  next_version integer;
begin
  if to_regclass('public.admin_entities') is not null then
    insert into public.admin_entities (
      code,
      title,
      table_name,
      route_path,
      description,
      primary_key,
      status,
      sort_order,
      schema
    ) values
      (
        'file_objects',
        U&'\6587\4EF6\5BF9\8C61',
        'public.file_objects',
        '/dashboard/system/file-entities/file-objects',
        U&'\6587\4EF6\5143\6570\636E\3001\5BF9\8C61\8DEF\5F84\3001\72B6\6001\4E0E\9501\5B9A\72B6\6001\3002',
        'id',
        'active',
        80,
        '{"module":"files","group":"file-storage"}'::jsonb
      ),
      (
        'file_folders',
        U&'\6587\4EF6\5939',
        'public.file_folders',
        '/dashboard/system/file-entities/file-folders',
        U&'\6587\4EF6\6811\4E2D\53EF\6301\4E45\5316\7684\6587\4EF6\5939\5143\6570\636E\3002',
        'id',
        'active',
        81,
        '{"module":"files","group":"file-storage"}'::jsonb
      ),
      (
        'file_usages',
        U&'\6587\4EF6\5F15\7528',
        'public.file_usages',
        '/dashboard/system/file-entities/file-usages',
        U&'\6587\4EF6\4E0E\4E1A\52A1\5B9E\4F53\7684\5173\8054\5173\7CFB\3002',
        'id',
        'active',
        82,
        '{"module":"files","group":"file-storage"}'::jsonb
      )
    on conflict (code) do update set
      title = excluded.title,
      table_name = excluded.table_name,
      route_path = excluded.route_path,
      description = excluded.description,
      primary_key = excluded.primary_key,
      status = excluded.status,
      sort_order = excluded.sort_order,
      schema = excluded.schema,
      updated_at = timezone('utc'::text, now());
  end if;

  if to_regclass('public.lowcode_pages') is not null then
    insert into public.lowcode_pages (
      code,
      route,
      title,
      description,
      layout,
      status,
      keep_alive,
      schema,
      published_at
    ) values (
      'admin-system-file-entities',
      '/dashboard/system/file-entities',
      U&'\6587\4EF6\5B58\50A8\5B9E\4F53',
      U&'\67E5\770B\6587\4EF6\5B58\50A8\7CFB\7EDF\7684\5B9E\4F53\4E0E\5B57\6BB5\660E\7EC6\3002',
      'dashboard',
      'published',
      true,
      $json$
      {
        "schemaVersion": 1,
        "code": "admin-system-file-entities",
        "route": "/dashboard/system/file-entities",
        "title": "文件存储实体",
        "description": "查看文件存储系统的实体与字段明细。",
        "layout": "dashboard",
        "status": "published",
        "keepAlive": true,
        "dataSources": {
          "storageEntities": {
            "key": "storageEntities",
            "label": "文件存储实体",
            "serviceName": "files",
            "serviceMethod": "listStorageEntities",
            "autoLoad": true
          },
          "selectedStorageEntityRows": {
            "key": "selectedStorageEntityRows",
            "serviceName": "files",
            "serviceMethod": "listStorageEntities",
            "autoLoad": false
          },
          "selectedStorageEntityFieldRows": {
            "key": "selectedStorageEntityFieldRows",
            "serviceName": "files",
            "serviceMethod": "listStorageEntities",
            "autoLoad": false
          }
        },
        "blocks": [
          {
            "id": "file-entity-actions",
            "kind": "buttonGroup",
            "align": "left",
            "gap": 8,
            "actions": [
              {
                "code": "show-all",
                "label": "全部实体",
                "status": "primary",
                "icon": "ri-list-check-2",
                "directives": [
                  { "type": "setSearchFilters", "sourceKey": "storageEntities", "mode": "replace", "values": {} }
                ]
              },
              {
                "code": "show-file-objects",
                "label": "文件对象",
                "icon": "ri-file-3-line",
                "directives": [
                  { "type": "setSearchFilters", "sourceKey": "storageEntities", "mode": "replace", "values": { "code": "file_objects" } }
                ]
              },
              {
                "code": "show-file-folders",
                "label": "文件夹",
                "icon": "ri-folder-3-line",
                "directives": [
                  { "type": "setSearchFilters", "sourceKey": "storageEntities", "mode": "replace", "values": { "code": "file_folders" } }
                ]
              },
              {
                "code": "show-file-usages",
                "label": "文件引用",
                "icon": "ri-links-line",
                "directives": [
                  { "type": "setSearchFilters", "sourceKey": "storageEntities", "mode": "replace", "values": { "code": "file_usages" } }
                ]
              },
              {
                "code": "refresh",
                "label": "刷新",
                "icon": "ri-refresh-line",
                "directives": [
                  { "type": "refreshDataSource", "sourceKeys": ["storageEntities"] }
                ]
              }
            ]
          },
          {
            "id": "file-entity-main-grid",
            "kind": "grid",
            "sourceKey": "storageEntities",
            "schema": {
              "grid": {
                "border": true,
                "stripe": true,
                "showOverflow": "tooltip",
                "height": 360,
                "rowConfig": { "keyField": "code", "isCurrent": true },
                "columns": [
                  { "type": "seq", "title": "序号", "width": 64, "align": "center" },
                  { "field": "code", "title": "实体编码", "minWidth": 180, "fixed": "left", "showOverflow": "tooltip" },
                  { "field": "title", "title": "实体名称", "minWidth": 140, "fixed": "left", "sortable": true },
                  { "field": "table_name", "title": "数据表", "minWidth": 220, "showOverflow": "tooltip" },
                  { "field": "primary_key", "title": "主键", "width": 100, "align": "center" },
                  { "field": "field_count", "title": "字段数", "width": 100, "align": "center" },
                  { "field": "row_count", "title": "数据量", "width": 100, "align": "center" },
                  { "field": "module", "title": "模块", "width": 120, "align": "center" },
                  { "field": "status_label", "title": "状态", "width": 100, "align": "center" },
                  { "field": "description", "title": "说明", "minWidth": 320, "showOverflow": "tooltip" }
                ]
              },
              "rowActions": { "edit": false, "delete": false },
              "events": {
                "rowCurrentChange": [
                  { "type": "setDataSource", "sourceKey": "selectedStorageEntityRows", "value": ["{{ event.row }}"] },
                  { "type": "setDataSource", "sourceKey": "selectedStorageEntityFieldRows", "value": "{{ event.row.field_rows }}" }
                ]
              }
            }
          },
          {
            "id": "file-entity-detail-tabs",
            "kind": "tabs",
            "defaultKey": "fields",
            "tabs": [
              {
                "key": "fields",
                "label": "实体明细",
                "blocks": [
                  {
                    "id": "file-entity-fields-grid",
                    "kind": "grid",
                    "sourceKey": "selectedStorageEntityFieldRows",
                    "schema": {
                      "grid": {
                        "border": true,
                        "stripe": true,
                        "showOverflow": "tooltip",
                        "height": 240,
                        "rowConfig": { "keyField": "id" },
                        "columns": [
                          { "type": "seq", "title": "序号", "width": 64, "align": "center" },
                          { "field": "entity_title", "title": "实体", "minWidth": 140 },
                          { "field": "field_name", "title": "字段编码", "minWidth": 180, "fixed": "left", "showOverflow": "tooltip" },
                          { "field": "label", "title": "字段名称", "minWidth": 140, "fixed": "left" },
                          { "field": "data_type", "title": "数据类型", "width": 140, "align": "center" },
                          { "field": "required_label", "title": "必填", "width": 90, "align": "center" },
                          { "field": "description", "title": "说明", "minWidth": 360, "showOverflow": "tooltip" }
                        ]
                      },
                      "rowActions": { "edit": false, "delete": false }
                    }
                  }
                ]
              },
              {
                "key": "entity",
                "label": "实体信息",
                "blocks": [
                  {
                    "id": "file-entity-selected-grid",
                    "kind": "grid",
                    "sourceKey": "selectedStorageEntityRows",
                    "schema": {
                      "grid": {
                        "border": true,
                        "stripe": true,
                        "showOverflow": "tooltip",
                        "height": 240,
                        "rowConfig": { "keyField": "code" },
                        "columns": [
                          { "field": "code", "title": "实体编码", "minWidth": 180, "fixed": "left" },
                          { "field": "title", "title": "实体名称", "minWidth": 140 },
                          { "field": "table_name", "title": "数据表", "minWidth": 220 },
                          { "field": "route_path", "title": "业务页面", "minWidth": 220 },
                          { "field": "primary_key", "title": "主键", "width": 100, "align": "center" },
                          { "field": "description", "title": "说明", "minWidth": 360 }
                        ]
                      },
                      "rowActions": { "edit": false, "delete": false }
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
      $json$::jsonb,
      timezone('utc'::text, now())
    )
    on conflict (code) do update set
      route = excluded.route,
      title = excluded.title,
      description = excluded.description,
      layout = excluded.layout,
      status = excluded.status,
      keep_alive = excluded.keep_alive,
      schema = excluded.schema,
      version = public.lowcode_pages.version + 1,
      published_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
    returning id, version into next_page_id, next_version;

    if to_regclass('public.lowcode_page_versions') is not null then
      insert into public.lowcode_page_versions (page_id, version, schema, published_at)
      select id, version, schema, timezone('utc'::text, now())
      from public.lowcode_pages
      where id = next_page_id
      on conflict (page_id, version) do update set
        schema = excluded.schema,
        published_at = excluded.published_at;
    end if;
  end if;

  if to_regclass('public.admin_routes') is not null then
    with system_root as (
      insert into public.admin_routes (
        code,
        title,
        path,
        route_type,
        icon,
        visible,
        keep_alive,
        layout,
        status,
        sort_order,
        metadata
      ) values (
        'system-root',
        U&'\7CFB\7EDF\8BBE\7F6E',
        '/dashboard/system/_group',
        'group',
        'ri-settings-3-line',
        true,
        true,
        'dashboard',
        'active',
        90,
        '{"group":"system"}'::jsonb
      )
      on conflict (code) do update set
        code = public.admin_routes.code
      returning id
    )
    insert into public.admin_routes (
      code,
      title,
      path,
      parent_id,
      route_type,
      icon,
      page_code,
      permission_code,
      visible,
      keep_alive,
      layout,
      status,
      sort_order,
      metadata
    )
    select
      'system-file-entities',
      U&'\6587\4EF6\5B58\50A8\5B9E\4F53',
      '/dashboard/system/file-entities',
      system_root.id,
      'page',
      'ri-database-2-line',
      'admin-system-file-entities',
      'admin.entities.manage',
      true,
      true,
      'dashboard',
      'active',
      66,
      '{"group":"system","module":"files","pageKind":"entity-list"}'::jsonb
    from system_root
    on conflict (code) do update set
      title = excluded.title,
      path = excluded.path,
      parent_id = excluded.parent_id,
      route_type = excluded.route_type,
      icon = excluded.icon,
      page_code = excluded.page_code,
      permission_code = excluded.permission_code,
      visible = excluded.visible,
      keep_alive = excluded.keep_alive,
      layout = excluded.layout,
      status = excluded.status,
      sort_order = excluded.sort_order,
      metadata = excluded.metadata,
      updated_at = timezone('utc'::text, now());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can upload own file objects'
  ) then
    create policy "Users can upload own file objects"
      on storage.objects
      for insert
      with check (
        bucket_id = 'app-files'
        and auth.uid()::text = (storage.foldername(name))[2]
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can read own or public file objects'
  ) then
    create policy "Users can read own or public file objects"
      on storage.objects
      for select
      using (
        bucket_id = 'app-files'
        and (
          auth.uid()::text = (storage.foldername(name))[2]
          or exists (
            select 1
            from public.file_objects fo
            where fo.bucket = storage.objects.bucket_id
              and fo.object_key = storage.objects.name
              and fo.visibility = 'public'
              and fo.deleted_at is null
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can update own file objects'
  ) then
    create policy "Users can update own file objects"
      on storage.objects
      for update
      using (
        bucket_id = 'app-files'
        and auth.uid()::text = (storage.foldername(name))[2]
      )
      with check (
        bucket_id = 'app-files'
        and auth.uid()::text = (storage.foldername(name))[2]
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can delete own file objects'
  ) then
    create policy "Users can delete own file objects"
      on storage.objects
      for delete
      using (
        bucket_id = 'app-files'
        and auth.uid()::text = (storage.foldername(name))[2]
      );
  end if;
end $$;
