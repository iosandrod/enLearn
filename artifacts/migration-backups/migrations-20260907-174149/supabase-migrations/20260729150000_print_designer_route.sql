-- Register the print designer route and sidebar menu item.

insert into public.admin_permissions (
  code,
  name,
  description,
  resource_type,
  resource_key,
  action_code,
  status,
  sort_order
) values (
  'print.templates.manage',
  'Manage Print Templates',
  'Create and maintain print design templates.',
  'menu',
  'print_templates',
  'manage',
  'active',
  80
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  resource_type = excluded.resource_type,
  resource_key = excluded.resource_key,
  action_code = excluded.action_code,
  status = excluded.status,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc'::text, now());

insert into public.admin_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.admin_roles roles
join public.admin_permissions permissions
  on permissions.code = 'print.templates.manage'
where roles.code = 'system_admin'
on conflict do nothing;

with business_root as (
  insert into public.admin_routes (
    code,
    title,
    path,
    route_type,
    icon,
    visible,
    keep_alive,
    layout,
    status,
    sort_order,
    metadata
  ) values (
    'business-root',
    U&'\8FD0\8425\7BA1\7406',
    '/dashboard/business/_group',
    'group',
    'ri-dashboard-line',
    true,
    true,
    'dashboard',
    'active',
    10,
    '{"group": "business"}'::jsonb
  )
  on conflict (code) do update set
    code = public.admin_routes.code
  returning id
),
advanced_root as (
  insert into public.admin_routes (
    code,
    title,
    path,
    parent_id,
    route_type,
    icon,
    visible,
    keep_alive,
    layout,
    status,
    sort_order,
    metadata
  )
  select
    'advanced-root',
    U&'\9AD8\7EA7\529F\80FD',
    '/dashboard/advanced/_group',
    business_root.id,
    'group',
    'ri-tools-line',
    true,
    true,
    'dashboard',
    'active',
    30,
    '{"group": "advanced"}'::jsonb
  from business_root
  on conflict (code) do update set
    title = excluded.title,
    parent_id = excluded.parent_id,
    route_type = excluded.route_type,
    icon = excluded.icon,
    visible = excluded.visible,
    keep_alive = excluded.keep_alive,
    layout = excluded.layout,
    status = excluded.status,
    sort_order = excluded.sort_order,
    metadata = excluded.metadata,
    updated_at = timezone('utc'::text, now())
  returning id
)
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
  'print-designer',
  U&'\6253\5370\8BBE\8BA1\5668',
  '/dashboard/print-designer',
  advanced_root.id,
  'page',
  'ri-printer-line',
  null,
  'print.templates.manage',
  true,
  true,
  'dashboard',
  'active',
  50,
  '{"group": "advanced", "category": "designer", "module": "print", "pageKind": "designer"}'::jsonb
from advanced_root
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
