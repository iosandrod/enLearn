-- Low-code picker used by the Trigger workflow designer's load action.

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
  'trigger-workflow-models',
  '/dashboard/trigger-workflow/models',
  '触发器流程',
  '选择已保存的 Trigger.dev 编排流程。',
  'list',
  'dashboard',
  'published',
  false,
  $json$
  {
    "schemaVersion": 1,
    "code": "trigger-workflow-models",
    "route": "/dashboard/trigger-workflow/models",
    "title": "触发器流程",
    "description": "选择已保存的 Trigger.dev 编排流程。",
    "pageType": "list",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": false,
    "dataSources": {
      "triggerWorkflowModels": {
        "key": "triggerWorkflowModels",
        "label": "触发器流程",
        "serviceName": "workflow",
        "serviceMethod": "listItems",
        "postData": {
          "itemType": "models",
          "filters": {
            "documentType": "trigger-workflow"
          },
          "limit": 200
        },
        "autoLoad": true
      }
    },
    "blocks": [
      {
        "id": "trigger-workflow-model-actions",
        "kind": "buttonGroup",
        "align": "left",
        "gap": 8,
        "actions": [
          {
            "code": "refresh-trigger-workflow-models",
            "label": "刷新",
            "icon": "ri-refresh-line",
            "directives": [
              {
                "type": "refreshDataSource",
                "sourceKeys": ["triggerWorkflowModels"]
              }
            ]
          }
        ]
      },
      {
        "id": "trigger-workflow-model-grid",
        "kind": "grid",
        "sourceKey": "triggerWorkflowModels",
        "schema": {
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": "tooltip",
            "height": 460,
            "rowConfig": {
              "keyField": "id",
              "isCurrent": true
            },
            "columns": [
              {
                "type": "seq",
                "title": "序号",
                "width": 64,
                "align": "center"
              },
              {
                "field": "name",
                "title": "流程名称",
                "minWidth": 220,
                "fixed": "left",
                "sortable": true,
                "showOverflow": "tooltip"
              },
              {
                "field": "code",
                "title": "流程编码",
                "minWidth": 220,
                "sortable": true,
                "showOverflow": "tooltip"
              },
              {
                "field": "status",
                "title": "状态",
                "width": 110,
                "align": "center",
                "formatter": {
                  "type": "enum",
                  "map": {
                    "draft": "草稿",
                    "published": "已发布",
                    "disabled": "已停用",
                    "archived": "已归档"
                  },
                  "emptyText": "-"
                }
              },
              {
                "field": "currentVersion",
                "title": "当前版本",
                "width": 110,
                "align": "right",
                "formatter": {
                  "type": "number",
                  "locale": "zh-CN",
                  "emptyText": "0"
                }
              },
              {
                "field": "updatedAt",
                "title": "更新时间",
                "width": 180,
                "sortable": true,
                "formatter": {
                  "type": "datetime",
                  "locale": "zh-CN",
                  "emptyText": "-"
                }
              }
            ]
          },
          "rowActions": {
            "edit": false,
            "delete": false,
            "actions": []
          },
          "events": {
            "rowCurrentChange": [],
            "rowDblclick": []
          }
        }
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
  published_at = excluded.published_at,
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
where code = 'trigger-workflow-models'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

select pg_notify('pgrst', 'reload schema');
