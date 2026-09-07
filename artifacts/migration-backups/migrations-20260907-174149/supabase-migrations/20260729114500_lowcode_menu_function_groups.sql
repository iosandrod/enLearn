-- Split low-code application menus into second-level function groups.

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
  'lowcode-app-root',
  '低代码应用',
  '/dashboard/lowcode-app/_group',
  root.id,
  'group',
  'ri-apps-2-line',
  null,
  null,
  true,
  true,
  'dashboard',
  'active',
  20,
  '{"group":"lowcode-app"}'::jsonb
from public.admin_routes root
where root.code = 'business-root'
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
  updated_at = timezone('utc'::text, now());

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
  seed.code,
  seed.title,
  seed.path,
  parent.id,
  'group',
  seed.icon,
  null,
  null,
  true,
  true,
  'dashboard',
  'active',
  seed.sort_order,
  seed.metadata
from public.admin_routes parent
cross join (
  values
    ('lowcode-config-root', '页面配置', '/dashboard/lowcode-app/config/_group', 'ri-pages-line', 10, '{"group":"lowcode-app","category":"config"}'::jsonb),
    ('lowcode-user-root', '用户权限', '/dashboard/lowcode-app/users/_group', 'ri-shield-user-line', 20, '{"group":"lowcode-app","category":"user-permission"}'::jsonb),
    ('lowcode-notification-root', '消息通知', '/dashboard/lowcode-app/notifications/_group', 'ri-notification-3-line', 30, '{"group":"lowcode-app","category":"notification"}'::jsonb),
    ('lowcode-file-root', '文件资料', '/dashboard/lowcode-app/files/_group', 'ri-folder-3-line', 40, '{"group":"lowcode-app","category":"file"}'::jsonb),
    ('lowcode-job-root', '作业调度', '/dashboard/lowcode-app/jobs/_group', 'ri-timer-flash-line', 50, '{"group":"lowcode-app","category":"job"}'::jsonb),
    ('lowcode-metadata-root', '系统元数据', '/dashboard/lowcode-app/metadata/_group', 'ri-database-2-line', 60, '{"group":"lowcode-app","category":"metadata"}'::jsonb)
) as seed(code, title, path, icon, sort_order, metadata)
where parent.code = 'lowcode-app-root'
on conflict (code) do update set
  title = excluded.title,
  path = excluded.path,
  parent_id = excluded.parent_id,
  route_type = excluded.route_type,
  icon = excluded.icon,
  visible = excluded.visible,
  keep_alive = excluded.keep_alive,
  layout = excluded.layout,
  status = excluded.status,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

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
  'advanced-root',
  '高级功能',
  '/dashboard/advanced/_group',
  root.id,
  'group',
  'ri-tools-line',
  null,
  null,
  true,
  true,
  'dashboard',
  'active',
  30,
  '{"group":"advanced"}'::jsonb
from public.admin_routes root
where root.code = 'business-root'
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
  updated_at = timezone('utc'::text, now());

update public.admin_routes route
set
  parent_id = parent.id,
  title = seed.title,
  sort_order = seed.sort_order,
  metadata = coalesce(route.metadata, '{}'::jsonb) || seed.metadata,
  updated_at = timezone('utc'::text, now())
from (
  values
    ('lowcode-pages', 'lowcode-config-root', '低代码页面管理', 10, '{"group":"lowcode-app","category":"config"}'::jsonb),
    ('system-users', 'lowcode-user-root', '用户权限档案', 10, '{"group":"lowcode-app","category":"user-permission"}'::jsonb),
    ('system-roles', 'lowcode-user-root', '角色管理', 20, '{"group":"lowcode-app","category":"user-permission"}'::jsonb),
    ('system-permissions', 'lowcode-user-root', '权限管理', 30, '{"group":"lowcode-app","category":"user-permission"}'::jsonb),
    ('notification-message-center', 'lowcode-notification-root', '消息中心', 10, '{"group":"lowcode-app","category":"notification"}'::jsonb),
    ('notification-deliveries', 'lowcode-notification-root', '投递记录', 20, '{"group":"lowcode-app","category":"notification"}'::jsonb),
    ('system-file-entities', 'lowcode-file-root', '文件存储实体', 20, '{"group":"lowcode-app","category":"file"}'::jsonb),
    ('workflow-jobs', 'lowcode-job-root', '作业定义', 10, '{"group":"lowcode-app","category":"job"}'::jsonb),
    ('workflow-job-runs', 'lowcode-job-root', '作业运行记录', 20, '{"group":"lowcode-app","category":"job"}'::jsonb),
    ('workflow-timer-jobs', 'lowcode-job-root', '定时器任务', 30, '{"group":"lowcode-app","category":"job"}'::jsonb),
    ('system-execution-tasks', 'lowcode-job-root', '系统执行任务', 40, '{"group":"lowcode-app","category":"job"}'::jsonb),
    ('system-routes', 'lowcode-metadata-root', '动态路由', 10, '{"group":"lowcode-app","category":"metadata"}'::jsonb),
    ('system-entities', 'lowcode-metadata-root', '实体管理', 20, '{"group":"lowcode-app","category":"metadata"}'::jsonb),
    ('system-options', 'lowcode-metadata-root', '下拉数据', 30, '{"group":"lowcode-app","category":"metadata"}'::jsonb)
) as seed(code, parent_code, title, sort_order, metadata)
join public.admin_routes parent on parent.code = seed.parent_code
where route.code = seed.code;

update public.admin_routes route
set
  parent_id = parent.id,
  title = seed.title,
  sort_order = seed.sort_order,
  metadata = coalesce(route.metadata, '{}'::jsonb) || seed.metadata,
  updated_at = timezone('utc'::text, now())
from (
  values
    ('entity-design', '实体设计器', 10, '{"group":"advanced","category":"designer"}'::jsonb),
    ('lowcode-visual-designer', '可视化设计器', 20, '{"group":"advanced","category":"designer"}'::jsonb),
    ('workflow-designer', '审批流设计器', 30, '{"group":"advanced","category":"designer"}'::jsonb),
    ('trigger-workflow-designer', '触发器编排器', 40, '{"group":"advanced","category":"designer"}'::jsonb),
    ('print-designer', '打印设计器', 50, '{"group":"advanced","category":"designer"}'::jsonb),
    ('file-management', '文件管理', 60, '{"group":"advanced","category":"file"}'::jsonb)
) as seed(code, title, sort_order, metadata)
join public.admin_routes parent on parent.code = 'advanced-root'
where route.code = seed.code;
