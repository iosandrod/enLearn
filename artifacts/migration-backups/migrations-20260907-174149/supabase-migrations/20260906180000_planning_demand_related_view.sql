-- Make the demand list use a relation-aware read view.

begin;

create or replace view public.planning_demand_related_view
with (security_invoker = true)
as
select
  demand.*,
  coalesce(nullif(customer.name, ''), demand.customer_id::text) as customer_name,
  coalesce(nullif(item.display_name, ''), nullif(item.name, ''), demand.item_id::text) as item_name,
  coalesce(nullif(location.name, ''), demand.location_id::text) as location_name,
  coalesce(nullif(operation.name, ''), demand.operation_id::text) as operation_name
from public.planning_demand demand
left join public.planning_customer customer
  on customer.id = demand.customer_id and customer.account_id = demand.account_id
left join public.planning_item item
  on item.id = demand.item_id and item.account_id = demand.account_id
left join public.planning_location location
  on location.id = demand.location_id and location.account_id = demand.account_id
left join public.planning_operation operation
  on operation.id = demand.operation_id and operation.account_id = demand.account_id;

grant select on public.planning_demand_related_view to authenticated, service_role;

insert into public.entity_design_tables
  (code, schema_name, table_name, title, description, primary_key, status, metadata)
values (
  'planning_demand', 'public', 'planning_demand', '需求',
  '客户需求及其物料、地点、交付工序关联信息。', 'id', 'active',
  jsonb_build_object('relatedView', 'public.planning_demand_related_view')
)
on conflict (schema_name, table_name) do update set
  title = excluded.title,
  description = excluded.description,
  metadata = public.entity_design_tables.metadata || excluded.metadata,
  updated_at = timezone('utc'::text, now());

insert into public.entity_design_views
  (code, schema_name, view_name, title, description, definition_sql,
   status, security_invoker, published_at, metadata)
values (
  'planning_demand_related_view', 'public', 'planning_demand_related_view',
  '需求关联视图', '展示需求关联的客户、物料、地点和交付工序名称。',
  'select demand.*, customer_name, item_name, location_name, operation_name from public.planning_demand_related_view',
  'published', true, timezone('utc'::text, now()),
  jsonb_build_object(
    'sourceTable', 'public.planning_demand',
    'relatedTables', jsonb_build_array(
      'public.planning_customer', 'public.planning_item',
      'public.planning_location', 'public.planning_operation'
    ),
    'displayFields', jsonb_build_array(
      'customer_name', 'item_name', 'location_name', 'operation_name'
    )
  )
)
on conflict (code) do update set
  title = excluded.title,
  description = excluded.description,
  definition_sql = excluded.definition_sql,
  status = excluded.status,
  security_invoker = true,
  published_at = excluded.published_at,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

-- Register the relation columns in the entity designer.
with table_row as (
  select id from public.entity_design_tables
  where schema_name = 'public' and table_name = 'planning_demand'
)
insert into public.entity_design_columns
  (table_id, column_name, label, data_type, storage_kind, sort_order, metadata)
select table_row.id, fields.column_name, fields.label, fields.data_type,
       fields.storage_kind, fields.sort_order, fields.metadata
from table_row
cross join (values
  ('customer_id', '客户', 'uuid', 'physical', 200, '{}'::jsonb),
  ('item_id', '物料', 'uuid', 'physical', 210, '{}'::jsonb),
  ('location_id', '地点', 'uuid', 'physical', 220, '{}'::jsonb),
  ('operation_id', '交付工序', 'uuid', 'physical', 230, '{}'::jsonb),
  ('customer_name', '客户名称', 'text', 'virtual', 240, jsonb_build_object('sourceView', 'public.planning_demand_related_view')),
  ('item_name', '物料名称', 'text', 'virtual', 250, jsonb_build_object('sourceView', 'public.planning_demand_related_view')),
  ('location_name', '地点名称', 'text', 'virtual', 260, jsonb_build_object('sourceView', 'public.planning_demand_related_view')),
  ('operation_name', '交付工序名称', 'text', 'virtual', 270, jsonb_build_object('sourceView', 'public.planning_demand_related_view')),
  ('plannedquantity', '已计划量', 'numeric', 'physical', 280, '{}'::jsonb),
  ('deliverydate', '计划交期', 'timestamptz', 'physical', 290, '{}'::jsonb),
  ('source_doc_no', '来源单号', 'text', 'physical', 300, '{}'::jsonb),
  ('sync_status', '同步状态', 'text', 'physical', 310, '{}'::jsonb)
) as fields(column_name, label, data_type, storage_kind, sort_order, metadata) on true
on conflict (table_id, column_name) do update set
  label = excluded.label,
  data_type = excluded.data_type,
  storage_kind = excluded.storage_kind,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

update public.lowcode_pages
set
  schema = jsonb_set(
    jsonb_set(
      jsonb_set(schema, '{dataSources,planning_demandRows,sourceType}', '"view"'::jsonb, true),
      '{dataSources,planning_demandRows,viewName}', '"public.planning_demand_related_view"'::jsonb, true
    ),
    '{dataSources,planning_demandRows,tableName}', '"planning_demand_related_view"'::jsonb, true
  ),
  view_name = 'public.planning_demand_related_view',
  table_name = 'planning_demand',
  version = version + 1,
  published_at = case when status = 'published' then timezone('utc'::text, now()) else published_at end,
  updated_at = timezone('utc'::text, now())
where code = 'planning_demand-list';

update public.lowcode_pages
set schema = jsonb_set(
  schema,
  '{blocks}',
  (
    select jsonb_agg(
      case when block->>'id' = 'planning_demand-grid' then
        jsonb_set(block, '{schema,grid,columns}',
          (block#>'{schema,grid,columns}') || '[
            {"field":"operation_name","title":"交付工序","minWidth":180,"showOverflow":"tooltip"},
            {"field":"plannedquantity","title":"已计划量","minWidth":120,"align":"right","formatter":{"type":"number","emptyText":"0"}},
            {"field":"deliverydate","title":"计划交期","minWidth":180,"formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},
            {"field":"source_doc_no","title":"来源单号","minWidth":160,"showOverflow":"tooltip"},
            {"field":"sync_status","title":"同步状态","minWidth":120,"align":"center"}
          ]'::jsonb, true)
      else block end
      order by ordinal
    )
    from jsonb_array_elements(schema->'blocks') with ordinality as blocks(block, ordinal)
  ),
  true
),
version = version + 1,
published_at = case when status = 'published' then timezone('utc'::text, now()) else published_at end,
updated_at = timezone('utc'::text, now())
where code = 'planning_demand-list'
  and jsonb_typeof(schema->'blocks') = 'array';

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'planning_demand-list'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

select pg_notify('pgrst', 'reload schema');

commit;
