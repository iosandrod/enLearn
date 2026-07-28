-- Route metadata for the Trigger.dev workflow designer.

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
  'workflow.definitions.manage',
  'Manage Workflow Definitions',
  'Create and maintain workflow models and published definitions.',
  'entity',
  'workflow_definitions',
  'manage',
  'active',
  70
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
  on permissions.code = 'workflow.definitions.manage'
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
  'trigger-workflow-designer',
  U&'Trigger \7F16\6392\5668',
  '/dashboard/trigger-workflow/designer',
  business_root.id,
  'page',
  'ri-git-branch-line',
  null,
  'workflow.definitions.manage',
  true,
  true,
  'dashboard',
  'active',
  45,
  '{"group": "business", "module": "trigger-workflow", "pageKind": "designer"}'::jsonb
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
  updated_at = timezone('utc'::text, now());
