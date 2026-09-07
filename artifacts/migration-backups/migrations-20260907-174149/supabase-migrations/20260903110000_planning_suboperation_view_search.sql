-- Bind the suboperation list page to a relation-aware read view and add
-- parent/child operation display fields plus a database-configured filter form.

begin;

create or replace view public.planning_suboperation_view
with (security_invoker = true)
as
select
  src.*,
  coalesce(parent_operation.name, src.operation_id::text) as operation_id_label,
  coalesce(child_operation.name, src.suboperation_id::text) as suboperation_id_label,
  parent_operation.name as operation_name,
  parent_operation.type as operation_type,
  parent_operation.item_id as operation_item_id,
  coalesce(parent_item.display_name, parent_item.name, parent_operation.item_id::text) as operation_item_id_label,
  parent_operation.location_id as operation_location_id,
  coalesce(parent_location.name, parent_operation.location_id::text) as operation_location_id_label,
  child_operation.name as suboperation_name,
  child_operation.type as suboperation_type,
  child_operation.item_id as suboperation_item_id,
  coalesce(child_item.display_name, child_item.name, child_operation.item_id::text) as suboperation_item_id_label,
  child_operation.location_id as suboperation_location_id,
  coalesce(child_location.name, child_operation.location_id::text) as suboperation_location_id_label
from public.planning_suboperation src
left join public.planning_operation parent_operation
  on parent_operation.account_id = src.account_id
 and parent_operation.id = src.operation_id
left join public.planning_operation child_operation
  on child_operation.account_id = src.account_id
 and child_operation.id = src.suboperation_id
left join public.planning_item parent_item
  on parent_item.account_id = src.account_id
 and parent_item.id = parent_operation.item_id
left join public.planning_location parent_location
  on parent_location.account_id = src.account_id
 and parent_location.id = parent_operation.location_id
left join public.planning_item child_item
  on child_item.account_id = src.account_id
 and child_item.id = child_operation.item_id
left join public.planning_location child_location
  on child_location.account_id = src.account_id
 and child_location.id = child_operation.location_id;

grant select on public.planning_suboperation_view to authenticated, service_role;

insert into public.entity_design_views
  (code, schema_name, view_name, title, description, definition_sql,
   status, security_invoker, published_at, metadata)
values
  (
    'planning_suboperation_view',
    'public',
    'planning_suboperation_view',
    '子工序关联视图',
    '展示子工序关系及父工序、子工序的类型、物料和地点名称。',
    $$select
  src.*,
  coalesce(parent_operation.name, src.operation_id::text) as operation_id_label,
  coalesce(child_operation.name, src.suboperation_id::text) as suboperation_id_label,
  parent_operation.name as operation_name,
  parent_operation.type as operation_type,
  parent_operation.item_id as operation_item_id,
  coalesce(parent_item.display_name, parent_item.name, parent_operation.item_id::text) as operation_item_id_label,
  parent_operation.location_id as operation_location_id,
  coalesce(parent_location.name, parent_operation.location_id::text) as operation_location_id_label,
  child_operation.name as suboperation_name,
  child_operation.type as suboperation_type,
  child_operation.item_id as suboperation_item_id,
  coalesce(child_item.display_name, child_item.name, child_operation.item_id::text) as suboperation_item_id_label,
  child_operation.location_id as suboperation_location_id,
  coalesce(child_location.name, child_operation.location_id::text) as suboperation_location_id_label
from public.planning_suboperation src
left join public.planning_operation parent_operation on parent_operation.account_id = src.account_id and parent_operation.id = src.operation_id
left join public.planning_operation child_operation on child_operation.account_id = src.account_id and child_operation.id = src.suboperation_id
left join public.planning_item parent_item on parent_item.account_id = src.account_id and parent_item.id = parent_operation.item_id
left join public.planning_location parent_location on parent_location.account_id = src.account_id and parent_location.id = parent_operation.location_id
left join public.planning_item child_item on child_item.account_id = src.account_id and child_item.id = child_operation.item_id
left join public.planning_location child_location on child_location.account_id = src.account_id and child_location.id = child_operation.location_id$$,
    'published',
    true,
    timezone('utc'::text, now()),
    jsonb_build_object(
      'sourceTable', 'public.planning_suboperation',
      'relationFields', jsonb_build_array('operation_id', 'suboperation_id'),
      'displayFields', jsonb_build_array(
        'operation_id_label', 'suboperation_id_label',
        'operation_type', 'operation_item_id_label', 'operation_location_id_label',
        'suboperation_type', 'suboperation_item_id_label', 'suboperation_location_id_label'
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

do $configure_page$
declare
  page_record record;
  page_schema jsonb;
  configured_schema jsonb;
  current_blocks jsonb;
  configured_blocks jsonb;
  block_record record;
  field_record record;
  block_value jsonb;
  columns_value jsonb;
  column_value jsonb;
  search_block jsonb := jsonb_build_object(
    'id', 'planning_suboperation-search',
    'kind', 'searchForm',
    'title', '子工序查询',
    'targetSourceKey', 'planning_suboperationRows',
    'initialValues', jsonb_build_object(
      'operation_id', '',
      'suboperation_id', '',
      'priority', null
    ),
    'schema', jsonb_build_object(
      'columns', 4,
      'fields', jsonb_build_array(
        jsonb_build_object(
          'field', 'operation_id',
          'label', '父工序',
          'component', 'vxe-select',
          'optionsSourceKey', 'planning_operationOptions',
          'optionProps', jsonb_build_object('label', 'label', 'value', 'id'),
          'props', jsonb_build_object('clearable', true, 'filterable', true, 'placeholder', '请选择父工序')
        ),
        jsonb_build_object(
          'field', 'suboperation_id',
          'label', '子工序',
          'component', 'vxe-select',
          'optionsSourceKey', 'planning_operationOptions',
          'optionProps', jsonb_build_object('label', 'label', 'value', 'id'),
          'props', jsonb_build_object('clearable', true, 'filterable', true, 'placeholder', '请选择子工序')
        ),
        jsonb_build_object(
          'field', 'priority',
          'label', '优先级',
          'component', 'vxe-input',
          'props', jsonb_build_object('clearable', true, 'type', 'number', 'placeholder', '请输入优先级')
        )
      ),
      'actions', jsonb_build_array(
        jsonb_build_object('code', 'submit', 'label', '查询', 'type', 'submit', 'status', 'primary', 'icon', 'ri-search-line'),
        jsonb_build_object('code', 'reset', 'label', '重置', 'type', 'reset', 'icon', 'ri-refresh-line')
      )
    )
  );
begin
  select id, schema, view_name, table_name
    into page_record
  from public.lowcode_pages
  where code = 'planning_suboperation-list'
  for update;

  if not found then
    raise exception 'planning_suboperation-list page was not found.';
  end if;

  page_schema := coalesce(page_record.schema, '{}'::jsonb);
  configured_schema := jsonb_set(
    jsonb_set(
      page_schema,
      '{dataSources,planning_suboperationRows,sourceType}',
      to_jsonb('view'::text),
      true
    ),
    '{dataSources,planning_suboperationRows,viewName}',
    to_jsonb('public.planning_suboperation_view'::text),
    true
  );

  current_blocks := coalesce(configured_schema->'blocks', '[]'::jsonb);
  configured_blocks := '[]'::jsonb;

  for block_record in
    select value
    from jsonb_array_elements(current_blocks)
  loop
    block_value := block_record.value;

    if block_value->>'id' = 'planning_suboperation-grid' then
      block_value := jsonb_set(block_value, '{sourceType}', to_jsonb('view'::text), true);
      block_value := jsonb_set(block_value, '{viewName}', to_jsonb('public.planning_suboperation_view'::text), true);
      block_value := jsonb_set(block_value, '{tableName}', to_jsonb('planning_suboperation'::text), true);
      columns_value := coalesce(block_value#>'{schema,grid,columns}', '[]'::jsonb);

      for field_record in
        select *
        from (values
          ('operation_type', '父工序类型'),
          ('operation_item_id_label', '父工序物料'),
          ('operation_location_id_label', '父工序地点'),
          ('suboperation_type', '子工序类型'),
          ('suboperation_item_id_label', '子工序物料'),
          ('suboperation_location_id_label', '子工序地点')
        ) as fields(field_name, field_title)
      loop
        if not exists (
          select 1
          from jsonb_array_elements(columns_value) existing_column
          where existing_column->>'field' = field_record.field_name
        ) then
          column_value := jsonb_build_object(
            'field', field_record.field_name,
            'title', field_record.field_title,
            'minWidth', 180,
            'showOverflow', 'tooltip',
            'formatter', jsonb_build_object('type', 'text', 'emptyText', '-')
          );
          columns_value := columns_value || jsonb_build_array(column_value);
        end if;
      end loop;

      block_value := jsonb_set(block_value, '{schema,grid,columns}', columns_value, true);
    end if;

    if block_value->>'id' = 'planning_suboperation-grid'
       and not exists (
         select 1
         from jsonb_array_elements(current_blocks) existing_block
         where existing_block->>'id' = 'planning_suboperation-search'
       ) then
      configured_blocks := configured_blocks || jsonb_build_array(search_block);
    end if;

    configured_blocks := configured_blocks || jsonb_build_array(block_value);
  end loop;

  if not exists (
    select 1
    from jsonb_array_elements(configured_blocks) existing_block
    where existing_block->>'id' = 'planning_suboperation-search'
  ) then
    configured_blocks := configured_blocks || jsonb_build_array(search_block);
  end if;

  configured_schema := jsonb_set(configured_schema, '{blocks}', configured_blocks, true);

  if configured_schema is distinct from page_schema
     or page_record.view_name is distinct from 'public.planning_suboperation_view'
     or page_record.table_name is distinct from 'planning_suboperation' then
    update public.lowcode_pages
    set schema = configured_schema,
        view_name = 'public.planning_suboperation_view',
        table_name = 'planning_suboperation',
        version = version + 1,
        published_at = case when status = 'published' then timezone('utc'::text, now()) else published_at end,
        updated_at = timezone('utc'::text, now())
    where id = page_record.id;
  end if;
end;
$configure_page$;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'planning_suboperation-list'
on conflict (page_id, version) do update
set schema = excluded.schema,
    published_at = excluded.published_at;

do $validation$
begin
  if not exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'planning_suboperation_view'
      and relation.relkind = 'v'
  ) then
    raise exception 'planning_suboperation_view was not created.';
  end if;

  if (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'planning_suboperation_view'
      and column_name in (
        'operation_id_label', 'suboperation_id_label',
        'operation_type', 'operation_item_id_label', 'operation_location_id_label',
        'suboperation_type', 'suboperation_item_id_label', 'suboperation_location_id_label'
      )
  ) <> 8 then
    raise exception 'planning_suboperation_view is missing parent/child display columns.';
  end if;

  if (
    select count(*)
    from public.lowcode_pages
    where code = 'planning_suboperation-list'
      and view_name = 'public.planning_suboperation_view'
      and table_name = 'planning_suboperation'
      and schema->'dataSources'->'planning_suboperationRows'->>'sourceType' = 'view'
      and schema->'dataSources'->'planning_suboperationRows'->>'viewName' = 'public.planning_suboperation_view'
      and exists (
        select 1
        from jsonb_array_elements(schema->'blocks') block
        where block->>'id' = 'planning_suboperation-search'
          and block->>'kind' = 'searchForm'
      )
      and exists (
        select 1
        from jsonb_array_elements(schema->'blocks') block
        where block->>'id' = 'planning_suboperation-grid'
          and block->>'sourceType' = 'view'
          and block->>'viewName' = 'public.planning_suboperation_view'
      )
  ) <> 1 then
    raise exception 'planning_suboperation-list was not bound to the relation view and search form.';
  end if;
end;
$validation$;

insert into supabase_migrations.schema_migrations(version, name, statements)
values (
  '20260903110000',
  'planning_suboperation_view_search',
  array['Bound planning_suboperation list to relation view and added database-configured search form using DIRECT_URL']
)
on conflict (version) do update
set name = excluded.name,
    statements = excluded.statements;

commit;

select pg_catalog.pg_notify('pgrst', 'reload schema');
