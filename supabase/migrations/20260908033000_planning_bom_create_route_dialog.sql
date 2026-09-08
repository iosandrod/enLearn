-- Open the operation edit page in a modal when a BOM row creates a route.
-- The planningBom material supplies the action script and invokes the
-- database-owned page function `newRoute`; no full-page navigation is used.

begin;

with page_update as (
  select
    page.id,
    jsonb_set(
      page.schema,
      '{eventHandlers}',
      coalesce(
        (
          select jsonb_agg(
            case
              when handler->>'event' = 'planningBom.createRoute'
                and handler->>'blockId' = 'records-grid'
              then jsonb_set(handler, '{directives}', '[]'::jsonb, true)
              else handler
            end
          )
          from jsonb_array_elements(coalesce(page.schema->'eventHandlers', '[]'::jsonb)) handler
        ),
        '[]'::jsonb
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
      and exists (
        select 1
        from jsonb_array_elements(coalesce(page.schema->'eventHandlers', '[]'::jsonb)) handler
        where handler->>'event' = 'planningBom.createRoute'
          and handler->>'blockId' = 'records-grid'
          and jsonb_array_length(coalesce(handler->'directives', '[]'::jsonb)) = 0
      )
  ) then
    raise exception 'The BOM create-route dialog handler could not be installed.';
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');

commit;
