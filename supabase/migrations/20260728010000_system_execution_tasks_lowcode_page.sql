-- Low-code system execution task list page and menu route.

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
  'workflow.runtime.manage',
  'Manage Workflow Runtime',
  'Inspect workflow runtime records, timers, and system execution tasks.',
  'entity',
  'workflow_runtime',
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
  on permissions.code = 'workflow.runtime.manage'
where roles.code = 'system_admin'
on conflict do nothing;

insert into public.lowcode_pages (
  code,
  route,
  title,
  description,
  layout,
  status,
  keep_alive,
  schema
) values (
  'admin-system-execution-tasks',
  '/dashboard/system/execution-tasks',
  U&'\7CFB\7EDF\6267\884C\4EFB\52A1',
  U&'\67E5\770B\7CFB\7EDF\5B9A\65F6\4EFB\52A1\3001\8C03\5EA6\72B6\6001\548C\6700\8FD1\6267\884C\7ED3\679C\3002',
  'dashboard',
  'published',
  true,
  '{
    "code": "admin-system-execution-tasks",
    "route": "/dashboard/system/execution-tasks",
    "title": "\u7cfb\u7edf\u6267\u884c\u4efb\u52a1",
    "description": "\u67e5\u770b\u7cfb\u7edf\u5b9a\u65f6\u4efb\u52a1\u3001\u8c03\u5ea6\u72b6\u6001\u548c\u6700\u8fd1\u6267\u884c\u7ed3\u679c\u3002",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "systemExecutionTasks": {
        "key": "systemExecutionTasks",
        "serviceName": "admin",
        "serviceMethod": "listSystemExecutionTasks"
      }
    },
    "blocks": [
      {
        "id": "task-grid",
        "kind": "grid",
        "title": "\u5b9a\u65f6\u4efb\u52a1\u5217\u8868",
        "sourceKey": "systemExecutionTasks",
        "schema": {
          "toolbar": [
            { "code": "refresh", "label": "\u5237\u65b0", "status": "primary" }
          ],
          "rowActions": { "edit": false, "delete": false },
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": "tooltip",
            "rowConfig": { "keyField": "id" },
            "columns": [
              { "field": "name", "title": "\u4efb\u52a1\u540d\u79f0", "minWidth": 180, "showOverflow": "tooltip" },
              { "field": "code", "title": "\u7f16\u7801", "minWidth": 180, "showOverflow": "tooltip" },
              { "field": "type_label", "title": "\u7c7b\u578b", "width": 130, "align": "center" },
              { "field": "status_label", "title": "\u72b6\u6001", "width": 120, "align": "center" },
              { "field": "schedule_rule", "title": "\u8c03\u5ea6\u89c4\u5219", "minWidth": 170, "showOverflow": "tooltip" },
              { "field": "trigger_task_id", "title": "Trigger \u4efb\u52a1", "minWidth": 210, "showOverflow": "tooltip" },
              { "field": "timezone", "title": "\u65f6\u533a", "width": 150, "showOverflow": "tooltip" },
              { "field": "last_run_status", "title": "\u6700\u8fd1\u72b6\u6001", "width": 130, "align": "center" },
              {
                "field": "last_run_at",
                "title": "\u6700\u8fd1\u6267\u884c",
                "width": 180,
                "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" }
              },
              {
                "field": "recent_run_count",
                "title": "\u6700\u8fd1\u6b21\u6570",
                "width": 110,
                "align": "center",
                "formatter": { "type": "number", "locale": "zh-CN", "emptyText": "0" }
              },
              { "field": "last_error_message", "title": "\u9519\u8bef\u4fe1\u606f", "minWidth": 220, "showOverflow": "tooltip" },
              {
                "field": "updated_at",
                "title": "\u66f4\u65b0\u65f6\u95f4",
                "width": 180,
                "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" }
              }
            ]
          }
        }
      }
    ]
  }'::jsonb
)
on conflict (code) do update set
  route = excluded.route,
  title = excluded.title,
  description = excluded.description,
  layout = excluded.layout,
  status = excluded.status,
  keep_alive = excluded.keep_alive,
  schema = excluded.schema,
  updated_at = timezone('utc'::text, now());

insert into public.admin_entities (
  code,
  title,
  table_name,
  route_path,
  page_code,
  icon,
  description,
  primary_key,
  status,
  sort_order,
  schema
) values (
  'system_execution_tasks',
  U&'\7CFB\7EDF\6267\884C\4EFB\52A1',
  'public.wf_job',
  '/dashboard/system/execution-tasks',
  'admin-system-execution-tasks',
  'ri-timer-line',
  U&'\7CFB\7EDF\5B9A\65F6\4EFB\52A1\7684\4F4E\4EE3\7801\5217\8868\89C6\56FE\3002',
  'id',
  'active',
  70,
  '{"list":{"source":"public.wf_job","method":"admin.listSystemExecutionTasks"}}'::jsonb
)
on conflict (code) do update set
  title = excluded.title,
  table_name = excluded.table_name,
  route_path = excluded.route_path,
  page_code = excluded.page_code,
  icon = excluded.icon,
  description = excluded.description,
  primary_key = excluded.primary_key,
  status = excluded.status,
  sort_order = excluded.sort_order,
  schema = excluded.schema,
  updated_at = timezone('utc'::text, now());

with root_route as (
  insert into public.admin_routes (
    code,
    title,
    path,
    route_type,
    icon,
    page_code,
    visible,
    keep_alive,
    layout,
    status,
    sort_order,
    metadata
  ) values (
    'system-root',
    U&'\7CFB\7EDF\8BBE\7F6E',
    '/dashboard/system',
    'group',
    'setting',
    'admin-system-home',
    true,
    true,
    'dashboard',
    'active',
    10,
    '{"group": "system"}'::jsonb
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
  'system-execution-tasks',
  U&'\7CFB\7EDF\6267\884C\4EFB\52A1',
  '/dashboard/system/execution-tasks',
  root_route.id,
  'page',
  'ri-timer-line',
  'admin-system-execution-tasks',
  'workflow.runtime.manage',
  true,
  true,
  'dashboard',
  'active',
  70,
  '{"group": "system", "module": "system-execution-tasks"}'::jsonb
from root_route
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
