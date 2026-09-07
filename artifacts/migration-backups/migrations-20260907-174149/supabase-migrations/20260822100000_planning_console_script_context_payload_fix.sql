-- Keep planning-console button scripts below the low-code runtime payload limit.

begin;

with target as (
  select id, schema
  from public.lowcode_pages
  where code = 'planning_console'
), patched as (
  select
    id,
    jsonb_set(
      jsonb_set(
        schema,
        '{scriptPolicy,context,dataSourceKeys}',
        '["runtimeCapabilities", "versionOptions"]'::jsonb,
        true
      ),
      '{blocks,2,actions,3,script}',
      to_jsonb(replace(
        replace(
          replace(
            replace(
              schema #>> '{blocks,2,actions,3,script}',
              '  const summary = this.data.summary || {};\n',
              ''
            ),
            '  const options = Array.isArray(this.data.versionOptions) ? this.data.versionOptions : [];\n',
            ''
          ),
          '  const versionId = String(filter.planVersionId || summary.versionId || "").trim();',
          '  const options = Array.isArray(this.data.versionOptions) ? this.data.versionOptions : [];\n  const versionId = String(\n    filter.planVersionId || options.find((option) => option && option.is_current)?.id || ""\n  ).trim();'
        ),
        ' || summary.versionStatus || ""',
        ' || ""'
      )),
      true
    ) as schema
  from target
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

commit;
