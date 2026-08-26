-- Bind the existing planning console Gantt to the database-backed display form.

begin;

with pages as (
  select id, schema
  from public.lowcode_pages
  where code = 'planning_console'
), tabs_blocks as (
  select
    pages.id,
    pages.schema,
    block.value as block,
    block.ordinality as block_ordinality
  from pages
  cross join lateral jsonb_array_elements(coalesce(pages.schema -> 'blocks', '[]'::jsonb))
    with ordinality as block(value, ordinality)
  where block.value ->> 'id' = 'planning_console_tabs'
), gantt_tabs as (
  select
    tabs_blocks.id,
    tabs_blocks.schema,
    tabs_blocks.block_ordinality,
    tab.value as tab,
    tab.ordinality as tab_ordinality
  from tabs_blocks
  cross join lateral jsonb_array_elements(coalesce(tabs_blocks.block -> 'tabs', '[]'::jsonb))
    with ordinality as tab(value, ordinality)
  where tab.value ->> 'key' = 'gantt'
), gantt_blocks as (
  select
    gantt_tabs.id,
    gantt_tabs.schema,
    gantt_tabs.block_ordinality,
    gantt_tabs.tab_ordinality,
    block.ordinality as gantt_block_ordinality
  from gantt_tabs
  cross join lateral jsonb_array_elements(coalesce(gantt_tabs.tab -> 'blocks', '[]'::jsonb))
    with ordinality as block(value, ordinality)
  where block.value ->> 'id' = 'planning_console_gantt'
), patched as (
  select
    id,
    jsonb_set(
      schema,
      array[
        'blocks', (block_ordinality - 1)::text,
        'tabs', (tab_ordinality - 1)::text,
        'blocks', (gantt_block_ordinality - 1)::text,
        'settingsFormCode'
      ],
      to_jsonb('planning-gantt-display-settings'::text),
      true
    ) as schema
  from gantt_blocks
)
update public.lowcode_pages page
set schema = patched.schema,
    version = case
      when page.schema is distinct from patched.schema then page.version + 1
      else page.version
    end,
    published_at = case
      when page.schema is distinct from patched.schema then timezone('utc'::text, now())
      else page.published_at
    end,
    updated_at = case
      when page.schema is distinct from patched.schema then timezone('utc'::text, now())
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

select pg_notify('pgrst', 'reload schema');

commit;
