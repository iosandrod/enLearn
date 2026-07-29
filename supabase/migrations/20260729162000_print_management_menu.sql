-- Add print management menu entries for print templates and print logs.

insert into public.admin_permissions (
  code,
  name,
  description,
  resource_type,
  resource_key,
  action_code,
  status,
  sort_order
) values
(
  'print.templates.manage',
  'Manage Print Templates',
  'Create and maintain print design templates.',
  'menu',
  'print_templates',
  'manage',
  'active',
  80
)
,
(
  'print.logs.view',
  'View Print Logs',
  'View print execution logs.',
  'menu',
  'print_logs',
  'view',
  'active',
  81
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
  on permissions.code in ('print.templates.manage', 'print.logs.view')
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
print_root as (
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
    'print-management-root',
    U&'\6253\5370\7BA1\7406',
    '/dashboard/print/_group',
    business_root.id,
    'group',
    'ri-printer-line',
    null,
    null,
    true,
    true,
    'dashboard',
    'active',
    55,
    '{"group": "lowcode-app", "category": "print"}'::jsonb
  from business_root
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
  route.code,
  route.title,
  route.path,
  print_root.id,
  'page',
  route.icon,
  null,
  route.permission_code,
  true,
  true,
  'dashboard',
  'active',
  route.sort_order,
  route.metadata
from print_root
cross join (
  values
    (
      'print-designer',
      U&'\6253\5370\6A21\677F',
      '/dashboard/print-designer',
      'ri-file-paper-2-line',
      'print.templates.manage',
      10,
      '{"group": "lowcode-app", "category": "print", "module": "print", "pageKind": "templates"}'::jsonb
    ),
    (
      'print-logs',
      U&'\6253\5370\65E5\5FD7',
      '/dashboard/print/logs',
      'ri-file-list-3-line',
      'print.logs.view',
      20,
      '{"group": "lowcode-app", "category": "print", "module": "print", "pageKind": "logs"}'::jsonb
    )
) as route(code, title, path, icon, permission_code, sort_order, metadata)
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
