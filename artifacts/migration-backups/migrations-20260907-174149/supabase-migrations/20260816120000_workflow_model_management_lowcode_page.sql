-- Add workflow model management to the job scheduler low-code menu.

begin;

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
  table_name,
  version,
  published_at
) values (
  'workflow-model-management',
  '/dashboard/workflow/models',
  U&'\6D41\7A0B\7BA1\7406',
  U&'\6D41\7A0B\6A21\578B\7684\67E5\770B\3001\72B6\6001\7B5B\9009\4E0E\8FDB\5165\8BBE\8BA1\5668\3002',
  'list',
  'dashboard',
  'published',
  true,
  $json$
  {
    "schemaVersion": 1,
    "code": "workflow-model-management",
    "route": "/dashboard/workflow/models",
    "title": "\u6d41\u7a0b\u7ba1\u7406",
    "description": "\u6d41\u7a0b\u6a21\u578b\u7684\u67e5\u770b\u3001\u72b6\u6001\u7b5b\u9009\u4e0e\u8fdb\u5165\u8bbe\u8ba1\u5668\u3002",
    "pageType": "list",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "workflowModels": {
        "key": "workflowModels",
        "label": "\u6d41\u7a0b\u6a21\u578b",
        "serviceName": "workflow",
        "serviceMethod": "listItems",
        "postData": {
          "itemType": "models",
          "limit": 500
        },
        "autoLoad": true
      }
    },
    "blocks": [
      {
        "id": "workflow-model-actions",
        "kind": "buttonGroup",
        "align": "left",
        "gap": 8,
        "actions": [
          {
            "code": "show-all-workflow-models",
            "label": "\u5168\u90e8",
            "status": "primary",
            "icon": "ri-list-check-2",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "workflowModels",
                "mode": "replace",
                "values": {}
              }
            ]
          },
          {
            "code": "show-published-workflow-models",
            "label": "\u5df2\u53d1\u5e03",
            "icon": "ri-checkbox-circle-line",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "workflowModels",
                "mode": "replace",
                "values": {
                  "status": "published"
                }
              }
            ]
          },
          {
            "code": "show-draft-workflow-models",
            "label": "\u8349\u7a3f",
            "icon": "ri-draft-line",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "workflowModels",
                "mode": "replace",
                "values": {
                  "status": "draft"
                }
              }
            ]
          },
          {
            "code": "show-disabled-workflow-models",
            "label": "\u5df2\u505c\u7528",
            "icon": "ri-forbid-line",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "workflowModels",
                "mode": "replace",
                "values": {
                  "status": "disabled"
                }
              }
            ]
          },
          {
            "code": "reload-workflow-models",
            "label": "\u5237\u65b0",
            "icon": "ri-refresh-line",
            "directives": [
              {
                "type": "refreshDataSource",
                "sourceKeys": [
                  "workflowModels"
                ]
              }
            ]
          },
          {
            "code": "create-workflow-model",
            "label": "\u65b0\u5efa\u6d41\u7a0b",
            "status": "success",
            "icon": "ri-add-line",
            "route": "/dashboard/workflow/designer"
          }
        ]
      },
      {
        "id": "workflow-model-grid",
        "kind": "grid",
        "sourceKey": "workflowModels",
        "schema": {
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": "tooltip",
            "height": 520,
            "rowConfig": {
              "keyField": "id",
              "isCurrent": true
            },
            "columns": [
              {
                "type": "seq",
                "title": "\u5e8f\u53f7",
                "width": 64,
                "align": "center"
              },
              {
                "field": "name",
                "title": "\u6d41\u7a0b\u540d\u79f0",
                "minWidth": 220,
                "fixed": "left",
                "sortable": true,
                "showOverflow": "tooltip"
              },
              {
                "field": "code",
                "title": "\u6d41\u7a0b\u7f16\u7801",
                "minWidth": 220,
                "sortable": true,
                "showOverflow": "tooltip"
              },
              {
                "field": "documentType",
                "title": "\u4e1a\u52a1\u7c7b\u578b",
                "minWidth": 180,
                "showOverflow": "tooltip",
                "formatter": {
                  "type": "text",
                  "emptyText": "-"
                }
              },
              {
                "field": "status",
                "title": "\u72b6\u6001",
                "width": 110,
                "align": "center",
                "formatter": {
                  "type": "enum",
                  "map": {
                    "draft": "\u8349\u7a3f",
                    "published": "\u5df2\u53d1\u5e03",
                    "disabled": "\u5df2\u505c\u7528",
                    "archived": "\u5df2\u5f52\u6863"
                  },
                  "emptyText": "-"
                }
              },
              {
                "field": "currentVersion",
                "title": "\u5f53\u524d\u7248\u672c",
                "width": 110,
                "align": "right",
                "sortable": true,
                "formatter": {
                  "type": "number",
                  "locale": "zh-CN",
                  "emptyText": "0"
                }
              },
              {
                "field": "updatedAt",
                "title": "\u66f4\u65b0\u65f6\u95f4",
                "width": 180,
                "sortable": true,
                "formatter": {
                  "type": "datetime",
                  "locale": "zh-CN",
                  "emptyText": "-"
                }
              },
              {
                "title": "\u64cd\u4f5c",
                "width": 110,
                "fixed": "right",
                "slots": {
                  "default": "actions"
                }
              }
            ]
          },
          "rowActions": {
            "edit": false,
            "delete": false,
            "actions": [
              {
                "code": "design-workflow-model",
                "label": "\u8bbe\u8ba1",
                "status": "primary",
                "icon": "ri-edit-box-line",
                "directives": [
                  {
                    "type": "navigate",
                    "route": "/dashboard/workflow/designer/{{ row.id }}"
                  }
                ]
              }
            ]
          },
          "events": {
            "rowDblclick": [
              {
                "type": "navigate",
                "route": "/dashboard/workflow/designer/{{ row.id }}"
              }
            ]
          }
        }
      }
    ]
  }
  $json$::jsonb,
  'wf_model',
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
  table_name = excluded.table_name,
  version = public.lowcode_pages.version + 1,
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now());

insert into public.lowcode_page_versions (
  page_id,
  version,
  schema,
  published_at
)
select
  id,
  version,
  schema,
  published_at
from public.lowcode_pages
where code = 'workflow-model-management'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

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
  'workflow-model-management',
  U&'\6D41\7A0B\7BA1\7406',
  '/dashboard/workflow/models',
  parent.id,
  'page',
  'ri-flow-chart',
  'workflow-model-management',
  'workflow.definitions.manage',
  true,
  true,
  'dashboard',
  'active',
  50,
  '{"group":"lowcode-app","category":"job","entity":"wf_model"}'::jsonb
from public.admin_routes parent
where parent.code = 'lowcode-job-root'
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

select pg_notify('pgrst', 'reload schema');

commit;
