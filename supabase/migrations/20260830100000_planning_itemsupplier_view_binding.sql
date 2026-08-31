-- Bind the material-supplier pages to the relation-aware read view.
-- Keep planning_itemsupplier as the physical write target.

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

update public.lowcode_pages
set schema = jsonb_set(
      jsonb_set(
        schema,
        '{dataSources,planning_itemsupplierRows,sourceType}',
        '"view"'::jsonb,
        true
      ),
      '{dataSources,planning_itemsupplierRows,viewName}',
      '"public.planning_itemsupplier_view"'::jsonb,
      true
    ),
    view_name = 'public.planning_itemsupplier_view',
    table_name = 'planning_itemsupplier',
    version = version + 1,
    published_at = case
      when status = 'published' then timezone('utc'::text, now())
      else published_at
    end,
    updated_at = timezone('utc'::text, now())
where code in ('planning_itemsupplier-list', 'planning_itemsupplier-edit')
  and (
    schema->'dataSources'->'planning_itemsupplierRows'->>'sourceType' is distinct from 'view'
    or schema->'dataSources'->'planning_itemsupplierRows'->>'viewName' is distinct from 'public.planning_itemsupplier_view'
    or view_name is distinct from 'public.planning_itemsupplier_view'
    or table_name is distinct from 'planning_itemsupplier'
  );

-- The list grid carries its own source metadata for designer/runtime updates.
update public.lowcode_pages page
set schema = jsonb_set(
      page.schema,
      '{blocks}',
      (
        select coalesce(jsonb_agg(
          case
            when block.value->>'id' = 'planning_itemsupplier-grid' then
              jsonb_set(
                jsonb_set(
                  jsonb_set(block.value, '{sourceType}', '"view"'::jsonb, true),
                  '{viewName}',
                  '"public.planning_itemsupplier_view"'::jsonb,
                  true
                ),
                '{tableName}',
                '"planning_itemsupplier"'::jsonb,
                true
              )
            else block.value
          end order by block.ordinality
        ), '[]'::jsonb)
        from jsonb_array_elements(coalesce(page.schema->'blocks', '[]'::jsonb))
          with ordinality block(value, ordinality)
      ),
      true
    ),
    version = case
      when page.code in ('planning_itemsupplier-list', 'planning_itemsupplier-edit')
        then page.version
      else page.version
    end
where page.code = 'planning_itemsupplier-list';

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in ('planning_itemsupplier-list', 'planning_itemsupplier-edit')
on conflict (page_id, version) do update
set schema = excluded.schema,
    published_at = excluded.published_at;

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
  '{"sourceTable":"public.planning_itemsupplier","relationFields":["item_id","location_id","supplier_id","resource_id"],"displayFields":["item_id_label","supplier_id_label","location_id_label"]}'::jsonb
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

do $validation$
begin
  if not exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'planning_itemsupplier_view'
      and relation.relkind = 'v'
  ) then
    raise exception 'planning_itemsupplier_view was not created.';
  end if;

  if (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'planning_itemsupplier_view'
      and column_name in ('item_id_label', 'supplier_id_label', 'location_id_label')
  ) <> 3 then
    raise exception 'planning_itemsupplier_view is missing material, supplier, or location display columns.';
  end if;

  if (
    select count(*)
    from public.lowcode_pages
    where code in ('planning_itemsupplier-list', 'planning_itemsupplier-edit')
      and view_name = 'public.planning_itemsupplier_view'
      and table_name = 'planning_itemsupplier'
      and schema->'dataSources'->'planning_itemsupplierRows'->>'sourceType' = 'view'
      and schema->'dataSources'->'planning_itemsupplierRows'->>'viewName' = 'public.planning_itemsupplier_view'
  ) <> 2 then
    raise exception 'Material-supplier page data sources were not bound to the relation view.';
  end if;
end;
$validation$;

commit;

select pg_catalog.pg_notify('pgrst', 'reload schema');
