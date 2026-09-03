-- Surface the process route designer in the Advanced tools group.
-- The page was originally provisioned under Planning > Basic Data; existing
-- installations need the same navigation placement as fresh installations.

begin;

update public.admin_routes route
set
  parent_id = advanced_root.id,
  sort_order = 65,
  metadata = coalesce(route.metadata, '{}'::jsonb) ||
    '{"group":"advanced","category":"planning","module":"planning","pageKind":"route-designer"}'::jsonb,
  updated_at = timezone('utc'::text, now())
from public.admin_routes advanced_root
where route.code = 'planning-route-designer'
  and advanced_root.code = 'advanced-root';

do $$
begin
  if not exists (
    select 1
    from public.admin_routes route
    join public.admin_routes parent on parent.id = route.parent_id
    where route.code = 'planning-route-designer'
      and route.title = '工艺路线设计'
      and route.path = '/dashboard/planning/route-designer'
      and route.page_code = 'planning_route_designer'
      and route.status = 'active'
      and parent.code = 'advanced-root'
  ) then
    raise exception 'The planning route designer navigation route could not be moved to advanced-root.';
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');

commit;
