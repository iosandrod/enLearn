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
