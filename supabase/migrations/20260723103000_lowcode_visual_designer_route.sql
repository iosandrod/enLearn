-- Route metadata for the visual low-code designer ported from vite-vue3-lowcode.

with lowcode_root as (
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
    'lowcode-root',
    'Low-Code Studio',
    '/dashboard/low-code/_group',
    'group',
    'layout',
    true,
    true,
    'dashboard',
    'active',
    15,
    '{"group": "lowcode"}'::jsonb
  )
  on conflict (code) do update set
    title = excluded.title,
    path = excluded.path,
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
  permission_code,
  visible,
  keep_alive,
  layout,
  status,
  sort_order,
  metadata
)
select
  route_seed.code,
  route_seed.title,
  route_seed.path,
  lowcode_root.id,
  'page',
  route_seed.icon,
  'lowcode.pages.manage',
  true,
  true,
  'dashboard',
  'active',
  route_seed.sort_order,
  '{"group": "lowcode"}'::jsonb
from lowcode_root
cross join (
  values
    ('lowcode-pages', 'Low-Code Pages', '/dashboard/low-code', 'table', 10),
    ('lowcode-visual-designer', 'Visual Designer', '/dashboard/low-code/designer', 'edit', 20)
) as route_seed(code, title, path, icon, sort_order)
on conflict (code) do update set
  title = excluded.title,
  path = excluded.path,
  parent_id = excluded.parent_id,
  route_type = excluded.route_type,
  icon = excluded.icon,
  permission_code = excluded.permission_code,
  visible = excluded.visible,
  keep_alive = excluded.keep_alive,
  layout = excluded.layout,
  status = excluded.status,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());
