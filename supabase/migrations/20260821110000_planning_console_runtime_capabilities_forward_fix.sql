-- Forward-only repair for planning console installations that already ran an
-- older console migration before the runtime capability data source existed.

begin;

with desired as (
  select
    '{
      "key": "runtimeCapabilities",
      "label": "排产运行能力",
      "sourceType": "custom",
      "serviceName": "planning",
      "serviceMethod": "getRuntimeCapabilities",
      "autoLoad": true
    }'::jsonb as runtime_capabilities,
    '{
      "dataSourceKeys": ["runtimeCapabilities", "summary", "versionOptions"],
      "formBlockIds": ["planning_console_filter", "planning_console_result_filter"],
      "searchSourceKeys": [],
      "gridBlockIds": ["planning_console_runs_grid"]
    }'::jsonb as script_context
),
patched as (
  select
    page.id,
    jsonb_set(
      jsonb_set(
        page.schema,
        '{dataSources,runtimeCapabilities}',
        desired.runtime_capabilities,
        true
      ),
      '{scriptPolicy,context}',
      desired.script_context,
      true
    ) as schema
  from public.lowcode_pages page
  cross join desired
  where page.code = 'planning_console'
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
