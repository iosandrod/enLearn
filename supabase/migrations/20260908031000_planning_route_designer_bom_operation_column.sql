-- Add producer-route actions to the BOM block embedded in the route designer.
-- The route designer page is database-owned, so keep this behavior in its
-- low-code schema instead of hard-coding it in the frontend.

begin;

with page_update as (
  select
    page.id,
    page.version,
    jsonb_set(
      jsonb_set(
        page.schema,
        '{blocks,0,blocks,0,blocks,1}',
        (
          ((page.schema #> '{blocks,0,blocks,0,blocks,1}') - 'schema') ||
          jsonb_build_object(
            'kind', 'planningBom',
            'title', 'BOM 结构',
            'sourceKey', 'records-grid',
            'height', '360px',
            'description', '查看物料可用工艺路线，并在右侧查看路线模型。',
            'keyField', 'id',
            'titleField', 'title',
            'childrenField', 'children',
            'routeActionDirectives', '[]'::jsonb
          )
        ),
        true
      ),
      '{eventHandlers}',
      (
        coalesce(
          (
            select jsonb_agg(handler)
            from jsonb_array_elements(coalesce(page.schema->'eventHandlers', '[]'::jsonb)) handler
            where not (
              handler->>'blockId' = 'records-grid'
              and handler->>'event' in ('planningBom.routeSelect', 'planningBom.createRoute')
            )
          ),
          '[]'::jsonb
        ) || jsonb_build_array(
          jsonb_build_object(
            'event', 'planningBom.routeSelect',
            'blockId', 'records-grid',
            'directives', jsonb_build_array(
              jsonb_build_object(
                'type', 'setSearchFilters',
                'sourceKey', 'planning_route_designer_flow',
                'mode', 'replace',
                'values', jsonb_build_object('operationId', '{{ event.route.id }}')
              )
            )
          ),
          jsonb_build_object(
            'event', 'planningBom.createRoute',
            'blockId', 'records-grid',
            'directives', jsonb_build_array(
              jsonb_build_object(
                'type', 'navigate',
                'route', '/dashboard/planning/operation/edit?prefill=%7B%22item_id%22%3A%22{{ event.materialId }}%22%2C%22type%22%3A%22routing%22%7D&fromPage=planning_route_designer'
              )
            )
          )
        )
      ),
      true
    ) as schema
  from public.lowcode_pages page
  where page.code = 'planning_route_designer'
), changed as (
  update public.lowcode_pages page
  set schema = update.schema,
      version = page.version + 1,
      published_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  from page_update update
  where page.id = update.id
    and page.schema is distinct from update.schema
  returning page.id, page.version, page.schema, page.published_at
)
insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from changed
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

do $$
begin
  if not exists (
    select 1
    from public.lowcode_pages page
    where page.code = 'planning_route_designer'
      and page.schema #>> '{blocks,0,blocks,0,blocks,1,kind}' = 'planningBom'
      and exists (
        select 1
        from jsonb_array_elements(coalesce(page.schema->'eventHandlers', '[]'::jsonb)) handler
        where handler->>'event' = 'planningBom.routeSelect'
          and handler->>'blockId' = 'records-grid'
      )
      and exists (
        select 1
        from jsonb_array_elements(coalesce(page.schema->'eventHandlers', '[]'::jsonb)) handler
        where handler->>'event' = 'planningBom.createRoute'
          and handler->>'blockId' = 'records-grid'
      )
  ) then
    raise exception 'The route designer BOM operation column could not be installed.';
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');

commit;
