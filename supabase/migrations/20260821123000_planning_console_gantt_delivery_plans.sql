-- Show demand delivery plans in the planning console Gantt.
-- Local cpp-typescript runs can produce DLVR rows without resource assignments;
-- the Gantt must include those rows instead of showing an empty chart.

begin;

with pages as (
  select page.id, page.schema
  from public.lowcode_pages page
  where page.code = 'planning_console'
),
tab_blocks as (
  select
    pages.id,
    pages.schema,
    block.value as block,
    block.ordinality as block_ordinality
  from pages
  cross join lateral jsonb_array_elements(coalesce(pages.schema->'blocks', '[]'::jsonb))
    with ordinality as block(value, ordinality)
  where block.value->>'id' = 'planning_console_tabs'
),
gantt_tabs as (
  select
    tab_blocks.id,
    tab_blocks.schema,
    tab_blocks.block_ordinality,
    tab.value as tab,
    tab.ordinality as tab_ordinality
  from tab_blocks
  cross join lateral jsonb_array_elements(coalesce(tab_blocks.block->'tabs', '[]'::jsonb))
    with ordinality as tab(value, ordinality)
  where tab.value->>'key' = 'gantt'
),
gantt_blocks as (
  select
    gantt_tabs.id,
    gantt_tabs.schema,
    gantt_tabs.block_ordinality,
    gantt_tabs.tab_ordinality,
    block.ordinality as gantt_block_ordinality
  from gantt_tabs
  cross join lateral jsonb_array_elements(coalesce(gantt_tabs.tab->'blocks', '[]'::jsonb))
    with ordinality as block(value, ordinality)
  where block.value->>'id' = 'planning_console_gantt'
),
patched as (
  select
    id,
    jsonb_set(
      jsonb_set(
        jsonb_set(
          schema,
          array[
            'blocks', (block_ordinality - 1)::text,
            'tabs', (tab_ordinality - 1)::text,
            'blocks', (gantt_block_ordinality - 1)::text,
            'includedTypes'
          ],
          '["MO", "WO", "PO", "DO", "DLVR"]'::jsonb,
          true
        ),
        array[
          'blocks', (block_ordinality - 1)::text,
          'tabs', (tab_ordinality - 1)::text,
          'blocks', (gantt_block_ordinality - 1)::text,
          'title'
        ],
        to_jsonb('排产甘特图'::text),
        true
      ),
      array[
        'blocks', (block_ordinality - 1)::text,
        'tabs', (tab_ordinality - 1)::text,
        'blocks', (gantt_block_ordinality - 1)::text,
        'description'
      ],
      to_jsonb('按资源或交付对象查看计划单时间占用、状态和延期情况。'::text),
      true
    ) as schema
  from gantt_blocks
)
update public.lowcode_pages page
set schema = patched.schema,
    version = case
      when page.schema is distinct from patched.schema
      then page.version + 1
      else page.version
    end,
    published_at = case
      when page.schema is distinct from patched.schema
      then timezone('utc'::text, now())
      else page.published_at
    end,
    updated_at = case
      when page.schema is distinct from patched.schema
      then timezone('utc'::text, now())
      else page.updated_at
    end
from patched
where page.id = patched.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'planning_console'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

commit;
