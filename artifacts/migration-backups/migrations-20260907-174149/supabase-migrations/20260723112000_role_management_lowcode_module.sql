-- Role management low-code module with separate list and edit child pages.

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
  'role-management-list',
  '/dashboard/role-management/list',
  'Role Management',
  'A complete low-code role module list page rendered from database metadata.',
  'dashboard',
  'published',
  true,
  $json$
  {
    "code": "role-management-list",
    "route": "/dashboard/role-management/list",
    "title": "Role Management",
    "description": "A complete low-code role module list page rendered from database metadata.",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "roles": {
        "key": "roles",
        "label": "Roles",
        "serviceName": "admin",
        "serviceMethod": "listRoles",
        "deleteMethod": "deleteRole"
      },
      "permissions": {
        "key": "permissions",
        "label": "Permissions",
        "serviceName": "admin",
        "serviceMethod": "listPermissions"
      }
    },
    "blocks": [
      {
        "id": "role-list-toolbar",
        "kind": "toolbar",
        "title": "Role Module",
        "description": "List page and edit page are both driven by low-code metadata.",
        "actions": [
          {
            "code": "create",
            "label": "New Role",
            "type": "button",
            "status": "primary",
            "route": "/dashboard/role-management/edit"
          },
          {
            "code": "refresh",
            "label": "Refresh",
            "type": "button"
          }
        ]
      },
      {
        "id": "role-list-stats",
        "kind": "statCard",
        "sourceKey": "roles",
        "items": [
          {
            "label": "Total Roles",
            "field": "count"
          }
        ]
      },
      {
        "id": "role-list-search",
        "kind": "searchForm",
        "title": "Search",
        "description": "Filter by code, name, or status on the loaded role list.",
        "targetSourceKey": "roles",
        "initialValues": {
          "code": "",
          "name": "",
          "status": ""
        },
        "schema": {
          "columns": 3,
          "fields": [
            {
              "field": "code",
              "label": "Code",
              "component": "vxe-input",
              "props": {
                "placeholder": "system_admin",
                "clearable": true
              }
            },
            {
              "field": "name",
              "label": "Name",
              "component": "vxe-input",
              "props": {
                "placeholder": "System Admin",
                "clearable": true
              }
            },
            {
              "field": "status",
              "label": "Status",
              "component": "vxe-select",
              "props": {
                "placeholder": "All",
                "clearable": true
              },
              "options": [
                {
                  "label": "Active",
                  "value": "active"
                },
                {
                  "label": "Inactive",
                  "value": "inactive"
                }
              ]
            }
          ],
          "actions": [
            {
              "code": "submit",
              "label": "Search",
              "type": "submit",
              "status": "primary"
            },
            {
              "code": "reset",
              "label": "Reset",
              "type": "reset"
            }
          ]
        }
      },
      {
        "id": "role-list-grid",
        "kind": "grid",
        "title": "Role List",
        "description": "Row edit opens the independent low-code edit page with the selected role id.",
        "sourceKey": "roles",
        "editRoute": "/dashboard/role-management/edit?id={{row.id}}",
        "schema": {
          "title": "Roles",
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": true,
            "rowConfig": {
              "keyField": "id"
            },
            "columns": [
              {
                "type": "seq",
                "title": "#",
                "width": 70,
                "align": "center"
              },
              {
                "field": "code",
                "title": "Code",
                "minWidth": 180
              },
              {
                "field": "name",
                "title": "Name",
                "minWidth": 180
              },
              {
                "field": "status",
                "title": "Status",
                "minWidth": 120,
                "formatter": {
                  "type": "enum",
                  "map": {
                    "active": "Active",
                    "inactive": "Inactive"
                  }
                }
              },
              {
                "field": "permission_count",
                "title": "Permissions",
                "minWidth": 120,
                "formatter": {
                  "type": "number"
                }
              },
              {
                "field": "permission_names",
                "title": "Permission Names",
                "minWidth": 260
              },
              {
                "field": "sort_order",
                "title": "Sort",
                "minWidth": 100,
                "formatter": {
                  "type": "number"
                }
              },
              {
                "field": "updated_at",
                "title": "Updated At",
                "minWidth": 180,
                "formatter": {
                  "type": "datetime",
                  "locale": "en-US"
                }
              },
              {
                "title": "Actions",
                "width": 180,
                "fixed": "right",
                "slots": {
                  "default": "actions"
                }
              }
            ]
          },
          "rowActions": {
            "edit": true,
            "editLabel": "Edit",
            "editRoute": "/dashboard/role-management/edit?id={{row.id}}",
            "delete": true,
            "deleteLabel": "Delete"
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
  'role-management-edit',
  '/dashboard/role-management/edit',
  'Role Editor',
  'A complete low-code role edit page that loads role detail by URL query id.',
  'dashboard',
  'published',
  true,
  $json$
  {
    "code": "role-management-edit",
    "route": "/dashboard/role-management/edit",
    "title": "Role Editor",
    "description": "A complete low-code role edit page that loads role detail by URL query id.",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "role": {
        "key": "role",
        "label": "Role Detail",
        "serviceName": "admin",
        "serviceMethod": "getRole",
        "saveMethod": "saveRole",
        "postData": {
          "id": "{{route.query.id}}"
        }
      },
      "permissions": {
        "key": "permissions",
        "label": "Permissions",
        "serviceName": "admin",
        "serviceMethod": "listPermissions"
      }
    },
    "blocks": [
      {
        "id": "role-edit-toolbar",
        "kind": "toolbar",
        "title": "Role Editor",
        "description": "Create a new role or edit the role selected from the list page.",
        "actions": [
          {
            "code": "back",
            "label": "Back to List",
            "type": "button",
            "route": "/dashboard/role-management/list"
          },
          {
            "code": "create",
            "label": "New Role",
            "type": "button",
            "status": "primary",
            "route": "/dashboard/role-management/edit"
          },
          {
            "code": "refresh",
            "label": "Refresh",
            "type": "button"
          }
        ]
      },
      {
        "id": "role-edit-form",
        "kind": "form",
        "title": "Role Form",
        "description": "The form model is loaded from admin.getRole and saved through admin.saveRole.",
        "sourceKey": "role",
        "submitSourceKey": "role",
        "initialValues": {
          "id": "",
          "code": "",
          "name": "",
          "description": "",
          "status": "active",
          "sort_order": 0,
          "is_system": false,
          "permission_codes": []
        },
        "schema": {
          "columns": 2,
          "fields": [
            {
              "field": "id",
              "label": "ID",
              "component": "vxe-input",
              "span": 2,
              "props": {
                "disabled": true,
                "placeholder": "Generated after save"
              }
            },
            {
              "field": "code",
              "label": "Code",
              "component": "vxe-input",
              "props": {
                "placeholder": "role_code",
                "clearable": true
              },
              "rules": [
                {
                  "required": true,
                  "message": "Code is required"
                }
              ]
            },
            {
              "field": "name",
              "label": "Name",
              "component": "vxe-input",
              "props": {
                "placeholder": "Role name",
                "clearable": true
              },
              "rules": [
                {
                  "required": true,
                  "message": "Name is required"
                }
              ]
            },
            {
              "field": "status",
              "label": "Status",
              "component": "vxe-select",
              "options": [
                {
                  "label": "Active",
                  "value": "active"
                },
                {
                  "label": "Inactive",
                  "value": "inactive"
                }
              ]
            },
            {
              "field": "sort_order",
              "label": "Sort Order",
              "component": "vxe-input",
              "props": {
                "type": "number",
                "placeholder": "0"
              }
            },
            {
              "field": "is_system",
              "label": "System Role",
              "component": "vxe-switch"
            },
            {
              "field": "description",
              "label": "Description",
              "component": "vxe-textarea",
              "span": 2,
              "props": {
                "placeholder": "Describe the role responsibilities",
                "autosize": {
                  "minRows": 3,
                  "maxRows": 6
                }
              }
            },
            {
              "field": "permission_codes",
              "label": "Permissions",
              "component": "vxe-checkbox-group",
              "span": 2,
              "optionsSourceKey": "permissions",
              "optionProps": {
                "label": "name",
                "value": "code"
              },
              "props": {
                "strict": true
              },
              "help": "Permission options are loaded from admin.listPermissions."
            }
          ],
          "actions": [
            {
              "code": "submit",
              "label": "Save Role",
              "type": "submit",
              "status": "primary"
            },
            {
              "code": "reset",
              "label": "Reset",
              "type": "reset"
            },
            {
              "code": "back",
              "label": "Back to List",
              "type": "button",
              "route": "/dashboard/role-management/list"
            }
          ]
        }
      },
      {
        "id": "role-edit-detail",
        "kind": "detail",
        "title": "Loaded Role Snapshot",
        "description": "This detail node reads the same role data source as the form.",
        "sourceKey": "role",
        "fields": [
          {
            "field": "code",
            "label": "Code"
          },
          {
            "field": "name",
            "label": "Name"
          },
          {
            "field": "status",
            "label": "Status",
            "formatter": {
              "type": "enum",
              "map": {
                "active": "Active",
                "inactive": "Inactive"
              }
            }
          },
          {
            "field": "permission_names",
            "label": "Permissions"
          }
        ]
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

with role_management_root as (
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
    'role-management-root',
    'Role Management',
    '/dashboard/role-management/_group',
    'group',
    'user',
    true,
    true,
    'dashboard',
    'active',
    30,
    '{"group": "role-management", "module": "role-management"}'::jsonb
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
  route_seed.code,
  route_seed.title,
  route_seed.path,
  role_management_root.id,
  'page',
  route_seed.icon,
  route_seed.page_code,
  'admin.roles.manage',
  route_seed.visible,
  true,
  'dashboard',
  'active',
  route_seed.sort_order,
  route_seed.metadata
from role_management_root
cross join (
  values
    (
      'role-management-list',
      'Role List',
      '/dashboard/role-management/list',
      'table',
      'role-management-list',
      true,
      10,
      '{"group": "role-management", "module": "role-management", "pageKind": "list"}'::jsonb
    ),
    (
      'role-management-edit',
      'Role Edit',
      '/dashboard/role-management/edit',
      'edit',
      'role-management-edit',
      false,
      20,
      '{"group": "role-management", "module": "role-management", "pageKind": "edit"}'::jsonb
    )
) as route_seed(code, title, path, icon, page_code, visible, sort_order, metadata)
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
