-- Route low-code table data through a single entity-driven listItems endpoint.

alter table public.admin_entities
  add column if not exists query_sql text;

comment on column public.admin_entities.query_sql is
  'Optional read-only SELECT used by admin.listItems. When empty, listItems reads table_name directly.';

update public.admin_entities
set
  query_sql = $sql$
select *
from public.get_admin_user_permission_rows()
$sql$,
  schema = jsonb_set(
    coalesce(schema, '{}'::jsonb),
    '{readPermissions}',
    '["admin.users.manage"]'::jsonb,
    true
  )
where code = 'users';

update public.admin_entities
set
  query_sql = $sql$
select
  roles.*,
  coalesce(permission_summary.permission_codes, '{}'::text[]) as permission_codes,
  coalesce(permission_summary.permission_names, '') as permission_names,
  coalesce(permission_summary.permission_count, 0) as permission_count,
  coalesce(permission_summary.permission_rows, '[]'::jsonb) as permission_rows
from public.admin_roles roles
left join (
  select
    role_permissions.role_id,
    array_agg(permissions.code order by permissions.sort_order, permissions.created_at) as permission_codes,
    string_agg(permissions.name, ', ' order by permissions.sort_order, permissions.created_at) as permission_names,
    count(permissions.id)::integer as permission_count,
    jsonb_agg(
      jsonb_build_object(
        'id', role_permissions.id,
        'role_id', role_permissions.role_id,
        'permission_id', permissions.id,
        'permission_code', permissions.code,
        'permission_name', permissions.name,
        'resource_type', permissions.resource_type,
        'resource_key', permissions.resource_key,
        'action_code', permissions.action_code,
        'route_path', permissions.route_path,
        'page_code', permissions.page_code,
        'entity_code', permissions.entity_code,
        'status', permissions.status,
        'sort_order', permissions.sort_order,
        'created_at', role_permissions.created_at
      )
      order by permissions.sort_order, permissions.created_at, role_permissions.created_at
    ) as permission_rows
  from public.admin_role_permissions role_permissions
  join public.admin_permissions permissions on permissions.id = role_permissions.permission_id
  group by role_permissions.role_id
) permission_summary on permission_summary.role_id = roles.id
$sql$,
  schema = jsonb_set(
    coalesce(schema, '{}'::jsonb),
    '{readPermissions}',
    '["admin.roles.manage", "admin.users.manage"]'::jsonb,
    true
  )
where code = 'admin_roles';

update public.admin_entities
set
  query_sql = $sql$
select
  permissions.*,
  coalesce(role_summary.role_codes, '{}'::text[]) as role_codes,
  coalesce(role_summary.role_names, '') as role_names,
  coalesce(role_summary.role_count, 0) as role_count,
  coalesce(role_summary.role_rows, '[]'::jsonb) as role_rows
from public.admin_permissions permissions
left join (
  select
    role_permissions.permission_id,
    array_agg(roles.code order by roles.sort_order, roles.created_at) as role_codes,
    string_agg(roles.name, ', ' order by roles.sort_order, roles.created_at) as role_names,
    count(roles.id)::integer as role_count,
    jsonb_agg(
      jsonb_build_object(
        'id', role_permissions.id,
        'role_id', roles.id,
        'permission_id', role_permissions.permission_id,
        'role_code', roles.code,
        'role_name', roles.name,
        'role_status', roles.status,
        'is_system', roles.is_system,
        'sort_order', roles.sort_order,
        'created_at', role_permissions.created_at
      )
      order by roles.sort_order, roles.created_at, role_permissions.created_at
    ) as role_rows
  from public.admin_role_permissions role_permissions
  join public.admin_roles roles on roles.id = role_permissions.role_id
  group by role_permissions.permission_id
) role_summary on role_summary.permission_id = permissions.id
$sql$,
  schema = jsonb_set(
    coalesce(schema, '{}'::jsonb),
    '{readPermissions}',
    '["admin.permissions.manage", "admin.roles.manage", "admin.routes.manage"]'::jsonb,
    true
  )
where code = 'admin_permissions';

update public.admin_entities
set
  query_sql = $sql$
select
  routes.*,
  jsonb_pretty(coalesce(routes.metadata, '{}'::jsonb)) as metadata_json
from public.admin_routes routes
$sql$,
  schema = jsonb_set(
    coalesce(schema, '{}'::jsonb),
    '{readPermissions}',
    '["admin.routes.manage"]'::jsonb,
    true
  )
where code = 'admin_routes';

update public.admin_entities
set
  query_sql = $sql$
select
  entities.*,
  jsonb_pretty(coalesce(entities.schema, '{}'::jsonb)) as schema_json
from public.admin_entities entities
$sql$,
  schema = jsonb_set(
    coalesce(schema, '{}'::jsonb),
    '{readPermissions}',
    '["admin.entities.manage", "admin.permissions.manage", "lowcode.pages.manage"]'::jsonb,
    true
  )
where code = 'admin_entities';

update public.lowcode_pages
set schema = jsonb_set(
  jsonb_set(
    jsonb_set(
      schema,
      '{blocks,1,initialValues,query_sql}',
      '""'::jsonb,
      true
    ),
    '{blocks,1,schema,fields}',
    case
      when exists (
        select 1
        from jsonb_array_elements(coalesce(schema #> '{blocks,1,schema,fields}', '[]'::jsonb)) as field_item
        where field_item->>'field' = 'query_sql'
      ) then schema #> '{blocks,1,schema,fields}'
      else coalesce(schema #> '{blocks,1,schema,fields}', '[]'::jsonb) || '[
        {
          "field": "query_sql",
          "label": "Query SQL",
          "component": "vxe-textarea",
          "props": {
            "rows": 8,
            "resize": "vertical",
            "placeholder": "select * from public.table_name"
          },
          "span": 2
        }
      ]'::jsonb
    end,
    true
  ),
  '{blocks,2,schema,grid,columns}',
  case
    when exists (
      select 1
      from jsonb_array_elements(coalesce(schema #> '{blocks,2,schema,grid,columns}', '[]'::jsonb)) as column_item
      where column_item->>'field' = 'query_sql'
    ) then schema #> '{blocks,2,schema,grid,columns}'
    else coalesce(schema #> '{blocks,2,schema,grid,columns}', '[]'::jsonb) || '[
      {
        "field": "query_sql",
        "title": "Query SQL",
        "minWidth": 260,
        "showOverflow": "tooltip"
      }
    ]'::jsonb
  end,
  true
)
where code = 'admin-system-entities'
  and jsonb_typeof(schema->'blocks') = 'array';

update public.admin_entities
set schema = jsonb_set(
  coalesce(schema, '{}'::jsonb),
  '{readPermissions}',
  '["lowcode.pages.manage", "admin.entities.manage", "admin.permissions.manage", "admin.routes.manage"]'::jsonb,
  true
)
where code = 'lowcode_pages';

do $$
declare
  page_row record;
  next_sources jsonb;
  saved_id uuid;
  saved_version integer;
  saved_schema jsonb;
begin
  for page_row in
    select id, schema
    from public.lowcode_pages
    where jsonb_typeof(schema->'dataSources') = 'object'
  loop
    select jsonb_object_agg(source_key, next_source)
      into next_sources
    from (
      select
        source_key,
        case source_value->>'serviceMethod'
          when 'listUsers' then
            jsonb_set(
              source_value || jsonb_build_object('serviceName', 'admin', 'serviceMethod', 'listItems'),
              '{postData}',
              (case when jsonb_typeof(source_value->'postData') = 'object' then source_value->'postData' else '{}'::jsonb end)
                || '{"entityCode": "users"}'::jsonb,
              true
            )
          when 'listRoles' then
            jsonb_set(
              source_value || jsonb_build_object('serviceName', 'admin', 'serviceMethod', 'listItems'),
              '{postData}',
              (case when jsonb_typeof(source_value->'postData') = 'object' then source_value->'postData' else '{}'::jsonb end)
                || '{"entityCode": "admin_roles"}'::jsonb,
              true
            )
          when 'listPermissions' then
            jsonb_set(
              source_value || jsonb_build_object('serviceName', 'admin', 'serviceMethod', 'listItems'),
              '{postData}',
              (case when jsonb_typeof(source_value->'postData') = 'object' then source_value->'postData' else '{}'::jsonb end)
                || '{"entityCode": "admin_permissions"}'::jsonb,
              true
            )
          when 'listRoutes' then
            jsonb_set(
              source_value || jsonb_build_object('serviceName', 'admin', 'serviceMethod', 'listItems'),
              '{postData}',
              (case when jsonb_typeof(source_value->'postData') = 'object' then source_value->'postData' else '{}'::jsonb end)
                || '{"entityCode": "admin_routes"}'::jsonb,
              true
            )
          when 'listEntities' then
            jsonb_set(
              source_value || jsonb_build_object('serviceName', 'admin', 'serviceMethod', 'listItems'),
              '{postData}',
              (case when jsonb_typeof(source_value->'postData') = 'object' then source_value->'postData' else '{}'::jsonb end)
                || '{"entityCode": "admin_entities"}'::jsonb,
              true
            )
          when 'listPages' then
            jsonb_set(
              source_value || jsonb_build_object('serviceName', 'admin', 'serviceMethod', 'listItems'),
              '{postData}',
              (case when jsonb_typeof(source_value->'postData') = 'object' then source_value->'postData' else '{}'::jsonb end)
                || '{"entityCode": "lowcode_pages"}'::jsonb,
              true
            )
          when 'listTableRows' then
            jsonb_set(
              source_value || jsonb_build_object('serviceName', 'admin', 'serviceMethod', 'listItems'),
              '{postData}',
              case when jsonb_typeof(source_value->'postData') = 'object' then source_value->'postData' else '{}'::jsonb end,
              true
            )
          else source_value
        end as next_source
      from jsonb_each(page_row.schema->'dataSources') as data_sources(source_key, source_value)
    ) normalized_sources;

    if next_sources is not null and next_sources <> page_row.schema->'dataSources' then
      update public.lowcode_pages
      set
        schema = jsonb_set(schema, '{dataSources}', next_sources, true),
        version = coalesce(version, 0) + 1,
        published_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
      where id = page_row.id
      returning id, version, schema into saved_id, saved_version, saved_schema;

      insert into public.lowcode_page_versions (
        page_id,
        version,
        schema,
        published_at
      ) values (
        saved_id,
        saved_version,
        saved_schema,
        timezone('utc'::text, now())
      )
      on conflict (page_id, version) do update set
        schema = excluded.schema,
        published_at = excluded.published_at;
    end if;
  end loop;
end $$;
