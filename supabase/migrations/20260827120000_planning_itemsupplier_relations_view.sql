-- Register the planning item-supplier relations and expose a readable view.
-- The physical table remains the write target for the planning CRUD service.

begin;

create or replace view public.planning_itemsupplier_view
with (security_invoker = true)
as
select
  supply.id,
  supply.account_id,
  supply.item_id,
  item.name as item_code,
  item.display_name as item_name,
  coalesce(item.display_name, item.name, supply.item_id::text) as item_id_label,
  supply.location_id,
  location.name as location_name,
  coalesce(location.name, supply.location_id::text) as location_id_label,
  supply.supplier_id,
  supplier.name as supplier_name,
  coalesce(supplier.name, supply.supplier_id::text) as supplier_id_label,
  supply.resource_id,
  resource.name as resource_name,
  coalesce(resource.name, supply.resource_id::text) as resource_id_label,
  supply.leadtime,
  supply.extra_safety_leadtime,
  supply.hard_safety_leadtime,
  supply.sizeminimum,
  supply.sizemultiple,
  supply.sizemaximum,
  supply.batchwindow,
  supply.cost,
  supply.priority,
  supply.effective_start,
  supply.effective_end,
  supply.resource_qty,
  supply.fence,
  supply.source,
  supply.lastmodified,
  supply.created_by,
  supply.updated_by,
  supply.created_at,
  supply.updated_at
from public.planning_itemsupplier supply
left join public.planning_item item
  on item.account_id = supply.account_id
 and item.id = supply.item_id
left join public.planning_location location
  on location.account_id = supply.account_id
 and location.id = supply.location_id
left join public.planning_supplier supplier
  on supplier.account_id = supply.account_id
 and supplier.id = supply.supplier_id
left join public.planning_resource resource
  on resource.account_id = supply.account_id
 and resource.id = supply.resource_id;

grant select on public.planning_itemsupplier_view to authenticated, service_role;

do $metadata$
declare
  v_source_table_id uuid;
  v_target_table_id uuid;
  v_source_column_id uuid;
  v_target_column_id uuid;
  relation_record record;
begin
  -- Keep the physical planning tables available to the entity designer.
  insert into public.entity_design_tables (code, schema_name, table_name, title, description, primary_key)
  values
    ('planning_itemsupplier', 'public', 'planning_itemsupplier', '物料供应', '物料、供应商和地点之间的采购规则。', 'id'),
    ('planning_item', 'public', 'planning_item', '物料', '原料、半成品和成品物料。', 'id'),
    ('planning_location', 'public', 'planning_location', '地点', '工厂、仓库和其他计划地点。', 'id'),
    ('planning_supplier', 'public', 'planning_supplier', '供应商', '采购来源与供应商主数据。', 'id'),
    ('planning_resource', 'public', 'planning_resource', '资源', '设备、人员、产线等能力资源。', 'id')
  on conflict (schema_name, table_name) do update
    set title = excluded.title,
        description = excluded.description,
        primary_key = excluded.primary_key,
        updated_at = timezone('utc'::text, now());

  -- Add the relation columns to the designer catalog when they are absent.
  insert into public.entity_design_columns (
    table_id, column_name, label, data_type, storage_kind,
    is_required, is_primary_key, sort_order
  )
  select tables.id, fields.column_name, fields.label, fields.data_type, 'physical',
    fields.is_required, fields.is_primary_key, fields.sort_order
  from (values
    ('planning_itemsupplier', 'id', '编号', 'uuid', false, true, 0),
    ('planning_itemsupplier', 'account_id', '账套', 'uuid', true, false, 1),
    ('planning_itemsupplier', 'item_id', '物料', 'uuid', true, false, 10),
    ('planning_itemsupplier', 'location_id', '地点', 'uuid', false, false, 20),
    ('planning_itemsupplier', 'supplier_id', '供应商', 'uuid', true, false, 30),
    ('planning_itemsupplier', 'resource_id', '资源', 'uuid', false, false, 40),
    ('planning_item', 'id', '编号', 'uuid', false, true, 0),
    ('planning_item', 'name', '物料编码', 'text', true, false, 10),
    ('planning_item', 'display_name', '物料名称', 'text', true, false, 11),
    ('planning_location', 'id', '编号', 'uuid', false, true, 0),
    ('planning_location', 'name', '名称', 'text', true, false, 10),
    ('planning_supplier', 'id', '编号', 'uuid', false, true, 0),
    ('planning_supplier', 'name', '名称', 'text', true, false, 10),
    ('planning_resource', 'id', '编号', 'uuid', false, true, 0),
    ('planning_resource', 'name', '名称', 'text', true, false, 10)
  ) as fields(table_code, column_name, label, data_type, is_required, is_primary_key, sort_order)
  join public.entity_design_tables tables on tables.code = fields.table_code
  on conflict (table_id, column_name) do update
    set label = excluded.label,
        data_type = excluded.data_type,
        is_required = excluded.is_required,
        is_primary_key = excluded.is_primary_key,
        sort_order = excluded.sort_order,
        updated_at = timezone('utc'::text, now());

  -- Associate each foreign key with the corresponding target table field.
  for relation_record in
    select * from (values
      ('item_id', 'planning_item', 'restrict', 'planning_itemsupplier_item_id_account_fk'),
      ('location_id', 'planning_location', 'set null', 'planning_itemsupplier_location_id_account_fk'),
      ('supplier_id', 'planning_supplier', 'restrict', 'planning_itemsupplier_supplier_id_account_fk'),
      ('resource_id', 'planning_resource', 'set null', 'planning_itemsupplier_resource_id_account_fk')
    ) as relations(source_column_name, target_code, on_delete, constraint_name)
  loop
    select id into v_source_table_id from public.entity_design_tables
    where code = 'planning_itemsupplier';
    select id into v_target_table_id from public.entity_design_tables
    where code = relation_record.target_code;
    select id into v_source_column_id from public.entity_design_columns
    where table_id = v_source_table_id and column_name = relation_record.source_column_name;
    select id into v_target_column_id from public.entity_design_columns
    where table_id = v_target_table_id and column_name = 'id';

    insert into public.entity_design_relations (
      source_table_id, source_column_id, source_column_name,
      target_table_id, target_column_id, target_column_name,
      relation_type, is_enforced, constraint_name, on_delete, metadata
    ) values (
      v_source_table_id, v_source_column_id, relation_record.source_column_name,
      v_target_table_id, v_target_column_id, 'id',
      'many_to_one', true, relation_record.constraint_name,
      relation_record.on_delete, '{}'::jsonb
    )
    on conflict (source_table_id, source_column_name, target_table_id, target_column_name)
    do update set
      source_column_id = excluded.source_column_id,
      target_column_id = excluded.target_column_id,
      relation_type = excluded.relation_type,
      is_enforced = excluded.is_enforced,
      constraint_name = excluded.constraint_name,
      on_delete = excluded.on_delete,
      updated_at = timezone('utc'::text, now());
  end loop;
end
$metadata$;

insert into public.entity_design_views (
  code, schema_name, view_name, title, description, definition_sql,
  status, security_invoker, published_at, metadata
) values (
  'planning_itemsupplier_view', 'public', 'planning_itemsupplier_view',
  '物料供应关联视图', '展示物料供应及其物料、地点、供应商和资源名称。',
  $$select
  supply.id,
  supply.account_id,
  supply.item_id,
  item.name as item_code,
  item.display_name as item_name,
  coalesce(item.display_name, item.name, supply.item_id::text) as item_id_label,
  supply.location_id,
  location.name as location_name,
  coalesce(location.name, supply.location_id::text) as location_id_label,
  supply.supplier_id,
  supplier.name as supplier_name,
  coalesce(supplier.name, supply.supplier_id::text) as supplier_id_label,
  supply.resource_id,
  resource.name as resource_name,
  coalesce(resource.name, supply.resource_id::text) as resource_id_label,
  supply.leadtime,
  supply.extra_safety_leadtime,
  supply.hard_safety_leadtime,
  supply.sizeminimum,
  supply.sizemultiple,
  supply.sizemaximum,
  supply.batchwindow,
  supply.cost,
  supply.priority,
  supply.effective_start,
  supply.effective_end,
  supply.resource_qty,
  supply.fence,
  supply.source,
  supply.lastmodified,
  supply.created_by,
  supply.updated_by,
  supply.created_at,
  supply.updated_at
from public.planning_itemsupplier supply
left join public.planning_item item on item.account_id = supply.account_id and item.id = supply.item_id
left join public.planning_location location on location.account_id = supply.account_id and location.id = supply.location_id
left join public.planning_supplier supplier on supplier.account_id = supply.account_id and supplier.id = supply.supplier_id
left join public.planning_resource resource on resource.account_id = supply.account_id and resource.id = supply.resource_id$$,
  'published', true, timezone('utc'::text, now()),
  '{"sourceTable":"public.planning_itemsupplier","relationFields":["item_id","location_id","supplier_id","resource_id"]}'::jsonb
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

update public.lowcode_pages
set view_name = 'public.planning_itemsupplier_view',
    table_name = 'planning_itemsupplier',
    schema = jsonb_set(
      jsonb_set(schema, '{dataSources,planning_itemOptions,postData,labelField}', '"display_name"'::jsonb, true),
      '{dataSources,planning_itemsupplierRows,postData,tableName}', '"planning_itemsupplier"'::jsonb, true
    ),
    version = version + 1,
    published_at = case when status = 'published' then timezone('utc'::text, now()) else published_at end,
    updated_at = timezone('utc'::text, now())
where code in ('planning_itemsupplier-list', 'planning_itemsupplier-edit');

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_itemsupplier-list', 'planning_itemsupplier-edit')
on conflict (page_id, version) do update
set schema = excluded.schema,
    published_at = excluded.published_at;

commit;

select pg_catalog.pg_notify('pgrst', 'reload schema');
