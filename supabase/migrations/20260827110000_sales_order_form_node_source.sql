-- Move the sales-order edit source onto the form node and use its ID everywhere.

begin;

with target as (
  select
    page.*,
    page.schema->'dataSources'->'salesOrder' as node_source
  from public.lowcode_pages as page
  where page.code = 'sales-orders-edit'
    and jsonb_typeof(page.schema->'dataSources'->'salesOrder') = 'object'
  limit 1
), transformed_blocks as (
  select
    target.id,
    target.version,
    target.schema,
    coalesce(jsonb_agg(
      case
        when block.value->>'kind' = 'form'
          and block.value->>'id' = 'sales-order-edit-form' then
          (block.value - 'sourceKey' - 'submitSourceKey')
            || jsonb_build_object(
              'dataSource',
              target.node_source || jsonb_build_object('key', 'sales-order-edit-form')
            )
        else block.value
      end
      order by block.ordinality
    ), '[]'::jsonb) as blocks
  from target
  cross join lateral jsonb_array_elements(coalesce(target.schema->'blocks', '[]'::jsonb))
    with ordinality as block(value, ordinality)
  group by target.id, target.version, target.schema
), replaced_references as (
  select
    id,
    version,
    replace(
      replace(
        replace(
          jsonb_set(schema, '{blocks}', blocks, true)::text,
          to_jsonb('salesOrder'::text)::text,
          to_jsonb('sales-order-edit-form'::text)::text
        ),
        quote_literal('salesOrder'),
        quote_literal('sales-order-edit-form')
      ),
      E'\\"salesOrder\\"',
      E'\\"sales-order-edit-form\\"'
    )::jsonb as schema
  from transformed_blocks
), migrated as (
  select
    id,
    version,
    jsonb_set(
      schema,
      '{dataSources}',
      coalesce(schema->'dataSources', '{}'::jsonb) - 'sales-order-edit-form',
      true
    ) as schema
  from replaced_references
), updated as (
  update public.lowcode_pages as page
  set
    schema = migrated.schema,
    version = page.version + 1,
    published_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  from migrated
  where page.id = migrated.id
    and page.schema is distinct from migrated.schema
  returning page.id, page.version, page.schema, page.published_at
)
insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from updated
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

select pg_notify('pgrst', 'reload schema');

commit;
