-- Bind the sales-order main grid to a relation-aware view and expose
-- fulfillment columns that are not stored on the order header itself.

begin;

create or replace view public.sales_orders_related_view
with (security_invoker = true)
as
select
  orders.*,
  coalesce(line_summary.line_count, 0)::integer as line_count,
  coalesce(line_summary.ordered_qty, 0)::numeric as line_ordered_qty,
  coalesce(line_summary.delivered_qty, 0)::numeric as line_delivered_qty,
  coalesce(line_summary.open_qty, 0)::numeric as line_open_qty,
  line_summary.latest_delivery_date,
  case
    when coalesce(line_summary.line_count, 0) = 0 then 'empty'
    when coalesce(line_summary.open_qty, 0) <= 0 then 'completed'
    when coalesce(line_summary.delivered_qty, 0) > 0 then 'partial'
    else 'open'
  end as fulfillment_status
from public.sales_orders orders
left join lateral (
  select
    count(*)::integer as line_count,
    coalesce(sum(lines.ordered_qty), 0)::numeric as ordered_qty,
    coalesce(sum(lines.delivered_qty), 0)::numeric as delivered_qty,
    coalesce(sum(lines.open_qty), 0)::numeric as open_qty,
    max(lines.delivery_date) as latest_delivery_date
  from public.sales_order_lines lines
  where lines.account_id = orders.account_id
    and lines.order_id = orders.id
) line_summary on true;

grant select on public.sales_orders_related_view to authenticated, service_role;

insert into public.entity_design_tables
  (code, schema_name, table_name, title, description, primary_key, status, metadata)
values
  ('sales_orders', 'public', 'sales_orders', '销售订单',
   '销售订单主表及订单履约汇总。', 'id', 'active',
   jsonb_build_object('relatedView', 'public.sales_orders_related_view')),
  ('sales_order_lines', 'public', 'sales_order_lines', '销售订单明细',
   '销售订单的物料、数量、价格和交付明细。', 'id', 'active', '{}'::jsonb)
on conflict (schema_name, table_name) do update set
  title = excluded.title,
  description = excluded.description,
  metadata = public.entity_design_tables.metadata || excluded.metadata,
  updated_at = timezone('utc'::text, now());

with table_ids as (
  select id, table_name
  from public.entity_design_tables
  where schema_name = 'public' and table_name in ('sales_orders', 'sales_order_lines')
)
insert into public.entity_design_columns
  (table_id, column_name, label, data_type, storage_kind, is_primary_key, sort_order, metadata)
select
  table_ids.id,
  fields.column_name,
  fields.label,
  fields.data_type,
  fields.storage_kind,
  fields.is_primary_key,
  fields.sort_order,
  fields.metadata
from table_ids
join (values
  ('sales_orders', 'id', '主键', 'uuid', 'physical', true, 0, '{}'::jsonb),
  ('sales_orders', 'doc_no', '订单号', 'text', 'physical', false, 10, '{}'::jsonb),
  ('sales_orders', 'customer_name', '客户名称', 'text', 'physical', false, 20, '{}'::jsonb),
  ('sales_orders', 'status', '订单状态', 'text', 'physical', false, 30, '{}'::jsonb),
  ('sales_orders', 'total_qty', '订单数量', 'numeric', 'physical', false, 40, '{}'::jsonb),
  ('sales_orders', 'line_count', '明细行数', 'integer', 'virtual', false, 50, jsonb_build_object('sourceView', 'public.sales_orders_related_view')),
  ('sales_orders', 'line_open_qty', '未交数量', 'numeric', 'virtual', false, 60, jsonb_build_object('sourceView', 'public.sales_orders_related_view')),
  ('sales_orders', 'latest_delivery_date', '最近交期', 'date', 'virtual', false, 70, jsonb_build_object('sourceView', 'public.sales_orders_related_view')),
  ('sales_orders', 'fulfillment_status', '履约状态', 'text', 'virtual', false, 80, jsonb_build_object('sourceView', 'public.sales_orders_related_view')),
  ('sales_order_lines', 'id', '主键', 'uuid', 'physical', true, 0, '{}'::jsonb),
  ('sales_order_lines', 'order_id', '所属订单', 'uuid', 'physical', false, 10, '{}'::jsonb),
  ('sales_order_lines', 'item_code', '物料编码', 'text', 'physical', false, 20, '{}'::jsonb),
  ('sales_order_lines', 'ordered_qty', '订购数量', 'numeric', 'physical', false, 30, '{}'::jsonb),
  ('sales_order_lines', 'open_qty', '未交数量', 'numeric', 'physical', false, 40, '{}'::jsonb),
  ('sales_order_lines', 'delivery_date', '交货日期', 'date', 'physical', false, 50, '{}'::jsonb)
) as fields(table_name, column_name, label, data_type, storage_kind, is_primary_key, sort_order, metadata)
  on fields.table_name = table_ids.table_name
on conflict (table_id, column_name) do update set
  label = excluded.label,
  data_type = excluded.data_type,
  storage_kind = excluded.storage_kind,
  is_primary_key = excluded.is_primary_key,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

insert into public.entity_design_views
  (code, schema_name, view_name, title, description, definition_sql,
   status, security_invoker, published_at, metadata)
values (
  'sales_orders_related_view', 'public', 'sales_orders_related_view',
  '销售订单关联视图', '订单主表关联明细后的履约汇总视图。',
  'select orders.*, line_count, line_ordered_qty, line_delivered_qty, line_open_qty, latest_delivery_date, fulfillment_status from public.sales_orders orders left join ...',
  'published', true, timezone('utc'::text, now()),
  jsonb_build_object(
    'sourceTable', 'public.sales_orders',
    'relatedTables', jsonb_build_array('public.sales_order_lines'),
    'columns', jsonb_build_array('line_count', 'line_ordered_qty', 'line_delivered_qty', 'line_open_qty', 'latest_delivery_date', 'fulfillment_status')
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

with source_columns as (
  select
    source_table.id as source_table_id,
    source_column.id as source_column_id,
    target_table.id as target_table_id,
    target_column.id as target_column_id
  from public.entity_design_tables source_table
  join public.entity_design_columns source_column
    on source_column.table_id = source_table.id and source_column.column_name = 'order_id'
  join public.entity_design_tables target_table
    on target_table.schema_name = 'public' and target_table.table_name = 'sales_orders'
  join public.entity_design_columns target_column
    on target_column.table_id = target_table.id and target_column.column_name = 'id'
  where source_table.schema_name = 'public' and source_table.table_name = 'sales_order_lines'
)
insert into public.entity_design_relations
  (source_table_id, source_column_id, source_column_name,
   target_table_id, target_column_id, target_column_name,
   relation_type, is_enforced, constraint_name, on_delete, metadata)
select source_table_id, source_column_id, 'order_id', target_table_id, target_column_id,
       'id', 'many_to_one', true, 'sales_order_lines_order_id_account_id_fkey',
       'cascade', jsonb_build_object('relatedView', 'public.sales_orders_related_view')
from source_columns
on conflict (source_table_id, source_column_name, target_table_id, target_column_name)
do update set
  source_column_id = excluded.source_column_id,
  target_column_id = excluded.target_column_id,
  relation_type = excluded.relation_type,
  is_enforced = excluded.is_enforced,
  constraint_name = excluded.constraint_name,
  on_delete = excluded.on_delete,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

-- Point the main page data source at the related view and append its virtual columns.
update public.lowcode_pages
set
  schema = jsonb_set(
    jsonb_set(
      jsonb_set(schema, '{dataSources,salesOrders,sourceType}', '"view"'::jsonb, true),
      '{dataSources,salesOrders,viewName}', '"public.sales_orders_related_view"'::jsonb, true
    ),
    '{dataSources,salesOrders,postData,viewName}', '"public.sales_orders_related_view"'::jsonb, true
  ),
  view_name = 'public.sales_orders_related_view',
  table_name = 'sales_orders',
  version = version + 1,
  published_at = case when status = 'published' then timezone('utc'::text, now()) else published_at end,
  updated_at = timezone('utc'::text, now())
where code = 'sales-orders';

update public.lowcode_pages
set schema = jsonb_set(
  schema,
  '{blocks}',
  (
    select jsonb_agg(
      case when block->>'id' = 'sales-order-grid' then
        jsonb_set(block, '{schema,grid,columns}',
          (block#>'{schema,grid,columns}') || '[
            {"field":"line_count","title":"明细行数","width":100,"align":"right","formatter":{"type":"number","emptyText":"0"}},
            {"field":"line_open_qty","title":"未交数量","width":120,"align":"right","formatter":{"type":"number","emptyText":"0"}},
            {"field":"latest_delivery_date","title":"最近交期","width":130},
            {"field":"fulfillment_status","title":"履约状态","width":110,"align":"center"}
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
where code = 'sales-orders'
  and jsonb_typeof(schema->'blocks') = 'array';

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'sales-orders'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

select pg_notify('pgrst', 'reload schema');

commit;
