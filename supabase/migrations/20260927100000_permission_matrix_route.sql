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
  'system-permission-matrix',
  '权限矩阵编辑',
  '/permission-edit',
  parent.id,
  'page',
  'ri-layout-grid-line',
  'permission-matrix',
  'admin.roles.manage',
  true,
  true,
  'dashboard',
  'active',
  45,
  jsonb_build_object('group', 'system')
from public.admin_routes parent
where parent.code = 'system-root'
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
