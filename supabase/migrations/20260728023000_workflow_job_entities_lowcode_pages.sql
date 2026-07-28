-- Low-code workflow job entities, pages, and menu routes.

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
  'Inspect workflow runtime records, jobs, timers, and run history.',
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
) values
(
  'admin-workflow-jobs',
  '/dashboard/workflow/jobs',
  U&'Job \5B9A\4E49',
  U&'\67E5\770B workflow job \5B9A\4E49\3001Trigger \4EFB\52A1\3001\8C03\5EA6\89C4\5219\548C\72B6\6001\3002',
  'dashboard',
  'published',
  true,
  $json$
  {
    "code": "admin-workflow-jobs",
    "route": "/dashboard/workflow/jobs",
    "title": "Job \u5b9a\u4e49",
    "description": "\u67e5\u770b workflow job \u5b9a\u4e49\u3001Trigger \u4efb\u52a1\u3001\u8c03\u5ea6\u89c4\u5219\u548c\u72b6\u6001\u3002",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "workflowJobs": {
        "key": "workflowJobs",
        "label": "Workflow Jobs",
        "serviceName": "admin",
        "serviceMethod": "listWorkflowJobs",
        "postData": { "limit": 500 }
      }
    },
    "blocks": [
      {
        "id": "workflow-job-grid",
        "kind": "grid",
        "materialVersion": "1.0.0",
        "title": "Job \u5b9a\u4e49",
        "sourceKey": "workflowJobs",
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
              { "field": "name", "title": "\u540d\u79f0", "minWidth": 180, "showOverflow": "tooltip" },
              { "field": "code", "title": "\u7f16\u7801", "minWidth": 190, "showOverflow": "tooltip" },
              { "field": "type_label", "title": "\u7c7b\u578b", "width": 130, "align": "center" },
              { "field": "status_label", "title": "\u72b6\u6001", "width": 120, "align": "center" },
              { "field": "schedule_rule", "title": "\u8c03\u5ea6\u89c4\u5219", "minWidth": 160, "showOverflow": "tooltip" },
              { "field": "trigger_task_id", "title": "Trigger \u4efb\u52a1", "minWidth": 220, "showOverflow": "tooltip" },
              { "field": "schedule_id", "title": "Schedule", "minWidth": 180, "showOverflow": "tooltip" },
              { "field": "timezone", "title": "\u65f6\u533a", "width": 150, "showOverflow": "tooltip" },
              { "field": "timeout_seconds", "title": "\u8d85\u65f6(s)", "width": 110, "align": "right", "formatter": { "type": "number", "locale": "zh-CN", "emptyText": "-" } },
              { "field": "concurrency_key", "title": "\u5e76\u53d1\u952e", "minWidth": 160, "showOverflow": "tooltip" },
              { "field": "updated_at", "title": "\u66f4\u65b0\u65f6\u95f4", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } }
            ]
          }
        }
      }
    ]
  }
  $json$::jsonb
),
(
  'admin-workflow-job-runs',
  '/dashboard/workflow/job-runs',
  U&'Job \8FD0\884C\8BB0\5F55',
  U&'\67E5\770B workflow job \7684\8FD0\884C\5386\53F2\3001\72B6\6001\3001\8017\65F6\548C\9519\8BEF\4FE1\606F\3002',
  'dashboard',
  'published',
  true,
  $json$
  {
    "code": "admin-workflow-job-runs",
    "route": "/dashboard/workflow/job-runs",
    "title": "Job \u8fd0\u884c\u8bb0\u5f55",
    "description": "\u67e5\u770b workflow job \u7684\u8fd0\u884c\u5386\u53f2\u3001\u72b6\u6001\u3001\u8017\u65f6\u548c\u9519\u8bef\u4fe1\u606f\u3002",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "workflowJobRuns": {
        "key": "workflowJobRuns",
        "label": "Workflow Job Runs",
        "serviceName": "admin",
        "serviceMethod": "listWorkflowJobRuns",
        "postData": { "limit": 500 }
      }
    },
    "blocks": [
      {
        "id": "workflow-job-run-grid",
        "kind": "grid",
        "materialVersion": "1.0.0",
        "title": "Job \u8fd0\u884c\u8bb0\u5f55",
        "sourceKey": "workflowJobRuns",
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
              { "field": "job_name", "title": "Job \u540d\u79f0", "minWidth": 180, "showOverflow": "tooltip" },
              { "field": "job_code", "title": "Job \u7f16\u7801", "minWidth": 190, "showOverflow": "tooltip" },
              { "field": "status_label", "title": "\u72b6\u6001", "width": 120, "align": "center" },
              { "field": "attempt", "title": "\u5c1d\u8bd5", "width": 90, "align": "center" },
              { "field": "trigger_run_id", "title": "Trigger Run", "minWidth": 220, "showOverflow": "tooltip" },
              { "field": "duration_ms", "title": "\u8017\u65f6(ms)", "width": 120, "align": "right", "formatter": { "type": "number", "locale": "zh-CN", "emptyText": "-" } },
              { "field": "error_message", "title": "\u9519\u8bef\u4fe1\u606f", "minWidth": 240, "showOverflow": "tooltip" },
              { "field": "started_at", "title": "\u5f00\u59cb\u65f6\u95f4", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
              { "field": "finished_at", "title": "\u7ed3\u675f\u65f6\u95f4", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
              { "field": "created_at", "title": "\u521b\u5efa\u65f6\u95f4", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } }
            ]
          }
        }
      }
    ]
  }
  $json$::jsonb
),
(
  'admin-workflow-timer-jobs',
  '/dashboard/workflow/timer-jobs',
  U&'\5B9A\65F6\5668 Job',
  U&'\67E5\770B workflow timer job \7684\5230\671F\65F6\95F4\3001\8282\70B9\548C\89E6\53D1\72B6\6001\3002',
  'dashboard',
  'published',
  true,
  $json$
  {
    "code": "admin-workflow-timer-jobs",
    "route": "/dashboard/workflow/timer-jobs",
    "title": "\u5b9a\u65f6\u5668 Job",
    "description": "\u67e5\u770b workflow timer job \u7684\u5230\u671f\u65f6\u95f4\u3001\u8282\u70b9\u548c\u89e6\u53d1\u72b6\u6001\u3002",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "workflowTimerJobs": {
        "key": "workflowTimerJobs",
        "label": "Workflow Timer Jobs",
        "serviceName": "admin",
        "serviceMethod": "listWorkflowTimerJobs",
        "postData": { "limit": 500 }
      }
    },
    "blocks": [
      {
        "id": "workflow-timer-job-grid",
        "kind": "grid",
        "materialVersion": "1.0.0",
        "title": "\u5b9a\u65f6\u5668 Job",
        "sourceKey": "workflowTimerJobs",
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
              { "field": "node_id", "title": "\u8282\u70b9", "minWidth": 160, "showOverflow": "tooltip" },
              { "field": "status_label", "title": "\u72b6\u6001", "width": 120, "align": "center" },
              { "field": "due_state", "title": "\u5230\u671f", "width": 110, "align": "center" },
              { "field": "due_at", "title": "\u5230\u671f\u65f6\u95f4", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
              { "field": "process_instance_id", "title": "\u6d41\u7a0b\u5b9e\u4f8b", "minWidth": 240, "showOverflow": "tooltip" },
              { "field": "node_instance_id", "title": "\u8282\u70b9\u5b9e\u4f8b", "minWidth": 240, "showOverflow": "tooltip" },
              { "field": "definition_id", "title": "\u5b9a\u4e49", "minWidth": 230, "showOverflow": "tooltip" },
              { "field": "definition_version", "title": "\u7248\u672c", "width": 90, "align": "center" },
              { "field": "trigger_run_id", "title": "Trigger Run", "minWidth": 220, "showOverflow": "tooltip" },
              { "field": "updated_at", "title": "\u66f4\u65b0\u65f6\u95f4", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } }
            ]
          }
        }
      }
    ]
  }
  $json$::jsonb
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
) values
(
  'workflow_job_runs',
  U&'Job \8FD0\884C\8BB0\5F55',
  'public.wf_job_run',
  '/dashboard/workflow/job-runs',
  'admin-workflow-job-runs',
  'ri-history-line',
  U&'Workflow job \8FD0\884C\5386\53F2\7684\4F4E\4EE3\7801\5217\8868\89C6\56FE\3002',
  'id',
  'active',
  82,
  '{"list":{"source":"public.wf_job_run","method":"admin.listWorkflowJobRuns"}}'::jsonb
),
(
  'workflow_timer_jobs',
  U&'\5B9A\65F6\5668 Job',
  'public.wf_timer_job',
  '/dashboard/workflow/timer-jobs',
  'admin-workflow-timer-jobs',
  'ri-alarm-line',
  U&'Workflow timer job \7684\4F4E\4EE3\7801\5217\8868\89C6\56FE\3002',
  'id',
  'active',
  83,
  '{"list":{"source":"public.wf_timer_job","method":"admin.listWorkflowTimerJobs"}}'::jsonb
)
on conflict (table_name) do update set
  title = excluded.title,
  route_path = excluded.route_path,
  page_code = excluded.page_code,
  icon = excluded.icon,
  description = excluded.description,
  primary_key = excluded.primary_key,
  status = excluded.status,
  sort_order = excluded.sort_order,
  schema = excluded.schema,
  updated_at = timezone('utc'::text, now());

update public.admin_entities
set
  schema = coalesce(schema, '{}'::jsonb) || '{"workflowJobsPage":{"source":"public.wf_job","method":"admin.listWorkflowJobs","routePath":"/dashboard/workflow/jobs","pageCode":"admin-workflow-jobs"}}'::jsonb,
  updated_at = timezone('utc'::text, now())
where table_name = 'public.wf_job';

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
  route.code,
  route.title,
  route.path,
  business_root.id,
  'page',
  route.icon,
  route.page_code,
  'workflow.runtime.manage',
  true,
  true,
  'dashboard',
  'active',
  route.sort_order,
  route.metadata
from business_root
cross join (
  values
    (
      'workflow-jobs',
      U&'Job \5B9A\4E49',
      '/dashboard/workflow/jobs',
      'ri-timer-flash-line',
      'admin-workflow-jobs',
      46,
      '{"group": "business", "module": "workflow-jobs", "entity": "wf_job"}'::jsonb
    ),
    (
      'workflow-job-runs',
      U&'Job \8FD0\884C\8BB0\5F55',
      '/dashboard/workflow/job-runs',
      'ri-history-line',
      'admin-workflow-job-runs',
      47,
      '{"group": "business", "module": "workflow-job-runs", "entity": "wf_job_run"}'::jsonb
    ),
    (
      'workflow-timer-jobs',
      U&'\5B9A\65F6\5668 Job',
      '/dashboard/workflow/timer-jobs',
      'ri-alarm-line',
      'admin-workflow-timer-jobs',
      48,
      '{"group": "business", "module": "workflow-timer-jobs", "entity": "wf_timer_job"}'::jsonb
    )
) as route(code, title, path, icon, page_code, sort_order, metadata)
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
