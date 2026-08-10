-- Repair runtime blocks that were saved as JSON null by an older visual conversion path.
with repaired as (
  update public.lowcode_pages page
  set schema = jsonb_set(
        page.schema,
        '{blocks,2,tabs,0,blocks,0}',
        (
          select version_row.schema#>'{blocks,2,tabs,0,blocks,0}'
          from public.lowcode_page_versions version_row
          where version_row.page_id = page.id
            and jsonb_typeof(version_row.schema#>'{blocks,2,tabs,0,blocks,0}') = 'object'
          order by version_row.version desc
          limit 1
        ),
        false
      ),
      version = coalesce(page.version, 0) + 1,
      published_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where page.code = 'admin-system-options'
    and jsonb_typeof(page.schema#>'{blocks,2,tabs,0,blocks,0}') = 'null'
    and exists (
      select 1
      from public.lowcode_page_versions version_row
      where version_row.page_id = page.id
        and jsonb_typeof(version_row.schema#>'{blocks,2,tabs,0,blocks,0}') = 'object'
    )
  returning page.id, page.version, page.schema, page.published_at
)
insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from repaired
on conflict (page_id, version) do nothing;

with repaired as (
  update public.lowcode_pages page
  set schema = jsonb_set(
        page.schema,
        '{blocks}',
        (
          select coalesce(jsonb_agg(block_item order by ordinal), '[]'::jsonb)
          from jsonb_array_elements(page.schema->'blocks') with ordinality items(block_item, ordinal)
          where jsonb_typeof(block_item) = 'object'
        ),
        false
      ),
      version = coalesce(page.version, 0) + 1,
      published_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where page.code = 'admin-system-options-edit'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(page.schema->'blocks', '[]'::jsonb)) block_item
      where jsonb_typeof(block_item) <> 'object'
    )
  returning page.id, page.version, page.schema, page.published_at
)
insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from repaired
on conflict (page_id, version) do nothing;
