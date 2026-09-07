-- Register the approval progress master-detail page and its sidebar entry.

insert into public.lowcode_pages (
  code,
  route,
  title,
  description,
  page_type,
  layout,
  status,
  keep_alive,
  schema,
  version,
  published_at
) values (
  'approval-progress',
  '/dashboard/approval/progress',
  U&'\5BA1\6279\8FDB\5EA6\7BA1\7406',
  U&'\5BA1\6279\5B9E\4F8B\3001\8282\70B9\5B9E\4F8B\4E0E\5BA1\6279\4EFB\52A1\67E5\8BE2\3002',
  'list',
  'dashboard',
  'published',
  true,
  $json$
  {
    "schemaVersion": 1,
    "code": "approval-progress",
    "route": "/dashboard/approval/progress",
    "title": "\u5ba1\u6279\u8fdb\u5ea6\u7ba1\u7406",
    "description": "\u5ba1\u6279\u5b9e\u4f8b\u3001\u8282\u70b9\u5b9e\u4f8b\u4e0e\u5ba1\u6279\u4efb\u52a1\u67e5\u8be2\u3002",
    "pageType": "list",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "approvalInstances": {
        "key": "approvalInstances",
        "label": "\u5ba1\u6279\u5b9e\u4f8b",
        "serviceName": "workflow",
        "serviceMethod": "listItems",
        "postData": {
          "itemType": "instances",
          "sorts": [
            { "field": "startedAt", "direction": "desc" }
          ],
          "limit": 1000
        },
        "autoLoad": true
      },
      "approvalNodeInstances": {
        "key": "approvalNodeInstances",
        "label": "\u8282\u70b9\u5b9e\u4f8b",
        "serviceName": "workflow",
        "serviceMethod": "listItems",
        "postData": {
          "itemType": "nodeInstances",
          "filters": { "processInstanceId": "__none__" },
          "sorts": [
            { "field": "startedAt", "direction": "asc", "nulls": "last" },
            { "field": "id", "direction": "asc" }
          ],
          "limit": 1000
        },
        "autoLoad": false
      },
      "approvalTasks": {
        "key": "approvalTasks",
        "label": "\u5ba1\u6279\u4efb\u52a1",
        "serviceName": "workflow",
        "serviceMethod": "listItems",
        "postData": {
          "itemType": "tasks",
          "filters": { "processInstanceId": "__none__" },
          "sorts": [
            { "field": "createdAt", "direction": "asc" }
          ],
          "limit": 1000
        },
        "autoLoad": false
      }
    },
    "blocks": [
      {
        "id": "approval-progress-actions",
        "kind": "buttonGroup",
        "align": "left",
        "gap": 8,
        "actions": [
          {
            "code": "show-all",
            "label": "\u5168\u90e8\u5b9e\u4f8b",
            "status": "primary",
            "icon": "ri-list-check-2",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "approvalInstances",
                "mode": "replace",
                "values": {}
              }
            ]
          },
          {
            "code": "show-running",
            "label": "\u8fdb\u884c\u4e2d",
            "icon": "ri-loader-4-line",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "approvalInstances",
                "mode": "replace",
                "values": { "status": "running" }
              }
            ]
          },
          {
            "code": "show-approved",
            "label": "\u5df2\u901a\u8fc7",
            "icon": "ri-checkbox-circle-line",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "approvalInstances",
                "mode": "replace",
                "values": { "status": "approved" }
              }
            ]
          },
          {
            "code": "show-rejected",
            "label": "\u5df2\u9a73\u56de",
            "icon": "ri-close-circle-line",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "approvalInstances",
                "mode": "replace",
                "values": { "status": "rejected" }
              }
            ]
          },
          {
            "code": "refresh",
            "label": "\u5237\u65b0",
            "icon": "ri-refresh-line",
            "directives": [
              {
                "type": "refreshDataSource",
                "sourceKeys": ["approvalInstances"]
              }
            ]
          }
        ]
      },
      {
        "id": "approval-instance-grid",
        "kind": "grid",
        "sourceKey": "approvalInstances",
        "schema": {
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": true,
            "height": 360,
            "rowConfig": { "keyField": "id", "isCurrent": true },
            "columns": [
              { "type": "seq", "title": "\u5e8f\u53f7", "width": 64, "align": "center" },
              { "field": "title", "title": "\u5ba1\u6279\u6807\u9898", "minWidth": 220, "fixed": "left", "sortable": true, "showOverflow": "tooltip" },
              { "field": "businessKey", "title": "\u4e1a\u52a1\u952e", "minWidth": 190, "fixed": "left", "showOverflow": "tooltip" },
              { "field": "documentType", "title": "\u5355\u636e\u7c7b\u578b", "minWidth": 140, "showOverflow": "tooltip", "formatter": { "type": "text", "emptyText": "-" } },
              { "field": "documentId", "title": "\u5355\u636eID", "minWidth": 210, "showOverflow": "tooltip", "formatter": { "type": "text", "emptyText": "-" } },
              {
                "field": "status",
                "title": "\u5ba1\u6279\u72b6\u6001",
                "width": 108,
                "align": "center",
                "sortable": true,
                "formatter": {
                  "type": "enum",
                  "map": {
                    "running": "\u8fdb\u884c\u4e2d",
                    "approved": "\u5df2\u901a\u8fc7",
                    "rejected": "\u5df2\u9a73\u56de",
                    "canceled": "\u5df2\u53d6\u6d88",
                    "terminated": "\u5df2\u7ec8\u6b62",
                    "failed": "\u5931\u8d25"
                  },
                  "emptyText": "-"
                }
              },
              { "field": "initiatorId", "title": "\u53d1\u8d77\u4ebaID", "minWidth": 260, "showOverflow": "tooltip", "formatter": { "type": "text", "emptyText": "-" } },
              { "field": "definitionVersion", "title": "\u5b9a\u4e49\u7248\u672c", "width": 110, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
              { "field": "startedAt", "title": "\u53d1\u8d77\u65f6\u95f4", "width": 180, "sortable": true, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
              { "field": "endedAt", "title": "\u7ed3\u675f\u65f6\u95f4", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
              { "field": "triggerRunId", "title": "Trigger Run ID", "minWidth": 220, "showOverflow": "tooltip", "formatter": { "type": "text", "emptyText": "-" } }
            ]
          },
          "rowActions": { "edit": false, "delete": false },
          "events": {
            "rowCurrentChange": [
              {
                "type": "setSearchFilters",
                "sourceKey": "approvalNodeInstances",
                "mode": "replace",
                "values": { "processInstanceId": "{{ event.row.id }}" }
              },
              {
                "type": "setSearchFilters",
                "sourceKey": "approvalTasks",
                "mode": "replace",
                "values": { "processInstanceId": "{{ event.row.id }}" }
              }
            ]
          }
        }
      },
      {
        "id": "approval-progress-child-tabs",
        "kind": "tabs",
        "defaultKey": "nodes",
        "tabs": [
          {
            "key": "nodes",
            "label": "\u8282\u70b9\u5b9e\u4f8b",
            "blocks": [
              {
                "id": "approval-node-instance-grid",
                "kind": "grid",
                "sourceKey": "approvalNodeInstances",
                "schema": {
                  "grid": {
                    "border": true,
                    "stripe": true,
                    "showOverflow": true,
                    "height": 240,
                    "rowConfig": { "keyField": "id", "isCurrent": true },
                    "columns": [
                      { "type": "seq", "title": "\u5e8f\u53f7", "width": 64, "align": "center" },
                      { "field": "name", "title": "\u8282\u70b9\u540d\u79f0", "minWidth": 180, "fixed": "left", "showOverflow": "tooltip" },
                      { "field": "nodeId", "title": "\u8282\u70b9ID", "minWidth": 180, "showOverflow": "tooltip" },
                      {
                        "field": "nodeType",
                        "title": "\u8282\u70b9\u7c7b\u578b",
                        "width": 110,
                        "align": "center",
                        "formatter": {
                          "type": "enum",
                          "map": {
                            "start": "\u5f00\u59cb",
                            "approval": "\u5ba1\u6279",
                            "sign": "\u4f1a\u7b7e",
                            "orSign": "\u6216\u7b7e",
                            "cc": "\u6284\u9001",
                            "condition": "\u6761\u4ef6",
                            "parallel": "\u5e76\u884c",
                            "service": "\u670d\u52a1",
                            "timer": "\u5b9a\u65f6",
                            "subProcess": "\u5b50\u6d41\u7a0b",
                            "end": "\u7ed3\u675f"
                          },
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "status",
                        "title": "\u8282\u70b9\u72b6\u6001",
                        "width": 110,
                        "align": "center",
                        "formatter": {
                          "type": "enum",
                          "map": {
                            "created": "\u5df2\u521b\u5efa",
                            "running": "\u8fd0\u884c\u4e2d",
                            "waiting": "\u7b49\u5f85\u4e2d",
                            "completed": "\u5df2\u5b8c\u6210",
                            "skipped": "\u5df2\u8df3\u8fc7",
                            "failed": "\u5931\u8d25"
                          },
                          "emptyText": "-"
                        }
                      },
                      { "field": "executionKey", "title": "\u6267\u884c\u952e", "minWidth": 220, "showOverflow": "tooltip", "formatter": { "type": "text", "emptyText": "-" } },
                      { "field": "startedAt", "title": "\u5f00\u59cb\u65f6\u95f4", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
                      { "field": "endedAt", "title": "\u7ed3\u675f\u65f6\u95f4", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } }
                    ]
                  },
                  "rowActions": { "edit": false, "delete": false }
                }
              }
            ]
          },
          {
            "key": "tasks",
            "label": "\u5ba1\u6279\u4efb\u52a1",
            "blocks": [
              {
                "id": "approval-task-grid",
                "kind": "grid",
                "sourceKey": "approvalTasks",
                "schema": {
                  "grid": {
                    "border": true,
                    "stripe": true,
                    "showOverflow": true,
                    "height": 240,
                    "rowConfig": { "keyField": "id", "isCurrent": true },
                    "columns": [
                      { "type": "seq", "title": "\u5e8f\u53f7", "width": 64, "align": "center" },
                      { "field": "title", "title": "\u4efb\u52a1\u6807\u9898", "minWidth": 220, "fixed": "left", "showOverflow": "tooltip" },
                      { "field": "nodeId", "title": "\u8282\u70b9ID", "minWidth": 170, "showOverflow": "tooltip" },
                      {
                        "field": "status",
                        "title": "\u4efb\u52a1\u72b6\u6001",
                        "width": 110,
                        "align": "center",
                        "formatter": {
                          "type": "enum",
                          "map": {
                            "pending": "\u5f85\u5904\u7406",
                            "claimed": "\u5df2\u8ba4\u9886",
                            "completed": "\u5df2\u5b8c\u6210",
                            "canceled": "\u5df2\u53d6\u6d88"
                          },
                          "emptyText": "-"
                        }
                      },
                      { "field": "assigneeId", "title": "\u5ba1\u6279\u4ebaID", "minWidth": 260, "showOverflow": "tooltip", "formatter": { "type": "text", "emptyText": "-" } },
                      { "field": "claimedAt", "title": "\u8ba4\u9886\u65f6\u95f4", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
                      { "field": "dueAt", "title": "\u622a\u6b62\u65f6\u95f4", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
                      { "field": "createdAt", "title": "\u521b\u5efa\u65f6\u95f4", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
                      { "field": "completedAt", "title": "\u5b8c\u6210\u65f6\u95f4", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
                      { "field": "waitpointTokenId", "title": "Waitpoint Token", "minWidth": 240, "showOverflow": "tooltip", "formatter": { "type": "text", "emptyText": "-" } },
                      { "field": "triggerRunId", "title": "Trigger Run ID", "minWidth": 220, "showOverflow": "tooltip", "formatter": { "type": "text", "emptyText": "-" } }
                    ]
                  },
                  "rowActions": { "edit": false, "delete": false }
                }
              }
            ]
          }
        ]
      }
    ]
  }
  $json$::jsonb,
  1,
  timezone('utc'::text, now())
)
on conflict (code) do update set
  route = excluded.route,
  title = excluded.title,
  description = excluded.description,
  page_type = excluded.page_type,
  layout = excluded.layout,
  status = excluded.status,
  keep_alive = excluded.keep_alive,
  schema = excluded.schema,
  version = public.lowcode_pages.version + 1,
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now());

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'approval-progress'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

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
    'wf_process_instance',
    U&'\5BA1\6279\5B9E\4F8B',
    'public.wf_process_instance',
    '/dashboard/approval/progress',
    'approval-progress',
    'ri-route-line',
    'Workflow process instances shown as the approval progress master records.',
    'id',
    'active',
    220,
    '{}'::jsonb
  ),
  (
    'wf_node_instance',
    U&'\8282\70B9\5B9E\4F8B',
    'public.wf_node_instance',
    '/dashboard/approval/progress/nodes',
    null,
    'ri-node-tree',
    'Workflow node instances associated with an approval process instance.',
    'id',
    'active',
    221,
    '{}'::jsonb
  ),
  (
    'wf_task',
    U&'\5BA1\6279\4EFB\52A1',
    'public.wf_task',
    '/dashboard/approval/progress/tasks',
    null,
    'ri-task-line',
    'Workflow approval tasks associated with an approval process instance.',
    'id',
    'active',
    222,
    '{}'::jsonb
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

update public.admin_routes
set
  metadata = coalesce(metadata, '{}'::jsonb) || '{"navigation":"sidebar"}'::jsonb,
  updated_at = timezone('utc'::text, now())
where code = 'approval-management-root';

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
  'approval-progress',
  U&'\5BA1\6279\8FDB\5EA6\7BA1\7406',
  '/dashboard/approval/progress',
  parent.id,
  'page',
  'ri-route-line',
  'approval-progress',
  'workflow.runtime.manage',
  true,
  true,
  'dashboard',
  'active',
  20,
  '{"group":"approval","category":"runtime"}'::jsonb
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
