-- Training low-code pages are intentionally list-only: each page contains
-- only a button group and a grid, with no form/editor block.
begin;

with page_blocks as (
  select
    page.id,
    jsonb_agg(
      case
        when block.value->>'kind' = 'grid' then
          jsonb_set(
            block.value - 'editorBlockId' - 'deleteSourceKey',
            '{schema,rowActions}',
            '{"edit":false,"delete":false}'::jsonb,
            true
          )
        else block.value
      end
      order by block.ordinal
    ) as blocks
  from public.lowcode_pages page
  cross join lateral jsonb_array_elements(page.schema->'blocks') with ordinality as block(value, ordinal)
  where page.code in (
    'training-courses-list',
    'training-chapters-list',
    'training-progress-list'
  )
    and block.value->>'kind' in ('buttonGroup', 'grid')
  group by page.id
)
update public.lowcode_pages page
set schema = jsonb_set(page.schema, '{blocks}', page_blocks.blocks, true),
    version = coalesce(page.version, 0) + 1,
    published_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
from page_blocks
where page.id = page_blocks.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select page.id, page.version, page.schema, page.published_at
from public.lowcode_pages page
where page.code in (
  'training-courses-list',
  'training-chapters-list',
  'training-progress-list'
)
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

select pg_notify('pgrst', 'reload schema');
commit;
