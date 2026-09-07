-- System option source registry for dropdown data.

create table if not exists public.system_option_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  source_type text not null default 'dict'
    check (source_type in ('dict', 'table', 'view', 'rpc', 'sql')),
  source_config jsonb not null default '{}'::jsonb,
  cache_ttl_seconds integer not null default 0
    check (cache_ttl_seconds >= 0),
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  sort_order integer not null default 0,
  is_system boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

drop trigger if exists set_system_option_sources_updated_at on public.system_option_sources;
create trigger set_system_option_sources_updated_at
before update on public.system_option_sources
for each row
execute function public.set_updated_at();

create table if not exists public.system_option_items (
  id uuid primary key default gen_random_uuid(),
  source_code text not null references public.system_option_sources(code)
    on update cascade
    on delete cascade,
  label text not null,
  value text not null,
  parent_value text,
  color text,
  disabled boolean not null default false,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  sort_order integer not null default 0,
  is_system boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (source_code, value)
);

drop trigger if exists set_system_option_items_updated_at on public.system_option_items;
create trigger set_system_option_items_updated_at
before update on public.system_option_items
for each row
execute function public.set_updated_at();

create index if not exists idx_system_option_sources_status_sort
  on public.system_option_sources(status, sort_order, created_at);

create index if not exists idx_system_option_items_source_status_sort
  on public.system_option_items(source_code, status, sort_order, created_at);

alter table public.system_option_sources enable row level security;
alter table public.system_option_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'system_option_sources'
      and policyname = 'Authenticated users can read active option sources'
  ) then
    create policy "Authenticated users can read active option sources"
      on public.system_option_sources
      for select
      using (auth.role() = 'authenticated' and status = 'active');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'system_option_sources'
      and policyname = 'Admin users can manage option sources'
  ) then
    create policy "Admin users can manage option sources"
      on public.system_option_sources
      for all
      using (
        exists (
          select 1 from public.users
          where users.id = auth.uid()
            and users.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.users
          where users.id = auth.uid()
            and users.role = 'admin'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'system_option_items'
      and policyname = 'Authenticated users can read active option items'
  ) then
    create policy "Authenticated users can read active option items"
      on public.system_option_items
      for select
      using (
        auth.role() = 'authenticated'
        and status = 'active'
        and exists (
          select 1 from public.system_option_sources sources
          where sources.code = system_option_items.source_code
            and sources.status = 'active'
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'system_option_items'
      and policyname = 'Admin users can manage option items'
  ) then
    create policy "Admin users can manage option items"
      on public.system_option_items
      for all
      using (
        exists (
          select 1 from public.users
          where users.id = auth.uid()
            and users.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.users
          where users.id = auth.uid()
            and users.role = 'admin'
        )
      );
  end if;
end $$;

grant select on public.system_option_sources to authenticated;
grant insert, update, delete on public.system_option_sources to authenticated;
grant select on public.system_option_items to authenticated;
grant insert, update, delete on public.system_option_items to authenticated;

create or replace function public.execute_system_option_sql(option_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  option_config jsonb;
  sql_text text;
  normalized_sql text;
  limit_value integer := 200;
  result jsonb := '[]'::jsonb;
begin
  select source_config
    into option_config
  from public.system_option_sources
  where code = option_code
    and source_type = 'sql'
    and status = 'active';

  if option_config is null then
    return '[]'::jsonb;
  end if;

  sql_text := btrim(coalesce(option_config->>'sql', option_config->>'query', ''));
  if sql_text = '' then
    return '[]'::jsonb;
  end if;

  normalized_sql := lower(regexp_replace(sql_text, '[[:space:]]+', ' ', 'g'));

  if normalized_sql !~ '^select ' then
    raise exception 'Only SELECT statements are allowed for option SQL.';
  end if;

  if position(';' in sql_text) > 0
    or normalized_sql ~ '(^|[^a-z_])(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|execute)([^a-z_]|$)'
  then
    raise exception 'Only a single read-only SELECT statement is allowed for option SQL.';
  end if;

  if coalesce(option_config->>'limit', '') ~ '^[0-9]+$' then
    limit_value := least(greatest((option_config->>'limit')::integer, 1), 1000);
  end if;

  execute
    'select coalesce(jsonb_agg(to_jsonb(option_rows)), ''[]''::jsonb)
       from (
         select *
         from (' || sql_text || ') option_sql_rows
         limit $1
       ) option_rows'
    into result
    using limit_value;

  return result;
end;
$$;

grant execute on function public.execute_system_option_sql(text) to authenticated;

insert into public.admin_permissions (
  code,
  name,
  description,
  resource_type,
  resource_key,
  action_code,
  status,
  sort_order
) values (
  'admin.options.manage',
  'Manage Option Sources',
  'Create, update, and delete reusable dropdown option sources.',
  'entity',
  'system_option_sources',
  'manage',
  'active',
  70
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  resource_type = excluded.resource_type,
  resource_key = excluded.resource_key,
  action_code = excluded.action_code,
  status = excluded.status,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc'::text, now());

insert into public.admin_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.admin_roles roles
join public.admin_permissions permissions
  on permissions.code = 'admin.options.manage'
where roles.code in ('system_admin', 'operations_admin')
on conflict do nothing;

insert into public.system_option_sources (
  code,
  name,
  description,
  source_type,
  source_config,
  status,
  sort_order,
  is_system
) values
  (
    'record_status',
    U&'\72B6\6001',
    U&'\901A\7528\542F\7528\505C\7528\72B6\6001\3002',
    'dict',
    '{}'::jsonb,
    'active',
    10,
    true
  ),
  (
    'option_source_type',
    U&'\4E0B\62C9\6765\6E90\7C7B\578B',
    U&'\4E0B\62C9\6570\636E\6E90\7C7B\578B\679A\4E3E\3002',
    'dict',
    '{}'::jsonb,
    'active',
    20,
    true
  )
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  source_type = excluded.source_type,
  source_config = excluded.source_config,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  updated_at = timezone('utc'::text, now());

insert into public.system_option_items (
  source_code,
  label,
  value,
  status,
  sort_order,
  is_system
) values
  ('record_status', U&'\542F\7528', 'active', 'active', 10, true),
  ('record_status', U&'\505C\7528', 'inactive', 'active', 20, true),
  ('option_source_type', U&'\5B57\5178\660E\7EC6', 'dict', 'active', 10, true),
  ('option_source_type', U&'\6570\636E\8868', 'table', 'active', 20, true),
  ('option_source_type', U&'\89C6\56FE', 'view', 'active', 30, true),
  ('option_source_type', 'RPC', 'rpc', 'active', 40, true),
  ('option_source_type', 'SQL', 'sql', 'active', 50, true)
on conflict (source_code, value) do update set
  label = excluded.label,
  status = excluded.status,
  sort_order = excluded.sort_order,
  is_system = excluded.is_system,
  updated_at = timezone('utc'::text, now());

with page_schema as (
  select $json$
{
  "schemaVersion": 1,
  "code": "admin-system-options",
  "route": "/dashboard/system/options",
  "title": "\u4e0b\u62c9\u6570\u636e\u7ba1\u7406",
  "description": "\u7edf\u4e00\u7ba1\u7406\u6765\u81ea\u5b57\u5178\u3001\u6570\u636e\u8868\u3001\u89c6\u56fe\u3001RPC \u6216 SQL \u7684\u4e0b\u62c9\u6570\u636e\u3002",
  "layout": "dashboard",
  "status": "published",
  "keepAlive": true,
  "dataSources": {
    "optionSources": {
      "key": "optionSources",
      "label": "\u4e0b\u62c9\u6570\u636e\u6e90",
      "serviceName": "admin",
      "serviceMethod": "listOptionSources",
      "saveMethod": "saveOptionSource",
      "deleteMethod": "deleteOptionSource",
      "autoLoad": true
    },
    "optionItems": {
      "key": "optionItems",
      "label": "\u4e0b\u62c9\u660e\u7ec6",
      "serviceName": "admin",
      "serviceMethod": "listOptionItems",
      "saveMethod": "saveOptionItem",
      "deleteMethod": "deleteOptionItem",
      "postData": {
        "sourceCode": "{{ data.currentOptionSource.code }}"
      },
      "autoLoad": true
    }
  },
  "blocks": [
    {
      "id": "option-source-search",
      "kind": "searchForm",
      "targetSourceKey": "optionSources",
      "schema": {
        "columns": 4,
        "fields": [
          { "field": "code", "label": "\u7f16\u7801", "component": "vxe-input", "props": { "clearable": true } },
          { "field": "name", "label": "\u540d\u79f0", "component": "vxe-input", "props": { "clearable": true } },
          {
            "field": "source_type",
            "label": "\u6765\u6e90\u7c7b\u578b",
            "component": "vxe-select",
            "options": [
              { "label": "\u5b57\u5178\u660e\u7ec6", "value": "dict" },
              { "label": "\u6570\u636e\u8868", "value": "table" },
              { "label": "\u89c6\u56fe", "value": "view" },
              { "label": "RPC", "value": "rpc" },
              { "label": "SQL", "value": "sql" }
            ],
            "props": { "clearable": true }
          },
          {
            "field": "status",
            "label": "\u72b6\u6001",
            "component": "vxe-select",
            "options": [
              { "label": "\u542f\u7528", "value": "active" },
              { "label": "\u505c\u7528", "value": "inactive" }
            ],
            "props": { "clearable": true }
          }
        ],
        "actions": [
          { "code": "submit", "label": "\u7b5b\u9009", "type": "submit", "status": "primary" },
          { "code": "reset", "label": "\u91cd\u7f6e", "type": "reset" }
        ]
      }
    },
    {
      "id": "option-source-grid",
      "kind": "grid",
      "sourceKey": "optionSources",
      "editorBlockId": "option-source-form",
      "schema": {
        "title": "\u4e0b\u62c9\u6570\u636e\u6e90",
        "toolbar": [
          {
            "code": "create",
            "label": "\u65b0\u5efa",
            "status": "primary",
            "directives": [
              {
                "type": "setFormValues",
                "blockId": "option-source-form",
                "mode": "replace",
                "values": {
                  "id": "",
                  "code": "",
                  "name": "",
                  "description": "",
                  "source_type": "dict",
                  "source_config_json": {},
                  "cache_ttl_seconds": 0,
                  "status": "active",
                  "sort_order": 0,
                  "is_system": false
                }
              }
            ]
          },
          { "code": "refresh", "label": "\u5237\u65b0", "directives": [ { "type": "refreshDataSource", "sourceKeys": [ "optionSources" ] } ] }
        ],
        "events": {
          "rowCurrentChange": [
            { "type": "setDataSource", "sourceKey": "currentOptionSource", "value": "{{ event.row }}" },
            {
              "type": "setFormValues",
              "blockId": "option-source-form",
              "mode": "replace",
              "value": "{{ event.row }}"
            },
            {
              "type": "setFormValues",
              "blockId": "option-item-form",
              "mode": "replace",
              "values": {
                "id": "",
                "source_code": "{{ event.row.code }}",
                "label": "",
                "value": "",
                "parent_value": "",
                "color": "",
                "disabled": false,
                "status": "active",
                "sort_order": 0,
                "is_system": false,
                "metadata_json": {}
              }
            },
            { "type": "refreshDataSource", "sourceKeys": [ "optionItems" ] }
          ]
        },
        "grid": {
          "border": true,
          "stripe": true,
          "showOverflow": "tooltip",
          "height": 360,
          "rowConfig": { "keyField": "id", "isCurrent": true },
          "columns": [
            { "field": "code", "title": "\u7f16\u7801", "minWidth": 180, "fixed": "left", "showOverflow": "tooltip" },
            { "field": "name", "title": "\u540d\u79f0", "minWidth": 160, "fixed": "left", "showOverflow": "tooltip" },
            { "field": "source_type_label", "title": "\u6765\u6e90\u7c7b\u578b", "width": 120, "align": "center" },
            { "field": "item_count", "title": "\u660e\u7ec6\u6570", "width": 90, "align": "center", "formatter": { "type": "number", "locale": "zh-CN", "emptyText": "0" } },
            { "field": "cache_ttl_seconds", "title": "\u7f13\u5b58(s)", "width": 100, "align": "center", "formatter": { "type": "number", "locale": "zh-CN", "emptyText": "0" } },
            { "field": "status_label", "title": "\u72b6\u6001", "width": 90, "align": "center" },
            { "field": "is_system", "title": "\u7cfb\u7edf", "width": 80, "align": "center", "formatter": { "type": "enum", "map": { "true": "\u662f", "false": "\u5426" }, "emptyText": "-" } },
            { "field": "sort_order", "title": "\u6392\u5e8f", "width": 80, "align": "center", "formatter": { "type": "number", "locale": "zh-CN", "emptyText": "0" } },
            { "field": "updated_at", "title": "\u66f4\u65b0\u65f6\u95f4", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
            { "title": "\u64cd\u4f5c", "width": 140, "fixed": "right", "slots": { "default": "actions" } }
          ]
        },
        "rowActions": {
          "edit": true,
          "editLabel": "\u7f16\u8f91",
          "delete": true,
          "deleteLabel": "\u5220\u9664"
        }
      }
    },
    {
      "id": "option-source-form",
      "kind": "form",
      "title": "\u6570\u636e\u6e90\u7f16\u8f91",
      "submitSourceKey": "optionSources",
      "initialValues": {
        "id": "",
        "code": "",
        "name": "",
        "description": "",
        "source_type": "dict",
        "source_config_json": {},
        "cache_ttl_seconds": 0,
        "status": "active",
        "sort_order": 0,
        "is_system": false
      },
      "schema": {
        "columns": 4,
        "fields": [
          { "field": "id", "label": "ID", "component": "vxe-input", "props": { "disabled": true } },
          { "field": "code", "label": "\u7f16\u7801", "component": "vxe-input", "rules": [ { "required": true, "message": "\u8bf7\u8f93\u5165\u7f16\u7801" } ] },
          { "field": "name", "label": "\u540d\u79f0", "component": "vxe-input", "rules": [ { "required": true, "message": "\u8bf7\u8f93\u5165\u540d\u79f0" } ] },
          {
            "field": "source_type",
            "label": "\u6765\u6e90\u7c7b\u578b",
            "component": "vxe-select",
            "options": [
              { "label": "\u5b57\u5178\u660e\u7ec6", "value": "dict" },
              { "label": "\u6570\u636e\u8868", "value": "table" },
              { "label": "\u89c6\u56fe", "value": "view" },
              { "label": "RPC", "value": "rpc" },
              { "label": "SQL", "value": "sql" }
            ]
          },
          { "field": "cache_ttl_seconds", "label": "\u7f13\u5b58\u79d2\u6570", "component": "lc-number-input" },
          { "field": "status", "label": "\u72b6\u6001", "component": "vxe-select", "options": [ { "label": "\u542f\u7528", "value": "active" }, { "label": "\u505c\u7528", "value": "inactive" } ] },
          { "field": "sort_order", "label": "\u6392\u5e8f", "component": "lc-number-input" },
          { "field": "is_system", "label": "\u7cfb\u7edf\u5185\u7f6e", "component": "vxe-switch" },
          { "field": "description", "label": "\u63cf\u8ff0", "component": "vxe-textarea", "props": { "rows": 3, "resize": "vertical" }, "span": 2 },
          { "field": "source_config_json", "label": "\u6765\u6e90\u914d\u7f6e JSON", "component": "lc-json-editor", "props": { "rows": 8, "resize": "vertical" }, "span": 2 }
        ],
        "actions": [
          { "code": "submit", "label": "\u4fdd\u5b58\u6570\u636e\u6e90", "type": "submit", "status": "primary" },
          { "code": "reset", "label": "\u91cd\u7f6e", "type": "reset" }
        ]
      }
    },
    {
      "id": "option-item-grid",
      "kind": "grid",
      "sourceKey": "optionItems",
      "editorBlockId": "option-item-form",
      "schema": {
        "title": "\u4e0b\u62c9\u660e\u7ec6 / \u9884\u89c8",
        "toolbar": [
          {
            "code": "create",
            "label": "\u65b0\u5efa",
            "status": "primary",
            "directives": [
              {
                "type": "setFormValues",
                "blockId": "option-item-form",
                "mode": "replace",
                "values": {
                  "id": "",
                  "source_code": "{{ data.currentOptionSource.code }}",
                  "label": "",
                  "value": "",
                  "parent_value": "",
                  "color": "",
                  "disabled": false,
                  "status": "active",
                  "sort_order": 0,
                  "is_system": false,
                  "metadata_json": {}
                }
              }
            ]
          },
          { "code": "refresh", "label": "\u5237\u65b0", "directives": [ { "type": "refreshDataSource", "sourceKeys": [ "optionItems" ] } ] }
        ],
        "grid": {
          "border": true,
          "stripe": true,
          "showOverflow": "tooltip",
          "height": 320,
          "rowConfig": { "keyField": "id", "isCurrent": true },
          "columns": [
            { "field": "source_code", "title": "\u6765\u6e90", "minWidth": 160, "showOverflow": "tooltip" },
            { "field": "label", "title": "\u663e\u793a\u6587\u672c", "minWidth": 160, "fixed": "left", "showOverflow": "tooltip" },
            { "field": "value", "title": "\u5b9e\u9645\u503c", "minWidth": 160, "fixed": "left", "showOverflow": "tooltip" },
            { "field": "parent_value", "title": "\u7236\u7ea7\u503c", "minWidth": 120, "showOverflow": "tooltip", "formatter": { "type": "text", "emptyText": "-" } },
            { "field": "color", "title": "\u989c\u8272", "width": 100, "formatter": { "type": "text", "emptyText": "-" } },
            { "field": "disabled", "title": "\u7981\u7528", "width": 80, "align": "center", "formatter": { "type": "enum", "map": { "true": "\u662f", "false": "\u5426" }, "emptyText": "-" } },
            { "field": "status_label", "title": "\u72b6\u6001", "width": 90, "align": "center" },
            { "field": "sort_order", "title": "\u6392\u5e8f", "width": 80, "align": "center", "formatter": { "type": "number", "locale": "zh-CN", "emptyText": "0" } },
            { "field": "updated_at", "title": "\u66f4\u65b0\u65f6\u95f4", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
            { "title": "\u64cd\u4f5c", "width": 140, "fixed": "right", "slots": { "default": "actions" } }
          ]
        },
        "rowActions": {
          "edit": false,
          "delete": false,
          "actions": [
            {
              "code": "edit",
              "label": "\u7f16\u8f91",
              "status": "primary",
              "directives": [
                {
                  "type": "setFormValues",
                  "blockId": "option-item-form",
                  "mode": "replace",
                  "value": "{{ row }}"
                }
              ]
            },
            {
              "code": "delete",
              "label": "\u5220\u9664",
              "status": "danger",
              "directives": [
                {
                  "type": "invokeService",
                  "serviceName": "admin",
                  "serviceMethod": "deleteOptionItem",
                  "postData": "{{ row }}"
                },
                { "type": "refreshDataSource", "sourceKeys": [ "optionItems" ] },
                { "type": "showMessage", "message": "\u660e\u7ec6\u5df2\u5220\u9664" }
              ]
            }
          ]
        }
      }
    },
    {
      "id": "option-item-form",
      "kind": "form",
      "title": "\u660e\u7ec6\u7f16\u8f91",
      "initialValues": {
        "id": "",
        "source_code": "",
        "label": "",
        "value": "",
        "parent_value": "",
        "color": "",
        "disabled": false,
        "status": "active",
        "sort_order": 0,
        "is_system": false,
        "metadata_json": {}
      },
      "schema": {
        "columns": 4,
        "fields": [
          { "field": "id", "label": "ID", "component": "vxe-input", "props": { "disabled": true } },
          { "field": "source_code", "label": "\u6765\u6e90\u7f16\u7801", "component": "vxe-input", "props": { "disabled": true }, "rules": [ { "required": true, "message": "\u8bf7\u5148\u9009\u62e9\u6570\u636e\u6e90" } ] },
          { "field": "label", "label": "\u663e\u793a\u6587\u672c", "component": "vxe-input", "rules": [ { "required": true, "message": "\u8bf7\u8f93\u5165\u663e\u793a\u6587\u672c" } ] },
          { "field": "value", "label": "\u5b9e\u9645\u503c", "component": "vxe-input", "rules": [ { "required": true, "message": "\u8bf7\u8f93\u5165\u5b9e\u9645\u503c" } ] },
          { "field": "parent_value", "label": "\u7236\u7ea7\u503c", "component": "vxe-input" },
          { "field": "color", "label": "\u989c\u8272", "component": "vxe-input" },
          { "field": "disabled", "label": "\u7981\u7528", "component": "vxe-switch" },
          { "field": "status", "label": "\u72b6\u6001", "component": "vxe-select", "options": [ { "label": "\u542f\u7528", "value": "active" }, { "label": "\u505c\u7528", "value": "inactive" } ] },
          { "field": "sort_order", "label": "\u6392\u5e8f", "component": "lc-number-input" },
          { "field": "is_system", "label": "\u7cfb\u7edf\u5185\u7f6e", "component": "vxe-switch" },
          { "field": "metadata_json", "label": "\u6269\u5c55 JSON", "component": "lc-json-editor", "props": { "rows": 6, "resize": "vertical" }, "span": 2 }
        ],
        "actions": [
          {
            "code": "submit",
            "label": "\u4fdd\u5b58\u660e\u7ec6",
            "type": "submit",
            "status": "primary",
            "directives": [
              {
                "type": "invokeService",
                "serviceName": "admin",
                "serviceMethod": "saveOptionItem",
                "postData": "{{ values }}"
              },
              { "type": "refreshDataSource", "sourceKeys": [ "optionItems" ] },
              { "type": "showMessage", "message": "\u660e\u7ec6\u5df2\u4fdd\u5b58" }
            ]
          },
          { "code": "reset", "label": "\u91cd\u7f6e", "type": "reset" }
        ]
      }
    }
  ]
}
$json$::jsonb as schema
),
upsert_page as (
  insert into public.lowcode_pages (
    code,
    route,
    title,
    description,
    layout,
    status,
    keep_alive,
    schema,
    version,
    published_at
  )
  select
    'admin-system-options',
    '/dashboard/system/options',
    U&'\4E0B\62C9\6570\636E\7BA1\7406',
    U&'\7EDF\4E00\7BA1\7406\6765\81EA\5B57\5178\3001\6570\636E\8868\3001\89C6\56FE\3001RPC \6216 SQL \7684\4E0B\62C9\6570\636E\3002',
    'dashboard',
    'published',
    true,
    page_schema.schema,
    1,
    timezone('utc'::text, now())
  from page_schema
  on conflict (code) do update set
    route = excluded.route,
    title = excluded.title,
    description = excluded.description,
    layout = excluded.layout,
    status = excluded.status,
    keep_alive = excluded.keep_alive,
    schema = excluded.schema,
    version = coalesce(public.lowcode_pages.version, 0) + 1,
    published_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  returning id, version, schema
)
insert into public.lowcode_page_versions (
  page_id,
  version,
  schema,
  published_at
)
select
  id,
  version,
  schema,
  timezone('utc'::text, now())
from upsert_page
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.admin_entities (
  code,
  title,
  table_name,
  route_path,
  page_code,
  icon,
  description,
  primary_key,
  status,
  sort_order,
  schema
) values
  (
    'system_option_sources',
    U&'\4E0B\62C9\6570\636E\6E90',
    'public.system_option_sources',
    '/dashboard/system/options',
    'admin-system-options',
    'ri-list-settings-line',
    U&'\7EDF\4E00\4E0B\62C9\6570\636E\6E90\5B9A\4E49\3002',
    'id',
    'active',
    70,
    '{"list":{"source":"public.system_option_sources","method":"admin.listOptionSources"}}'::jsonb
  ),
  (
    'system_option_items',
    U&'\4E0B\62C9\660E\7EC6',
    'public.system_option_items',
    '/dashboard/system/options/items',
    'admin-system-options',
    'ri-list-check-3',
    U&'\5B57\5178\578B\4E0B\62C9\7684\624B\5DE5\7EF4\62A4\660E\7EC6\3002',
    'id',
    'active',
    71,
    '{"list":{"source":"public.system_option_items","method":"admin.listOptionItems"}}'::jsonb
  )
on conflict (code) do update set
  title = excluded.title,
  table_name = excluded.table_name,
  route_path = excluded.route_path,
  page_code = excluded.page_code,
  icon = excluded.icon,
  description = excluded.description,
  primary_key = excluded.primary_key,
  status = excluded.status,
  sort_order = excluded.sort_order,
  schema = excluded.schema,
  updated_at = timezone('utc'::text, now());

with root_route as (
  insert into public.admin_routes (
    code,
    title,
    path,
    route_type,
    icon,
    page_code,
    visible,
    keep_alive,
    layout,
    status,
    sort_order,
    metadata
  ) values (
    'system-root',
    U&'\7CFB\7EDF\8BBE\7F6E',
    '/dashboard/system',
    'group',
    'setting',
    'admin-system-home',
    true,
    true,
    'dashboard',
    'active',
    10,
    '{"group": "system"}'::jsonb
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
  'system-options',
  U&'\4E0B\62C9\6570\636E',
  '/dashboard/system/options',
  root_route.id,
  'page',
  'ri-list-settings-line',
  'admin-system-options',
  'admin.options.manage',
  true,
  true,
  'dashboard',
  'active',
  65,
  '{"group": "system", "module": "system-options"}'::jsonb
from root_route
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
