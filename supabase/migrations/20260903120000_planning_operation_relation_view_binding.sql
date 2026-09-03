-- Bind operation and operation-material pages to relation-aware read views.
-- Physical tables remain the CRUD write targets.

begin;

create or replace view public.planning_operation_view
with (security_invoker = true)
as
select
  src.*,
  coalesce(calendar.name, src.available_id::text) as available_id_label,
  coalesce(item.display_name, item.name, src.item_id::text) as item_id_label,
  coalesce(location.name, src.location_id::text) as location_id_label,
  coalesce(owner_operation.name, src.owner_id::text) as owner_id_label,
  calendar.name as available_name,
  item.name as item_code,
  item.display_name as item_name,
  location.name as location_name,
  owner_operation.name as owner_name,
  (
    select count(*)
    from public.planning_suboperation suboperation
    where suboperation.account_id = src.account_id
      and suboperation.operation_id = src.id
  )::integer as suboperation_count,
  (
    select count(*)
    from public.planning_operationmaterial operation_material
    where operation_material.account_id = src.account_id
      and operation_material.operation_id = src.id
  )::integer as operationmaterial_count,
  (
    select count(*)
    from public.planning_operationresource operation_resource
    where operation_resource.account_id = src.account_id
      and operation_resource.operation_id = src.id
  )::integer as operationresource_count
from public.planning_operation src
left join public.planning_calendar calendar
  on calendar.account_id = src.account_id
 and calendar.id = src.available_id
left join public.planning_item item
  on item.account_id = src.account_id
 and item.id = src.item_id
left join public.planning_location location
  on location.account_id = src.account_id
 and location.id = src.location_id
left join public.planning_operation owner_operation
  on owner_operation.account_id = src.account_id
 and owner_operation.id = src.owner_id;

create or replace view public.planning_operationmaterial_view
with (security_invoker = true)
as
select
  src.*,
  coalesce(item.display_name, item.name, src.item_id::text) as item_id_label,
  coalesce(location.name, src.location_id::text) as location_id_label,
  coalesce(operation.name, src.operation_id::text) as operation_id_label,
  operation.name as operation_name,
  operation.type as operation_type,
  operation.item_id as operation_item_id,
  coalesce(operation_item.display_name, operation_item.name, operation.item_id::text) as operation_item_id_label,
  operation.location_id as operation_location_id,
  coalesce(operation_location.name, operation.location_id::text) as operation_location_id_label
from public.planning_operationmaterial src
left join public.planning_item item
  on item.account_id = src.account_id
 and item.id = src.item_id
left join public.planning_location location
  on location.account_id = src.account_id
 and location.id = src.location_id
left join public.planning_operation operation
  on operation.account_id = src.account_id
 and operation.id = src.operation_id
left join public.planning_item operation_item
  on operation_item.account_id = src.account_id
 and operation_item.id = operation.item_id
left join public.planning_location operation_location
  on operation_location.account_id = src.account_id
 and operation_location.id = operation.location_id;

grant select on public.planning_operation_view to authenticated, service_role;
grant select on public.planning_operationmaterial_view to authenticated, service_role;

insert into public.entity_design_views
  (code, schema_name, view_name, title, description, definition_sql,
   status, security_invoker, published_at, metadata)
values
  (
    'planning_operation_view', 'public', 'planning_operation_view',
    '工序关联视图', '展示工序及其物料、地点、上级工序、可用日历和关联数量。',
    $$select
  src.*,
  coalesce(calendar.name, src.available_id::text) as available_id_label,
  coalesce(item.display_name, item.name, src.item_id::text) as item_id_label,
  coalesce(location.name, src.location_id::text) as location_id_label,
  coalesce(owner_operation.name, src.owner_id::text) as owner_id_label,
  calendar.name as available_name,
  item.name as item_code,
  item.display_name as item_name,
  location.name as location_name,
  owner_operation.name as owner_name,
  (select count(*) from public.planning_suboperation suboperation where suboperation.account_id = src.account_id and suboperation.operation_id = src.id)::integer as suboperation_count,
  (select count(*) from public.planning_operationmaterial operation_material where operation_material.account_id = src.account_id and operation_material.operation_id = src.id)::integer as operationmaterial_count,
  (select count(*) from public.planning_operationresource operation_resource where operation_resource.account_id = src.account_id and operation_resource.operation_id = src.id)::integer as operationresource_count
from public.planning_operation src
left join public.planning_calendar calendar on calendar.account_id = src.account_id and calendar.id = src.available_id
left join public.planning_item item on item.account_id = src.account_id and item.id = src.item_id
left join public.planning_location location on location.account_id = src.account_id and location.id = src.location_id
left join public.planning_operation owner_operation on owner_operation.account_id = src.account_id and owner_operation.id = src.owner_id$$,
    'published', true, timezone('utc'::text, now()),
    jsonb_build_object(
      'sourceTable', 'public.planning_operation',
      'relationFields', jsonb_build_array('available_id', 'item_id', 'location_id', 'owner_id'),
      'displayFields', jsonb_build_array(
        'available_id_label', 'item_id_label', 'location_id_label', 'owner_id_label',
        'suboperation_count', 'operationmaterial_count', 'operationresource_count'
      )
    )
  ),
  (
    'planning_operationmaterial_view', 'public', 'planning_operationmaterial_view',
    '工序物料关联视图', '展示工序物料及其物料、地点和所属工序信息。',
    $$select
  src.*,
  coalesce(item.display_name, item.name, src.item_id::text) as item_id_label,
  coalesce(location.name, src.location_id::text) as location_id_label,
  coalesce(operation.name, src.operation_id::text) as operation_id_label,
  operation.name as operation_name,
  operation.type as operation_type,
  operation.item_id as operation_item_id,
  coalesce(operation_item.display_name, operation_item.name, operation.item_id::text) as operation_item_id_label,
  operation.location_id as operation_location_id,
  coalesce(operation_location.name, operation.location_id::text) as operation_location_id_label
from public.planning_operationmaterial src
left join public.planning_item item on item.account_id = src.account_id and item.id = src.item_id
left join public.planning_location location on location.account_id = src.account_id and location.id = src.location_id
left join public.planning_operation operation on operation.account_id = src.account_id and operation.id = src.operation_id
left join public.planning_item operation_item on operation_item.account_id = src.account_id and operation_item.id = operation.item_id
left join public.planning_location operation_location on operation_location.account_id = src.account_id and operation_location.id = operation.location_id$$,
    'published', true, timezone('utc'::text, now()),
    jsonb_build_object(
      'sourceTable', 'public.planning_operationmaterial',
      'relationFields', jsonb_build_array('item_id', 'location_id', 'operation_id'),
      'displayFields', jsonb_build_array(
        'item_id_label', 'location_id_label', 'operation_id_label',
        'operation_type', 'operation_item_id_label', 'operation_location_id_label'
      )
    )
  )
on conflict (code) do update set
  schema_name = excluded.schema_name,
  view_name = excluded.view_name,
  title = excluded.title,
  description = excluded.description,
  definition_sql = excluded.definition_sql,
  status = excluded.status,
  security_invoker = true,
  published_at = excluded.published_at,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

do $configure_pages$
declare
  page_record record;
  page_schema jsonb;
  configured_schema jsonb;
  configured_blocks jsonb;
  block_record record;
  block_value jsonb;
  columns_value jsonb;
  column_value jsonb;
  field_record record;
  v_grid_id text;
  v_view_name text;
  v_table_name text;
begin
  for page_record in
    select id, code, schema, view_name as existing_view_name, table_name as existing_table_name
    from public.lowcode_pages
    where code in (
      'planning_operation-list', 'planning_operation-edit',
      'planning_operationmaterial-list', 'planning_operationmaterial-edit'
    )
    for update
  loop
    page_schema := coalesce(page_record.schema, '{}'::jsonb);
    if page_record.code like 'planning_operationmaterial-%' then
      v_grid_id := 'planning_operationmaterial-grid';
      v_view_name := 'public.planning_operationmaterial_view';
      v_table_name := 'planning_operationmaterial';
    else
      v_grid_id := 'planning_operation-grid';
      v_view_name := 'public.planning_operation_view';
      v_table_name := 'planning_operation';
    end if;

    configured_schema := jsonb_set(
      jsonb_set(
        page_schema,
        array['dataSources', v_table_name || 'Rows', 'sourceType'],
        to_jsonb('view'::text), true
      ),
      array['dataSources', v_table_name || 'Rows', 'viewName'],
      to_jsonb(v_view_name), true
    );

    if page_record.code like '%-list' then
      configured_blocks := '[]'::jsonb;
      for block_record in
        select value from jsonb_array_elements(coalesce(configured_schema->'blocks', '[]'::jsonb))
      loop
        block_value := block_record.value;
        if block_value->>'id' = v_grid_id then
          block_value := jsonb_set(block_value, '{sourceType}', to_jsonb('view'::text), true);
          block_value := jsonb_set(block_value, '{viewName}', to_jsonb(v_view_name), true);
          block_value := jsonb_set(block_value, '{tableName}', to_jsonb(v_table_name), true);
          columns_value := coalesce(block_value#>'{schema,grid,columns}', '[]'::jsonb);

          if v_table_name = 'planning_operation' then
            for field_record in
              select * from (values
                ('available_id_label', '可用日历'),
                ('suboperation_count', '子工序数'),
                ('operationmaterial_count', '工序物料数'),
                ('operationresource_count', '工序资源数')
              ) as fields(field_name, field_title)
            loop
              if not exists (select 1 from jsonb_array_elements(columns_value) c where c->>'field' = field_record.field_name) then
                column_value := jsonb_build_object('field', field_record.field_name, 'title', field_record.field_title, 'minWidth', 160, 'showOverflow', 'tooltip', 'formatter', jsonb_build_object('type', 'number', 'locale', 'zh-CN', 'emptyText', '0'));
                if field_record.field_name = 'available_id_label' then
                  column_value := jsonb_set(column_value, '{formatter}', jsonb_build_object('type', 'text', 'emptyText', '-'), true);
                end if;
                columns_value := columns_value || jsonb_build_array(column_value);
              end if;
            end loop;
          else
            for field_record in
              select * from (values
                ('operation_type', '所属工序类型'),
                ('operation_item_id_label', '所属工序物料'),
                ('operation_location_id_label', '所属工序地点')
              ) as fields(field_name, field_title)
            loop
              if not exists (select 1 from jsonb_array_elements(columns_value) c where c->>'field' = field_record.field_name) then
                column_value := jsonb_build_object('field', field_record.field_name, 'title', field_record.field_title, 'minWidth', 180, 'showOverflow', 'tooltip', 'formatter', jsonb_build_object('type', 'text', 'emptyText', '-'));
                columns_value := columns_value || jsonb_build_array(column_value);
              end if;
            end loop;
          end if;

          block_value := jsonb_set(block_value, '{schema,grid,columns}', columns_value, true);
        end if;
        configured_blocks := configured_blocks || jsonb_build_array(block_value);
      end loop;
      configured_schema := jsonb_set(configured_schema, '{blocks}', configured_blocks, true);
    end if;

    if configured_schema is distinct from page_schema
       or page_record.existing_view_name is distinct from v_view_name
       or page_record.existing_table_name is distinct from v_table_name then
      update public.lowcode_pages
      set schema = configured_schema,
          view_name = v_view_name,
          table_name = v_table_name,
          version = version + 1,
          published_at = case when status = 'published' then timezone('utc'::text, now()) else published_at end,
          updated_at = timezone('utc'::text, now())
      where id = page_record.id;
    end if;
  end loop;
end;
$configure_pages$;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in (
  'planning_operation-list', 'planning_operation-edit',
  'planning_operationmaterial-list', 'planning_operationmaterial-edit'
)
on conflict (page_id, version) do update
set schema = excluded.schema,
    published_at = excluded.published_at;

do $validation$
begin
  if (
    select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'planning_operation_view'
      and column_name in ('available_id_label', 'suboperation_count', 'operationmaterial_count', 'operationresource_count')
  ) <> 4 then
    raise exception 'planning_operation_view is missing related columns.';
  end if;

  if (
    select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'planning_operationmaterial_view'
      and column_name in ('operation_type', 'operation_item_id_label', 'operation_location_id_label')
  ) <> 3 then
    raise exception 'planning_operationmaterial_view is missing operation relation columns.';
  end if;

  if (
    select count(*) from public.lowcode_pages
    where code in ('planning_operation-list', 'planning_operation-edit')
      and view_name = 'public.planning_operation_view'
      and table_name = 'planning_operation'
      and schema->'dataSources'->'planning_operationRows'->>'sourceType' = 'view'
      and schema->'dataSources'->'planning_operationRows'->>'viewName' = 'public.planning_operation_view'
  ) <> 2 then
    raise exception 'Operation pages were not bound to planning_operation_view.';
  end if;

  if (
    select count(*) from public.lowcode_pages
    where code in ('planning_operationmaterial-list', 'planning_operationmaterial-edit')
      and view_name = 'public.planning_operationmaterial_view'
      and table_name = 'planning_operationmaterial'
      and schema->'dataSources'->'planning_operationmaterialRows'->>'sourceType' = 'view'
      and schema->'dataSources'->'planning_operationmaterialRows'->>'viewName' = 'public.planning_operationmaterial_view'
  ) <> 2 then
    raise exception 'Operation-material pages were not bound to planning_operationmaterial_view.';
  end if;
end;
$validation$;

insert into supabase_migrations.schema_migrations(version, name, statements)
values (
  '20260903120000',
  'planning_operation_relation_view_binding',
  array['Bound operation and operation-material pages to relation views and added related grid columns using DIRECT_URL']
)
on conflict (version) do update
set name = excluded.name,
    statements = excluded.statements;

commit;

select pg_catalog.pg_notify('pgrst', 'reload schema');
