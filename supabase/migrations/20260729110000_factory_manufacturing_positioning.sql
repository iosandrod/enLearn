-- Reposition the admin shell for factory manufacturing management.

update public.admin_routes
set
  title = '生产运营',
  icon = 'ri-factory-line',
  metadata = coalesce(metadata, '{}'::jsonb) || '{"group":"production"}'::jsonb,
  updated_at = timezone('utc'::text, now())
where code = 'business-root';

update public.admin_routes
set
  title = '工作台',
  icon = 'ri-dashboard-3-line',
  metadata = coalesce(metadata, '{}'::jsonb) || '{"module":"manufacturing-workbench"}'::jsonb,
  updated_at = timezone('utc'::text, now())
where code = 'dashboard-home';
