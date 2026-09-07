-- Keep the user permission archive list page display-only:
-- button group -> main grid -> child tabs -> child grid.

with next_schema as (
  select
    id,
    jsonb_set(
      schema #- '{dataSources,roles}' #- '{dataSources,users,saveMethod}',
      '{blocks}',
      (
        select coalesce(
          jsonb_agg(
            case
              when block ->> 'id' = 'user-role-main-grid' then
                jsonb_set(
                  jsonb_set(
                    block,
                    '{schema,rowActions}',
                    '{"edit": false, "delete": false}'::jsonb,
                    true
                  ),
                  '{schema,events,rowCurrentChange}',
                  (
                    select coalesce(jsonb_agg(directive order by directive_order), '[]'::jsonb)
                    from jsonb_array_elements(
                      coalesce(block #> '{schema,events,rowCurrentChange}', '[]'::jsonb)
                    ) with ordinality as directives(directive, directive_order)
                    where coalesce(directive ->> 'type', '') not in (
                      'setFormValues',
                      'updateFormModel',
                      'setFormData',
                      'updateFormData'
                    )
                  ),
                  true
                )
              else block
            end
            order by block_order
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements(coalesce(schema -> 'blocks', '[]'::jsonb))
          with ordinality as blocks(block, block_order)
        where block ->> 'kind' not in ('form', 'searchForm')
      ),
      true
    ) as schema
  from public.lowcode_pages
  where code = 'admin-system-users'
),
updated_page as (
  update public.lowcode_pages page
  set
    schema = next_schema.schema,
    version = page.version + 1,
    published_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  from next_schema
  where page.id = next_schema.id
  returning page.id, page.version, page.schema
)
insert into public.lowcode_page_versions (
  page_id,
  version,
  schema,
  published_at
)
select
  id,
  version,
  schema,
  timezone('utc'::text, now())
from updated_page
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;
