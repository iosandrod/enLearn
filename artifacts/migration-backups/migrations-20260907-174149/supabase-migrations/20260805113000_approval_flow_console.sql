-- Register the native approval flow administrator console.

insert into public.admin_routes (
  code,
  title,
  path,
  parent_id,
  route_type,
  icon,
  page_code,
  permission_code,
  visible,
  keep_alive,
  layout,
  status,
  sort_order,
  metadata
)
select
  'approval-flow-console',
  U&'\5BA1\6279\6D41\603B\63A7\5236\53F0',
  '/dashboard/approval/console',
  parent.id,
  'page',
  'ri-dashboard-3-line',
  null,
  'workflow.runtime.manage',
  true,
  true,
  'dashboard',
  'active',
  15,
  '{"group":"approval","category":"runtime","native":true}'::jsonb
from public.admin_routes parent
where parent.code = 'approval-management-root'
on conflict (code) do update set
  title = excluded.title,
  path = excluded.path,
  parent_id = excluded.parent_id,
  route_type = excluded.route_type,
  icon = excluded.icon,
  page_code = excluded.page_code,
  permission_code = excluded.permission_code,
  visible = excluded.visible,
  keep_alive = excluded.keep_alive,
  layout = excluded.layout,
  status = excluded.status,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

insert into public.admin_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.admin_roles roles
join public.admin_permissions permissions
  on permissions.code = 'workflow.runtime.manage'
where roles.code in ('system_admin', 'operations_admin')
on conflict do nothing;

select pg_notify('pgrst', 'reload schema');
