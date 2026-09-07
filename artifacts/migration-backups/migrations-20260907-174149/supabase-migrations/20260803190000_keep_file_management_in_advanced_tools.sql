-- File management is a static dashboard page exposed from the Advanced
-- Functions launcher. Keep it out of the low-code sidebar tree.

update public.admin_routes route
set
  parent_id = advanced_root.id,
  path = '/dashboard/files',
  route_type = 'page',
  page_code = null,
  visible = true,
  keep_alive = true,
  layout = 'dashboard',
  status = 'active',
  sort_order = 60,
  metadata = (
    coalesce(route.metadata, '{}'::jsonb)
      - 'navigation'
      - 'group'
      - 'category'
  ) || '{"group":"advanced","category":"file","module":"files","pageKind":"manager","renderMode":"static"}'::jsonb,
  updated_at = timezone('utc'::text, now())
from public.admin_routes advanced_root
where route.code = 'file-management'
  and advanced_root.code = 'advanced-root';

select pg_notify('pgrst', 'reload schema');
