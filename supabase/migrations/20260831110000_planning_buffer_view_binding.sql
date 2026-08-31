-- Expose relation labels for inventory buffers while retaining the physical
-- table as the CRUD write target.

begin;

create or replace view public.planning_buffer_view
with (security_invoker = true)
as
select
  buffer.id,
  buffer.account_id,
  buffer.location_id,
  location.name as location_name,
  coalesce(location.name, buffer.location_id::text) as location_id_label,
  buffer.item_id,
  item.name as item_code,
  item.display_name as item_name,
  coalesce(item.display_name, item.name, buffer.item_id::text) as item_id_label,
  buffer.minimum_calendar_id,
  minimum_calendar.name as minimum_calendar_name,
  coalesce(minimum_calendar.name, buffer.minimum_calendar_id::text) as minimum_calendar_id_label,
  buffer.maximum_calendar_id,
  maximum_calendar.name as maximum_calendar_name,
  coalesce(maximum_calendar.name, buffer.maximum_calendar_id::text) as maximum_calendar_id_label,
  buffer.description,
  buffer.category,
  buffer.subcategory,
  buffer.type,
  buffer.batch,
  buffer.onhand,
  buffer.minimum,
  buffer.min_interval,
  buffer.maximum,
  buffer.source,
  buffer.lastmodified,
  buffer.created_by,
  buffer.updated_by,
  buffer.created_at,
  buffer.updated_at
from public.planning_buffer buffer
left join public.planning_location location
  on location.account_id = buffer.account_id
 and location.id = buffer.location_id
left join public.planning_item item
  on item.account_id = buffer.account_id
 and item.id = buffer.item_id
left join public.planning_calendar minimum_calendar
  on minimum_calendar.account_id = buffer.account_id
 and minimum_calendar.id = buffer.minimum_calendar_id
left join public.planning_calendar maximum_calendar
  on maximum_calendar.account_id = buffer.account_id
 and maximum_calendar.id = buffer.maximum_calendar_id;

grant select on public.planning_buffer_view to authenticated, service_role;

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
    ('planning_buffer', 'public', 'planning_buffer', '库存缓冲区', '物料在地点上的库存状态和上下限。', 'id'),
    ('planning_location', 'public', 'planning_location', '地点', '工厂、仓库和其他计划地点。', 'id'),
    ('planning_item', 'public', 'planning_item', '物料', '原料、半成品和成品物料。', 'id'),
    ('planning_calendar', 'public', 'planning_calendar', '日历', '计划日历及其时间桶。', 'id')
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
    ('planning_buffer', 'id', '编号', 'uuid', false, true, 0),
    ('planning_buffer', 'account_id', '账套', 'uuid', true, false, 1),
    ('planning_buffer', 'location_id', '地点', 'uuid', true, false, 10),
    ('planning_buffer', 'item_id', '物料', 'uuid', true, false, 20),
    ('planning_buffer', 'minimum_calendar_id', '最小库存日历', 'uuid', false, false, 30),
    ('planning_buffer', 'maximum_calendar_id', '最大库存日历', 'uuid', false, false, 40),
    ('planning_location', 'id', '编号', 'uuid', false, true, 0),
    ('planning_location', 'name', '名称', 'text', true, false, 10),
    ('planning_item', 'id', '编号', 'uuid', false, true, 0),
    ('planning_item', 'name', '物料编码', 'text', true, false, 10),
    ('planning_item', 'display_name', '物料名称', 'text', true, false, 11),
    ('planning_calendar', 'id', '编号', 'uuid', false, true, 0),
    ('planning_calendar', 'name', '名称', 'text', true, false, 10)
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
  from public.entity_design_tables where code = 'planning_buffer';

  for relation_record in
    select * from (values
      ('location_id', 'planning_location', 'restrict', 'planning_buffer_location_id_account_fk'),
      ('item_id', 'planning_item', 'restrict', 'planning_buffer_item_id_account_fk'),
      ('minimum_calendar_id', 'planning_calendar', 'set null', 'planning_buffer_minimum_calendar_id_account_fk'),
      ('maximum_calendar_id', 'planning_calendar', 'set null', 'planning_buffer_maximum_calendar_id_account_fk')
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
  ('planning_buffer_view', 'public', 'planning_buffer_view',
   '库存缓冲区关联视图', '展示库存缓冲区及其地点、物料和库存日历名称。',
   $$select
  buffer.id,
  buffer.account_id,
  buffer.location_id,
  location.name as location_name,
  coalesce(location.name, buffer.location_id::text) as location_id_label,
  buffer.item_id,
  item.name as item_code,
  item.display_name as item_name,
  coalesce(item.display_name, item.name, buffer.item_id::text) as item_id_label,
  buffer.minimum_calendar_id,
  minimum_calendar.name as minimum_calendar_name,
  coalesce(minimum_calendar.name, buffer.minimum_calendar_id::text) as minimum_calendar_id_label,
  buffer.maximum_calendar_id,
  maximum_calendar.name as maximum_calendar_name,
  coalesce(maximum_calendar.name, buffer.maximum_calendar_id::text) as maximum_calendar_id_label,
  buffer.description,
  buffer.category,
  buffer.subcategory,
  buffer.type,
  buffer.batch,
  buffer.onhand,
  buffer.minimum,
  buffer.min_interval,
  buffer.maximum,
  buffer.source,
  buffer.lastmodified,
  buffer.created_by,
  buffer.updated_by,
  buffer.created_at,
  buffer.updated_at
from public.planning_buffer buffer
left join public.planning_location location on location.account_id = buffer.account_id and location.id = buffer.location_id
left join public.planning_item item on item.account_id = buffer.account_id and item.id = buffer.item_id
left join public.planning_calendar minimum_calendar on minimum_calendar.account_id = buffer.account_id and minimum_calendar.id = buffer.minimum_calendar_id
left join public.planning_calendar maximum_calendar on maximum_calendar.account_id = buffer.account_id and maximum_calendar.id = buffer.maximum_calendar_id$$,
   'published', true, timezone('utc'::text, now()),
   '{"sourceTable":"public.planning_buffer","relationFields":["location_id","item_id","minimum_calendar_id","maximum_calendar_id"],"displayFields":["location_id_label","item_id_label","minimum_calendar_id_label","maximum_calendar_id_label"]}'::jsonb)
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
      jsonb_set(schema, '{dataSources,planning_bufferRows,sourceType}', '"view"'::jsonb, true),
      '{dataSources,planning_bufferRows,viewName}', '"public.planning_buffer_view"'::jsonb, true
    ),
    view_name = 'public.planning_buffer_view',
    table_name = 'planning_buffer',
    version = version + 1,
    published_at = case when status = 'published' then timezone('utc'::text, now()) else published_at end,
    updated_at = timezone('utc'::text, now())
where code in ('planning_buffer-list', 'planning_buffer-edit')
  and (
    schema->'dataSources'->'planning_bufferRows'->>'sourceType' is distinct from 'view'
    or schema->'dataSources'->'planning_bufferRows'->>'viewName' is distinct from 'public.planning_buffer_view'
    or view_name is distinct from 'public.planning_buffer_view'
    or table_name is distinct from 'planning_buffer'
  );

update public.lowcode_pages page
set schema = jsonb_set(
      page.schema,
      '{blocks}',
      (
        select coalesce(jsonb_agg(
          case when block.value->>'id' = 'planning_buffer-grid' then
            jsonb_set(
              jsonb_set(
                jsonb_set(block.value, '{sourceType}', '"view"'::jsonb, true),
                '{viewName}', '"public.planning_buffer_view"'::jsonb, true
              ),
              '{tableName}', '"planning_buffer"'::jsonb, true
            )
          else block.value end order by block.ordinality
        ), '[]'::jsonb)
        from jsonb_array_elements(coalesce(page.schema->'blocks', '[]'::jsonb))
          with ordinality block(value, ordinality)
      ),
      true
    ),
    updated_at = timezone('utc'::text, now())
where page.code = 'planning_buffer-list';

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_buffer-list', 'planning_buffer-edit')
on conflict (page_id, version) do update
set schema = excluded.schema,
    published_at = excluded.published_at;

do $validation$
begin
  if not exists (
    select 1 from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'planning_buffer_view'
      and relation.relkind = 'v'
  ) then
    raise exception 'planning_buffer_view was not created.';
  end if;

  if (
    select count(*) from information_schema.columns
    where table_schema = 'public'
      and table_name = 'planning_buffer_view'
      and column_name in ('location_id_label', 'item_id_label')
  ) <> 2 then
    raise exception 'Inventory-buffer location or material display column is missing.';
  end if;

  if (
    select count(*) from public.lowcode_pages
    where code in ('planning_buffer-list', 'planning_buffer-edit')
      and view_name = 'public.planning_buffer_view'
      and table_name = 'planning_buffer'
      and schema->'dataSources'->'planning_bufferRows'->>'sourceType' = 'view'
      and schema->'dataSources'->'planning_bufferRows'->>'viewName' = 'public.planning_buffer_view'
  ) <> 2 then
    raise exception 'Inventory-buffer pages were not bound to the relation view.';
  end if;
end;
$validation$;

insert into supabase_migrations.schema_migrations(version, name, statements)
values ('20260831110000', 'planning_buffer_view_binding',
        array['Applied planning_buffer relation view binding and display columns using DIRECT_URL'])
on conflict (version) do update
set name = excluded.name,
    statements = excluded.statements;

commit;

select pg_catalog.pg_notify('pgrst', 'reload schema');
