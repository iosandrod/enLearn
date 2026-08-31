-- Expose relation labels for material distribution while retaining the
-- physical table as the CRUD write target.

begin;

create or replace view public.planning_itemdistribution_view
with (security_invoker = true)
as
select
  distribution.id,
  distribution.account_id,
  distribution.item_id,
  item.name as item_code,
  item.display_name as item_name,
  coalesce(item.display_name, item.name, distribution.item_id::text) as item_id_label,
  distribution.location_id,
  destination.name as location_name,
  coalesce(destination.name, distribution.location_id::text) as location_id_label,
  distribution.origin_id,
  origin.name as origin_name,
  coalesce(origin.name, distribution.origin_id::text) as origin_id_label,
  distribution.resource_id,
  resource.name as resource_name,
  coalesce(resource.name, distribution.resource_id::text) as resource_id_label,
  distribution.leadtime,
  distribution.sizeminimum,
  distribution.sizemultiple,
  distribution.sizemaximum,
  distribution.batchwindow,
  distribution.cost,
  distribution.priority,
  distribution.effective_start,
  distribution.effective_end,
  distribution.resource_qty,
  distribution.fence,
  distribution.source,
  distribution.lastmodified,
  distribution.created_by,
  distribution.updated_by,
  distribution.created_at,
  distribution.updated_at
from public.planning_itemdistribution distribution
left join public.planning_item item
  on item.account_id = distribution.account_id
 and item.id = distribution.item_id
left join public.planning_location destination
  on destination.account_id = distribution.account_id
 and destination.id = distribution.location_id
left join public.planning_location origin
  on origin.account_id = distribution.account_id
 and origin.id = distribution.origin_id
left join public.planning_resource resource
  on resource.account_id = distribution.account_id
 and resource.id = distribution.resource_id;

grant select on public.planning_itemdistribution_view to authenticated, service_role;

do $metadata$
declare
  v_source_table_id uuid;
  v_target_table_id uuid;
  v_source_column_id uuid;
  v_target_column_id uuid;
  relation_record record;
begin
  insert into public.entity_design_tables
    (code, schema_name, table_name, title, description, primary_key)
  values
    ('planning_itemdistribution', 'public', 'planning_itemdistribution', '物料配送', '地点之间的物料补货和配送通道。', 'id'),
    ('planning_item', 'public', 'planning_item', '物料', '原料、半成品和成品物料。', 'id'),
    ('planning_location', 'public', 'planning_location', '地点', '工厂、仓库和其他计划地点。', 'id'),
    ('planning_resource', 'public', 'planning_resource', '资源', '设备、人员、产线等能力资源。', 'id')
  on conflict (schema_name, table_name) do update
    set title = excluded.title,
        description = excluded.description,
        primary_key = excluded.primary_key,
        updated_at = timezone('utc'::text, now());

  insert into public.entity_design_columns
    (table_id, column_name, label, data_type, storage_kind,
     is_required, is_primary_key, sort_order)
  select tables.id, fields.column_name, fields.label, fields.data_type, 'physical',
    fields.is_required, fields.is_primary_key, fields.sort_order
  from (values
    ('planning_itemdistribution', 'id', '编号', 'uuid', false, true, 0),
    ('planning_itemdistribution', 'account_id', '账套', 'uuid', true, false, 1),
    ('planning_itemdistribution', 'item_id', '物料', 'uuid', true, false, 10),
    ('planning_itemdistribution', 'location_id', '目的地点', 'uuid', true, false, 20),
    ('planning_itemdistribution', 'origin_id', '来源地点', 'uuid', true, false, 30),
    ('planning_itemdistribution', 'resource_id', '资源', 'uuid', false, false, 40),
    ('planning_item', 'id', '编号', 'uuid', false, true, 0),
    ('planning_item', 'name', '物料编码', 'text', true, false, 10),
    ('planning_item', 'display_name', '物料名称', 'text', true, false, 11),
    ('planning_location', 'id', '编号', 'uuid', false, true, 0),
    ('planning_location', 'name', '名称', 'text', true, false, 10),
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

  select id into v_source_table_id
  from public.entity_design_tables where code = 'planning_itemdistribution';

  for relation_record in
    select * from (values
      ('item_id', 'planning_item', 'restrict', 'planning_itemdistribution_item_id_account_fk'),
      ('location_id', 'planning_location', 'restrict', 'planning_itemdistribution_location_id_account_fk'),
      ('origin_id', 'planning_location', 'restrict', 'planning_itemdistribution_origin_id_account_fk'),
      ('resource_id', 'planning_resource', 'set null', 'planning_itemdistribution_resource_id_account_fk')
    ) as relations(source_column_name, target_code, on_delete, constraint_name)
  loop
    select id into v_target_table_id from public.entity_design_tables
    where code = relation_record.target_code;
    select id into v_source_column_id from public.entity_design_columns
    where table_id = v_source_table_id and column_name = relation_record.source_column_name;
    select id into v_target_column_id from public.entity_design_columns
    where table_id = v_target_table_id and column_name = 'id';

    insert into public.entity_design_relations
      (source_table_id, source_column_id, source_column_name,
       target_table_id, target_column_id, target_column_name,
       relation_type, is_enforced, constraint_name, on_delete, metadata)
    values
      (v_source_table_id, v_source_column_id, relation_record.source_column_name,
       v_target_table_id, v_target_column_id, 'id',
       'many_to_one', true, relation_record.constraint_name,
       relation_record.on_delete, '{}'::jsonb)
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

insert into public.entity_design_views
  (code, schema_name, view_name, title, description, definition_sql,
   status, security_invoker, published_at, metadata)
values
  ('planning_itemdistribution_view', 'public', 'planning_itemdistribution_view',
   '物料配送关联视图', '展示物料配送及其物料、目的地点、来源地点和资源名称。',
   $$select
  distribution.id,
  distribution.account_id,
  distribution.item_id,
  item.name as item_code,
  item.display_name as item_name,
  coalesce(item.display_name, item.name, distribution.item_id::text) as item_id_label,
  distribution.location_id,
  destination.name as location_name,
  coalesce(destination.name, distribution.location_id::text) as location_id_label,
  distribution.origin_id,
  origin.name as origin_name,
  coalesce(origin.name, distribution.origin_id::text) as origin_id_label,
  distribution.resource_id,
  resource.name as resource_name,
  coalesce(resource.name, distribution.resource_id::text) as resource_id_label,
  distribution.leadtime,
  distribution.sizeminimum,
  distribution.sizemultiple,
  distribution.sizemaximum,
  distribution.batchwindow,
  distribution.cost,
  distribution.priority,
  distribution.effective_start,
  distribution.effective_end,
  distribution.resource_qty,
  distribution.fence,
  distribution.source,
  distribution.lastmodified,
  distribution.created_by,
  distribution.updated_by,
  distribution.created_at,
  distribution.updated_at
from public.planning_itemdistribution distribution
left join public.planning_item item on item.account_id = distribution.account_id and item.id = distribution.item_id
left join public.planning_location destination on destination.account_id = distribution.account_id and destination.id = distribution.location_id
left join public.planning_location origin on origin.account_id = distribution.account_id and origin.id = distribution.origin_id
left join public.planning_resource resource on resource.account_id = distribution.account_id and resource.id = distribution.resource_id$$,
   'published', true, timezone('utc'::text, now()),
   '{"sourceTable":"public.planning_itemdistribution","relationFields":["item_id","location_id","origin_id","resource_id"],"displayFields":["item_id_label","location_id_label","origin_id_label"]}'::jsonb)
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
set schema = jsonb_set(
      jsonb_set(schema, '{dataSources,planning_itemdistributionRows,sourceType}', '"view"'::jsonb, true),
      '{dataSources,planning_itemdistributionRows,viewName}',
      '"public.planning_itemdistribution_view"'::jsonb,
      true
    ),
    view_name = 'public.planning_itemdistribution_view',
    table_name = 'planning_itemdistribution',
    version = version + 1,
    published_at = case when status = 'published' then timezone('utc'::text, now()) else published_at end,
    updated_at = timezone('utc'::text, now())
where code in ('planning_itemdistribution-list', 'planning_itemdistribution-edit')
  and (
    schema->'dataSources'->'planning_itemdistributionRows'->>'sourceType' is distinct from 'view'
    or schema->'dataSources'->'planning_itemdistributionRows'->>'viewName' is distinct from 'public.planning_itemdistribution_view'
    or view_name is distinct from 'public.planning_itemdistribution_view'
    or table_name is distinct from 'planning_itemdistribution'
  );

update public.lowcode_pages page
set schema = jsonb_set(
      page.schema,
      '{blocks}',
      (
        select coalesce(jsonb_agg(
          case when block.value->>'id' = 'planning_itemdistribution-grid' then
            jsonb_set(
              jsonb_set(
                jsonb_set(block.value, '{sourceType}', '"view"'::jsonb, true),
                '{viewName}', '"public.planning_itemdistribution_view"'::jsonb, true
              ),
              '{tableName}', '"planning_itemdistribution"'::jsonb, true
            )
          else block.value end order by block.ordinality
        ), '[]'::jsonb)
        from jsonb_array_elements(coalesce(page.schema->'blocks', '[]'::jsonb))
          with ordinality block(value, ordinality)
      ),
      true
    ),
    updated_at = timezone('utc'::text, now())
where page.code = 'planning_itemdistribution-list';

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_itemdistribution-list', 'planning_itemdistribution-edit')
on conflict (page_id, version) do update
set schema = excluded.schema,
    published_at = excluded.published_at;

do $validation$
begin
  if not exists (
    select 1 from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'planning_itemdistribution_view'
      and relation.relkind = 'v'
  ) then
    raise exception 'planning_itemdistribution_view was not created.';
  end if;

  if (
    select count(*) from information_schema.columns
    where table_schema = 'public'
      and table_name = 'planning_itemdistribution_view'
      and column_name in ('item_id_label', 'location_id_label', 'origin_id_label')
  ) <> 3 then
    raise exception 'Material-distribution relation display columns are missing.';
  end if;

  if (
    select count(*) from public.lowcode_pages
    where code in ('planning_itemdistribution-list', 'planning_itemdistribution-edit')
      and view_name = 'public.planning_itemdistribution_view'
      and table_name = 'planning_itemdistribution'
      and schema->'dataSources'->'planning_itemdistributionRows'->>'sourceType' = 'view'
      and schema->'dataSources'->'planning_itemdistributionRows'->>'viewName' = 'public.planning_itemdistribution_view'
  ) <> 2 then
    raise exception 'Material-distribution pages were not bound to the relation view.';
  end if;
end;
$validation$;

insert into supabase_migrations.schema_migrations(version, name, statements)
values ('20260831100000', 'planning_itemdistribution_view_binding',
        array['Applied planning_itemdistribution relation view binding and display columns using DIRECT_URL'])
on conflict (version) do update
set name = excluded.name,
    statements = excluded.statements;

commit;

select pg_catalog.pg_notify('pgrst', 'reload schema');
