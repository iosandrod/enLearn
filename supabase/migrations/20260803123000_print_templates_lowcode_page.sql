-- Register the print template archive as a database-backed low-code page.

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
  'print_templates',
  U&'\6253\5370\6A21\677F',
  'public.print_templates',
  '/dashboard/print/templates',
  null,
  'ri-file-paper-2-line',
  'Print designer template records and workspace configuration.',
  'id',
  'active',
  220,
  '{
    "readPermissions": ["print.templates.manage"],
    "list": {
      "orderBy": "updated_at",
      "orderDirection": "desc",
      "searchFields": ["name", "status"]
    }
  }'::jsonb
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

insert into public.lowcode_pages (
  code,
  route,
  title,
  description,
  layout,
  status,
  keep_alive,
  schema,
  version,
  published_at
) values (
  'print-templates',
  '/dashboard/print/templates',
  U&'\6253\5370\6A21\677F',
  U&'\6253\5370\6A21\677F\6863\6848\4E0E\8BBE\8BA1\914D\7F6E\3002',
  'dashboard',
  'published',
  true,
  $json$
  {
    "schemaVersion": 1,
    "code": "print-templates",
    "route": "/dashboard/print/templates",
    "title": "打印模板",
    "description": "打印模板档案与设计配置。",
    "pageType": "list",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "printTemplates": {
        "key": "printTemplates",
        "label": "打印模板档案",
        "serviceName": "admin",
        "serviceMethod": "listItems",
        "entityCode": "print_templates",
        "tableName": "print_templates",
        "postData": {
          "entityCode": "print_templates",
          "tableName": "print_templates",
          "sorts": [
            { "field": "updated_at", "direction": "desc" },
            { "field": "created_at", "direction": "desc" }
          ],
          "limit": 1000
        },
        "autoLoad": true
      },
      "selectedPrintTemplateRows": {
        "key": "selectedPrintTemplateRows",
        "label": "当前打印模板",
        "serviceName": "admin",
        "serviceMethod": "listItems",
        "entityCode": "print_templates",
        "tableName": "print_templates",
        "postData": {
          "entityCode": "print_templates",
          "tableName": "print_templates",
          "filters": { "id": "__none__" },
          "limit": 1
        },
        "autoLoad": false
      }
    },
    "blocks": [
      {
        "id": "print-template-actions",
        "kind": "buttonGroup",
        "align": "left",
        "gap": 8,
        "actions": [
          {
            "code": "show-all-templates",
            "label": "全部模板",
            "status": "primary",
            "icon": "ri-list-check-2",
            "eventName": "printTemplate.actions.showAll",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "printTemplates",
                "mode": "replace",
                "values": {}
              }
            ]
          },
          {
            "code": "show-active-templates",
            "label": "启用",
            "icon": "ri-checkbox-circle-line",
            "eventName": "printTemplate.actions.showActive",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "printTemplates",
                "mode": "replace",
                "values": { "status": "active" }
              }
            ]
          },
          {
            "code": "show-draft-templates",
            "label": "草稿",
            "icon": "ri-draft-line",
            "eventName": "printTemplate.actions.showDraft",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "printTemplates",
                "mode": "replace",
                "values": { "status": "draft" }
              }
            ]
          },
          {
            "code": "show-archived-templates",
            "label": "已归档",
            "icon": "ri-archive-line",
            "eventName": "printTemplate.actions.showArchived",
            "directives": [
              {
                "type": "setSearchFilters",
                "sourceKey": "printTemplates",
                "mode": "replace",
                "values": { "status": "archived" }
              }
            ]
          },
          {
            "code": "reload-print-templates",
            "label": "刷新",
            "icon": "ri-refresh-line",
            "eventName": "printTemplate.actions.reload",
            "directives": [
              {
                "type": "refreshDataSource",
                "sourceKeys": ["printTemplates"]
              }
            ]
          }
        ]
      },
      {
        "id": "print-template-main-grid",
        "kind": "grid",
        "sourceKey": "printTemplates",
        "schema": {
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": true,
            "height": 360,
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
                "title": "模板名称",
                "minWidth": 220,
                "fixed": "left",
                "sortable": true,
                "showOverflow": "tooltip"
              },
              {
                "field": "id",
                "title": "模板ID",
                "minWidth": 280,
                "showOverflow": "tooltip"
              },
              {
                "field": "status",
                "title": "状态",
                "width": 100,
                "align": "center",
                "formatter": {
                  "type": "enum",
                  "map": {
                    "draft": "草稿",
                    "active": "启用",
                    "archived": "已归档"
                  },
                  "emptyText": "-"
                }
              },
              {
                "field": "version",
                "title": "版本",
                "width": 88,
                "align": "right",
                "sortable": true,
                "formatter": {
                  "type": "number",
                  "locale": "zh-CN",
                  "emptyText": "1"
                }
              },
              {
                "field": "updated_by",
                "title": "更新人",
                "minWidth": 260,
                "showOverflow": "tooltip",
                "formatter": {
                  "type": "text",
                  "emptyText": "-"
                }
              },
              {
                "field": "updated_at",
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
            "delete": false
          },
          "events": {
            "rowCurrentChange": [
              {
                "type": "setDataSource",
                "sourceKey": "selectedPrintTemplate",
                "value": "{{ event.row }}"
              },
              {
                "type": "setDataSource",
                "sourceKey": "selectedPrintTemplateRows",
                "value": ["{{ event.row }}"]
              }
            ]
          }
        }
      },
      {
        "id": "print-template-child-tabs",
        "kind": "tabs",
        "defaultKey": "template-fields",
        "tabs": [
          {
            "key": "template-fields",
            "label": "模板字段",
            "blocks": [
              {
                "id": "print-template-fields-grid",
                "kind": "grid",
                "sourceKey": "selectedPrintTemplateRows",
                "schema": {
                  "grid": {
                    "border": true,
                    "stripe": true,
                    "showOverflow": true,
                    "height": 220,
                    "rowConfig": {
                      "keyField": "id",
                      "isCurrent": true
                    },
                    "columns": [
                      {
                        "field": "id",
                        "title": "模板ID",
                        "minWidth": 280,
                        "fixed": "left",
                        "showOverflow": "tooltip"
                      },
                      {
                        "field": "name",
                        "title": "模板名称",
                        "minWidth": 220,
                        "fixed": "left",
                        "showOverflow": "tooltip"
                      },
                      {
                        "field": "status",
                        "title": "状态",
                        "width": 100,
                        "align": "center",
                        "formatter": {
                          "type": "enum",
                          "map": {
                            "draft": "草稿",
                            "active": "启用",
                            "archived": "已归档"
                          },
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "version",
                        "title": "版本",
                        "width": 88,
                        "align": "right",
                        "formatter": {
                          "type": "number",
                          "locale": "zh-CN",
                          "emptyText": "1"
                        }
                      }
                    ]
                  },
                  "rowActions": {
                    "edit": false,
                    "delete": false
                  }
                }
              }
            ]
          },
          {
            "key": "audit-fields",
            "label": "审计字段",
            "blocks": [
              {
                "id": "print-template-audit-grid",
                "kind": "grid",
                "sourceKey": "selectedPrintTemplateRows",
                "schema": {
                  "grid": {
                    "border": true,
                    "stripe": true,
                    "showOverflow": true,
                    "height": 220,
                    "rowConfig": {
                      "keyField": "id",
                      "isCurrent": true
                    },
                    "columns": [
                      {
                        "field": "created_by",
                        "title": "创建人",
                        "minWidth": 260,
                        "showOverflow": "tooltip",
                        "formatter": {
                          "type": "text",
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "updated_by",
                        "title": "更新人",
                        "minWidth": 260,
                        "showOverflow": "tooltip",
                        "formatter": {
                          "type": "text",
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "created_at",
                        "title": "创建时间",
                        "width": 180,
                        "formatter": {
                          "type": "datetime",
                          "locale": "zh-CN",
                          "emptyText": "-"
                        }
                      },
                      {
                        "field": "updated_at",
                        "title": "更新时间",
                        "width": 180,
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
                    "delete": false
                  }
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
  layout = excluded.layout,
  status = excluded.status,
  keep_alive = excluded.keep_alive,
  schema = excluded.schema,
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
where code = 'print-templates'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

update public.admin_entities
set
  page_code = 'print-templates',
  updated_at = timezone('utc'::text, now())
where code = 'print_templates';

update public.admin_permissions
set
  resource_type = 'entity',
  resource_key = 'print_templates',
  route_path = '/dashboard/print/templates',
  page_code = 'print-templates',
  entity_code = 'print_templates',
  updated_at = timezone('utc'::text, now())
where code = 'print.templates.manage';

update public.admin_routes as template_route
set
  title = U&'\6253\5370\6A21\677F',
  path = '/dashboard/print/templates',
  parent_id = print_root.id,
  page_code = 'print-templates',
  permission_code = 'print.templates.manage',
  icon = 'ri-file-paper-2-line',
  visible = true,
  keep_alive = true,
  layout = 'dashboard',
  status = 'active',
  sort_order = 10,
  metadata = coalesce(template_route.metadata, '{}'::jsonb)
    || '{"group":"lowcode-app","category":"print","module":"print","pageKind":"templates"}'::jsonb,
  updated_at = timezone('utc'::text, now())
from public.admin_routes as print_root
where template_route.code = 'print-designer'
  and print_root.code = 'print-management-root';

select pg_notify('pgrst', 'reload schema');
