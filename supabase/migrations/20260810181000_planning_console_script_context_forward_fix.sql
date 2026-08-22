-- Forward-only deployment of the bounded script context introduced for the
-- planning console. Existing installations may have already recorded the
-- original console migration and therefore won't replay its corrected schema.

begin;

with desired_context as (
  select '{
    "dataSourceKeys": ["runtimeCapabilities", "summary", "versionOptions"],
    "formBlockIds": ["planning_console_filter", "planning_console_result_filter"],
    "searchSourceKeys": [],
    "gridBlockIds": ["planning_console_runs_grid"]
  }'::jsonb as value
)
update public.lowcode_pages page
set schema = jsonb_set(
      page.schema,
      '{scriptPolicy,context}',
      desired_context.value,
      true
    ),
    version = case
      when page.schema #> '{scriptPolicy,context}'
        is distinct from desired_context.value
      then page.version + 1
      else page.version
    end,
    published_at = case
      when page.schema #> '{scriptPolicy,context}'
        is distinct from desired_context.value
      then timezone('utc'::text, now())
      else page.published_at
    end,
    updated_at = case
      when page.schema #> '{scriptPolicy,context}'
        is distinct from desired_context.value
      then timezone('utc'::text, now())
      else page.updated_at
    end
from desired_context
where page.code = 'planning_console';

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'planning_console'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

commit;
