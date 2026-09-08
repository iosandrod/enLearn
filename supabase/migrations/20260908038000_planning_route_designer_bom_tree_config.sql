-- Fix the standard VXE tree option names and hide the configured operation column.
begin;

with updated as (
  update public.lowcode_pages page
  set schema = jsonb_set(
    jsonb_set(
      page.schema,
      '{blocks,0,blocks,0,blocks,1,schema,grid,treeConfig}',
      '{
        "transform": false,
        "rowField": "id",
        "childrenField": "children",
        "expandAll": true,
        "showLine": true
      }'::jsonb,
      true
    ),
    '{blocks,0,blocks,0,blocks,1,schema,grid,columns,3,visible}',
    'false'::jsonb,
    true
  ),
  version = page.version + 1,
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now())
  where page.code = 'planning_route_designer'
    and page.schema #>> '{blocks,0,blocks,0,blocks,1,id}' = 'records-grid'
    and page.schema #>> '{blocks,0,blocks,0,blocks,1,kind}' = 'grid'
  returning page.id, page.version, page.schema, page.published_at
)
insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from updated
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

do $verify$
begin
  if not exists (
    select 1
    from public.lowcode_pages page
    where page.code = 'planning_route_designer'
      and page.schema #>> '{blocks,0,blocks,0,blocks,1,schema,grid,treeConfig,childrenField}' = 'children'
      and page.schema #>> '{blocks,0,blocks,0,blocks,1,schema,grid,treeConfig,rowField}' = 'id'
      and coalesce(
        page.schema #>> '{blocks,0,blocks,0,blocks,1,schema,grid,columns,3,visible}',
        'false'
      ) = 'false'
  ) then
    raise exception 'The route designer BOM tree configuration could not be installed.';
  end if;
end;
$verify$;

select pg_notify('pgrst', 'reload schema');
commit;
