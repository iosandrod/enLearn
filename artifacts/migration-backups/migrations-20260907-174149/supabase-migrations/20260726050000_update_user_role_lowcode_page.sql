-- Publish the database-backed low-code schema for the user role page.

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
  'admin-system-users',
  '/dashboard/system/users',
  '用户角色',
  '用户角色与角色字段维护视图',
  'dashboard',
  'published',
  true,
  $json$
{
  "schemaVersion": 1,
  "code": "admin-system-users",
  "route": "/dashboard/system/users",
  "title": "用户角色",
  "description": "用户角色与角色字段维护视图",
  "layout": "dashboard",
  "status": "published",
  "keepAlive": true,
  "dataSources": {
    "roles": {
      "key": "roles",
      "label": "角色列表",
      "serviceName": "admin",
      "serviceMethod": "listRoles",
      "autoLoad": true
    }
  },
  "blocks": [
    {
      "id": "user-role-actions",
      "kind": "buttonGroup",
      "title": "操作",
      "align": "left",
      "gap": 8,
      "actions": [
        {
          "code": "show-all-roles",
          "label": "全部角色",
          "status": "primary",
          "icon": "ri-list-check-2",
          "eventName": "userRole.actions.showAll",
          "directives": [
            {
              "type": "setSearchFilters",
              "sourceKey": "roles",
              "mode": "replace",
              "values": {}
            }
          ]
        },
        {
          "code": "show-system-roles",
          "label": "系统角色",
          "icon": "ri-shield-star-line",
          "eventName": "userRole.actions.showSystem",
          "directives": [
            {
              "type": "setSearchFilters",
              "sourceKey": "roles",
              "mode": "replace",
              "values": {
                "is_system": true
              }
            }
          ]
        },
        {
          "code": "show-business-roles",
          "label": "业务角色",
          "icon": "ri-user-settings-line",
          "eventName": "userRole.actions.showBusiness",
          "directives": [
            {
              "type": "setSearchFilters",
              "sourceKey": "roles",
              "mode": "replace",
              "values": {
                "is_system": false
              }
            }
          ]
        },
        {
          "code": "reload-roles",
          "label": "刷新",
          "icon": "ri-refresh-line",
          "eventName": "userRole.actions.reload",
          "directives": [
            {
              "type": "refreshDataSource",
              "sourceKeys": [
                "roles"
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "user-role-main-grid",
      "kind": "grid",
      "title": "角色列表",
      "sourceKey": "roles",
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
              "field": "code",
              "title": "角色编码",
              "minWidth": 150,
              "fixed": "left",
              "sortable": true
            },
            {
              "field": "name",
              "title": "角色名称",
              "minWidth": 150,
              "fixed": "left",
              "sortable": true
            },
            {
              "field": "status",
              "title": "状态",
              "width": 96,
              "align": "center",
              "formatter": {
                "type": "enum",
                "map": {
                  "active": "启用",
                  "inactive": "停用"
                },
                "emptyText": "-"
              }
            },
            {
              "field": "is_system",
              "title": "系统角色",
              "width": 100,
              "align": "center",
              "formatter": {
                "type": "enum",
                "map": {
                  "true": "是",
                  "false": "否"
                },
                "emptyText": "否"
              }
            },
            {
              "field": "sort_order",
              "title": "排序",
              "width": 88,
              "align": "right",
              "sortable": true,
              "formatter": {
                "type": "number",
                "emptyText": "0"
              }
            },
            {
              "field": "permission_count",
              "title": "权限数",
              "width": 96,
              "align": "right",
              "formatter": {
                "type": "number",
                "emptyText": "0"
              }
            },
            {
              "field": "permission_names",
              "title": "权限摘要",
              "minWidth": 260,
              "showOverflow": "tooltip"
            },
            {
              "field": "description",
              "title": "描述",
              "minWidth": 220,
              "showOverflow": "tooltip"
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
        },
        "events": {
          "rowCurrentChange": [
            {
              "type": "setDataSource",
              "sourceKey": "selectedRole",
              "value": "{{ event.row }}"
            },
            {
              "type": "setDataSource",
              "sourceKey": "selectedRoleRows",
              "value": [
                "{{ event.row }}"
              ]
            }
          ]
        }
      }
    },
    {
      "id": "user-role-child-tabs",
      "kind": "tabs",
      "title": "角色字段子表",
      "defaultKey": "base-fields",
      "tabs": [
        {
          "key": "base-fields",
          "label": "基础字段",
          "blocks": [
            {
              "id": "user-role-base-fields-grid",
              "kind": "grid",
              "sourceKey": "selectedRoleRows",
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
                      "field": "code",
                      "title": "角色编码",
                      "minWidth": 150,
                      "fixed": "left"
                    },
                    {
                      "field": "name",
                      "title": "角色名称",
                      "minWidth": 150,
                      "fixed": "left"
                    },
                    {
                      "field": "status",
                      "title": "状态",
                      "width": 96,
                      "align": "center",
                      "formatter": {
                        "type": "enum",
                        "map": {
                          "active": "启用",
                          "inactive": "停用"
                        },
                        "emptyText": "-"
                      }
                    },
                    {
                      "field": "is_system",
                      "title": "系统角色",
                      "width": 100,
                      "align": "center",
                      "formatter": {
                        "type": "enum",
                        "map": {
                          "true": "是",
                          "false": "否"
                        },
                        "emptyText": "否"
                      }
                    },
                    {
                      "field": "sort_order",
                      "title": "排序",
                      "width": 88,
                      "align": "right",
                      "formatter": {
                        "type": "number",
                        "emptyText": "0"
                      }
                    },
                    {
                      "field": "description",
                      "title": "描述",
                      "minWidth": 240,
                      "showOverflow": "tooltip"
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
          "key": "permission-fields",
          "label": "权限字段",
          "blocks": [
            {
              "id": "user-role-permission-fields-grid",
              "kind": "grid",
              "sourceKey": "selectedRoleRows",
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
                      "field": "code",
                      "title": "角色编码",
                      "minWidth": 150,
                      "fixed": "left"
                    },
                    {
                      "field": "name",
                      "title": "角色名称",
                      "minWidth": 150
                    },
                    {
                      "field": "permission_count",
                      "title": "权限数",
                      "width": 96,
                      "align": "right",
                      "formatter": {
                        "type": "number",
                        "emptyText": "0"
                      }
                    },
                    {
                      "field": "permission_names",
                      "title": "权限名称",
                      "minWidth": 360,
                      "showOverflow": "tooltip"
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
              "id": "user-role-audit-fields-grid",
              "kind": "grid",
              "sourceKey": "selectedRoleRows",
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
                      "title": "角色ID",
                      "minWidth": 260,
                      "fixed": "left",
                      "showOverflow": "tooltip"
                    },
                    {
                      "field": "created_by",
                      "title": "创建人",
                      "minWidth": 220,
                      "showOverflow": "tooltip"
                    },
                    {
                      "field": "updated_by",
                      "title": "更新人",
                      "minWidth": 220,
                      "showOverflow": "tooltip"
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
  2,
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
  version = greatest(public.lowcode_pages.version + 1, excluded.version),
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now());

with published_page as (
  select id, version, schema
  from public.lowcode_pages
  where code = 'admin-system-users'
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
from published_page
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

do $$
begin
  if to_regclass('public.admin_routes') is not null then
    update public.admin_routes
    set
      title = '用户角色',
      path = '/dashboard/system/users',
      page_code = 'admin-system-users',
      icon = 'ri-user-settings-line',
      visible = true,
      keep_alive = true,
      layout = 'dashboard',
      status = 'active',
      updated_at = timezone('utc'::text, now())
    where code = 'system-users';
  end if;
end $$;
