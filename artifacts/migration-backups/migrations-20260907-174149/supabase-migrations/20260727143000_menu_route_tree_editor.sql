-- Publish a database-backed tree editor for dynamic menu routes.

with next_schema as (
  select $json$
{
  "schemaVersion": 1,
  "code": "admin-system-routes",
  "route": "/dashboard/system/routes",
  "title": "动态路由",
  "description": "维护数据库中的菜单树、页面路由、可见状态与权限码绑定关系。",
  "layout": "dashboard",
  "status": "published",
  "keepAlive": true,
  "dataSources": {
    "routeTree": {
      "key": "routeTree",
      "label": "菜单树",
      "serviceName": "admin",
      "serviceMethod": "listRouteManageTree",
      "autoLoad": true
    },
    "permissions": {
      "key": "permissions",
      "label": "权限",
      "serviceName": "admin",
      "serviceMethod": "listPermissions",
      "autoLoad": true
    },
    "pages": {
      "key": "pages",
      "label": "低代码页面",
      "serviceName": "lowcode",
      "serviceMethod": "listPages",
      "autoLoad": true
    }
  },
  "blocks": [
    {
      "id": "route-actions",
      "kind": "buttonGroup",
      "title": "菜单操作",
      "align": "left",
      "gap": 8,
      "actions": [
        {
          "code": "create-root",
          "label": "新增菜单",
          "status": "primary",
          "icon": "ri-add-line",
          "eventName": "routeTree.createRoot",
          "directives": [
            {
              "type": "setFormValues",
              "blockId": "route-form",
              "mode": "replace",
              "values": {
                "id": "",
                "code": "",
                "title": "",
                "path": "",
                "parent_id": "",
                "route_type": "page",
                "icon": "",
                "page_code": "",
                "permission_code": "",
                "visible": true,
                "keep_alive": true,
                "layout": "dashboard",
                "status": "active",
                "sort_order": 0,
                "metadata_json": {}
              }
            },
            {
              "type": "openBlock",
              "blockId": "route-editor-modal"
            }
          ]
        },
        {
          "code": "refresh",
          "label": "刷新",
          "icon": "ri-refresh-line",
          "eventName": "routeTree.refresh",
          "directives": [
            {
              "type": "refreshDataSource",
              "sourceKeys": [
                "routeTree"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "route-tree-grid",
      "kind": "grid",
      "title": "菜单路由树",
      "sourceKey": "routeTree",
      "schema": {
        "title": "菜单路由树",
        "grid": {
          "border": true,
          "stripe": true,
          "showOverflow": true,
          "height": 520,
          "rowConfig": {
            "keyField": "id",
            "isCurrent": true
          },
          "treeConfig": {
            "transform": false,
            "rowField": "id",
            "parentField": "parent_id",
            "childrenField": "children",
            "expandAll": true
          },
          "columns": [
            {
              "type": "seq",
              "title": "序号",
              "width": 64,
              "align": "center"
            },
            {
              "field": "title",
              "title": "菜单名称",
              "minWidth": 220,
              "fixed": "left",
              "treeNode": true,
              "showOverflow": "tooltip"
            },
            {
              "field": "code",
              "title": "编码",
              "minWidth": 180,
              "showOverflow": "tooltip"
            },
            {
              "field": "path",
              "title": "路径",
              "minWidth": 260,
              "showOverflow": "tooltip"
            },
            {
              "field": "route_type",
              "title": "类型",
              "width": 92,
              "align": "center",
              "formatter": {
                "type": "text",
                "emptyText": "-"
              }
            },
            {
              "field": "page_code",
              "title": "页面",
              "minWidth": 190,
              "showOverflow": "tooltip",
              "formatter": {
                "type": "text",
                "emptyText": "-"
              }
            },
            {
              "field": "permission_code",
              "title": "权限码",
              "minWidth": 220,
              "showOverflow": "tooltip",
              "formatter": {
                "type": "text",
                "emptyText": "-"
              }
            },
            {
              "field": "visible",
              "title": "可见",
              "width": 86,
              "align": "center",
              "formatter": {
                "type": "enum",
                "map": {
                  "true": "是",
                  "false": "否"
                },
                "emptyText": "-"
              }
            },
            {
              "field": "status",
              "title": "状态",
              "width": 92,
              "align": "center",
              "formatter": {
                "type": "enum",
                "map": {
                  "active": "启用",
                  "inactive": "停用",
                  "draft": "草稿",
                  "published": "已发布",
                  "archived": "已归档"
                },
                "emptyText": "-"
              }
            },
            {
              "field": "sort_order",
              "title": "排序",
              "width": 82,
              "align": "center",
              "formatter": {
                "type": "number",
                "locale": "zh-CN",
                "emptyText": "0"
              }
            },
            {
              "title": "操作",
              "width": 260,
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
              "code": "edit",
              "label": "修改",
              "status": "primary",
              "eventName": "routeTree.edit",
              "directives": [
                {
                  "type": "setFormValues",
                  "blockId": "route-form",
                  "mode": "replace",
                  "value": "{{ row }}"
                },
                {
                  "type": "openBlock",
                  "blockId": "route-editor-modal"
                }
              ]
            },
            {
              "code": "create-child",
              "label": "新增子菜单",
              "eventName": "routeTree.createChild",
              "directives": [
                {
                  "type": "setFormValues",
                  "blockId": "route-form",
                  "mode": "replace",
                  "values": {
                    "id": "",
                    "code": "",
                    "title": "",
                    "path": "",
                    "parent_id": "{{ row.id }}",
                    "route_type": "page",
                    "icon": "",
                    "page_code": "",
                    "permission_code": "",
                    "visible": true,
                    "keep_alive": true,
                    "layout": "{{ row.layout }}",
                    "status": "active",
                    "sort_order": 0,
                    "metadata_json": "{{ row.metadata_json }}"
                  }
                },
                {
                  "type": "openBlock",
                  "blockId": "route-editor-modal"
                }
              ]
            },
            {
              "code": "hide",
              "label": "隐藏",
              "status": "warning",
              "eventName": "routeTree.hide",
              "directives": [
                {
                  "type": "invokeService",
                  "serviceName": "admin",
                  "serviceMethod": "hideRoute",
                  "postData": "{{ row }}"
                },
                {
                  "type": "refreshDataSource",
                  "sourceKeys": [
                    "routeTree"
                  ]
                },
                {
                  "type": "dispatchWindowEvent",
                  "event": "enlearn:admin-routes-updated"
                },
                {
                  "type": "showMessage",
                  "message": "菜单已隐藏。"
                }
              ]
            }
          ]
        }
      }
    },
    {
      "id": "route-editor-modal",
      "kind": "modal",
      "title": "菜单编辑",
      "description": "新增、修改或隐藏后的菜单会立即写入 admin_routes 表。",
      "open": false,
      "width": 900,
      "blocks": [
        {
          "id": "route-form",
          "kind": "form",
          "title": "菜单信息",
          "initialValues": {
            "id": "",
            "code": "",
            "title": "",
            "path": "",
            "parent_id": "",
            "route_type": "page",
            "icon": "",
            "page_code": "",
            "permission_code": "",
            "visible": true,
            "keep_alive": true,
            "layout": "dashboard",
            "status": "active",
            "sort_order": 0,
            "metadata_json": {}
          },
          "schema": {
            "columns": 2,
            "fields": [
              {
                "field": "id",
                "label": "ID",
                "component": "vxe-input",
                "props": {
                  "disabled": true
                }
              },
              {
                "field": "code",
                "label": "菜单编码",
                "component": "vxe-input",
                "props": {
                  "clearable": true,
                  "placeholder": "system-users"
                },
                "rules": [
                  {
                    "required": true,
                    "message": "请输入菜单编码"
                  }
                ]
              },
              {
                "field": "title",
                "label": "菜单名称",
                "component": "vxe-input",
                "props": {
                  "clearable": true,
                  "placeholder": "用户角色"
                },
                "rules": [
                  {
                    "required": true,
                    "message": "请输入菜单名称"
                  }
                ]
              },
              {
                "field": "path",
                "label": "路径",
                "component": "vxe-input",
                "props": {
                  "clearable": true,
                  "placeholder": "/dashboard/system/users"
                },
                "rules": [
                  {
                    "required": true,
                    "message": "请输入路径"
                  }
                ]
              },
              {
                "field": "parent_id",
                "label": "父级菜单",
                "component": "vxe-tree-select",
                "optionsSourceKey": "routeTree",
                "optionProps": {
                  "label": "title",
                  "value": "id",
                  "children": "children"
                },
                "props": {
                  "clearable": true,
                  "filterable": true,
                  "placeholder": "不选则为顶级菜单"
                }
              },
              {
                "field": "route_type",
                "label": "菜单类型",
                "component": "vxe-radio-group",
                "options": [
                  {
                    "label": "分组",
                    "value": "group"
                  },
                  {
                    "label": "页面",
                    "value": "page"
                  },
                  {
                    "label": "外链",
                    "value": "link"
                  }
                ],
                "props": {
                  "type": "button"
                }
              },
              {
                "field": "icon",
                "label": "图标",
                "component": "vxe-input",
                "props": {
                  "clearable": true,
                  "placeholder": "ri-route-line"
                }
              },
              {
                "field": "page_code",
                "label": "低代码页面",
                "component": "vxe-select",
                "optionsSourceKey": "pages",
                "optionProps": {
                  "label": "title",
                  "value": "code"
                },
                "props": {
                  "clearable": true,
                  "filterable": true,
                  "placeholder": "绑定低代码页面"
                }
              },
              {
                "field": "permission_code",
                "label": "权限码",
                "component": "vxe-select",
                "optionsSourceKey": "permissions",
                "optionProps": {
                  "label": "name",
                  "value": "code"
                },
                "props": {
                  "clearable": true,
                  "filterable": true,
                  "placeholder": "绑定访问权限"
                }
              },
              {
                "field": "visible",
                "label": "菜单可见",
                "component": "vxe-switch"
              },
              {
                "field": "keep_alive",
                "label": "缓存页面",
                "component": "vxe-switch"
              },
              {
                "field": "layout",
                "label": "布局",
                "component": "vxe-select",
                "options": [
                  {
                    "label": "仪表盘",
                    "value": "dashboard"
                  },
                  {
                    "label": "默认",
                    "value": "default"
                  },
                  {
                    "label": "空白",
                    "value": "blank"
                  }
                ]
              },
              {
                "field": "status",
                "label": "状态",
                "component": "vxe-select",
                "options": [
                  {
                    "label": "启用",
                    "value": "active"
                  },
                  {
                    "label": "停用",
                    "value": "inactive"
                  }
                ]
              },
              {
                "field": "sort_order",
                "label": "排序",
                "component": "lc-number-input"
              },
              {
                "field": "metadata_json",
                "label": "元数据 JSON",
                "component": "lc-json-editor",
                "props": {
                  "rows": 6,
                  "resize": "vertical"
                },
                "span": 2
              }
            ],
            "actions": [
              {
                "code": "submit",
                "label": "保存菜单",
                "type": "submit",
                "status": "primary",
                "eventName": "routeEditor.submit",
                "directives": [
                  {
                    "type": "invokeService",
                    "serviceName": "admin",
                    "serviceMethod": "saveRoute",
                    "postData": "{{ values }}"
                  },
                  {
                    "type": "refreshDataSource",
                    "sourceKeys": [
                      "routeTree"
                    ]
                  },
                  {
                    "type": "dispatchWindowEvent",
                    "event": "enlearn:admin-routes-updated"
                  },
                  {
                    "type": "closeBlock",
                    "blockId": "route-editor-modal"
                  },
                  {
                    "type": "showMessage",
                    "message": "菜单已保存。"
                  }
                ]
              },
              {
                "code": "reset",
                "label": "重置",
                "type": "reset"
              },
              {
                "code": "cancel",
                "label": "取消",
                "type": "button",
                "eventName": "routeEditor.cancel",
                "directives": [
                  {
                    "type": "closeBlock",
                    "blockId": "route-editor-modal"
                  }
                ]
              }
            ]
          }
        }
      ]
    }
  ]
}
$json$::jsonb as schema
),
upsert_page as (
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
  )
  select
    'admin-system-routes',
    '/dashboard/system/routes',
    '动态路由',
    '维护数据库中的菜单树、页面路由、可见状态与权限码绑定关系。',
    'dashboard',
    'published',
    true,
    next_schema.schema,
    1,
    timezone('utc'::text, now())
  from next_schema
  on conflict (code) do update set
    route = excluded.route,
    title = excluded.title,
    description = excluded.description,
    layout = excluded.layout,
    status = excluded.status,
    keep_alive = excluded.keep_alive,
    schema = excluded.schema,
    version = coalesce(public.lowcode_pages.version, 0) + 1,
    published_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  returning id, version, schema
)
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
  timezone('utc'::text, now())
from upsert_page
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

update public.admin_routes
set
  title = '动态路由',
  page_code = 'admin-system-routes',
  permission_code = 'admin.routes.manage',
  updated_at = timezone('utc'::text, now())
where code = 'system-routes';
