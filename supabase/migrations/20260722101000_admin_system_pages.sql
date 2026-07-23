-- Low-code admin pages and route registry.

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
  'admin-system-home',
  '/dashboard/system',
  'System Center',
  'A low-code entry point for backend metadata management.',
  'dashboard',
  'published',
  true,
  '{
    "code": "admin-system-home",
    "route": "/dashboard/system",
    "title": "System Center",
    "description": "A low-code entry point for backend metadata management.",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {},
    "blocks": [
      {
        "id": "intro",
        "kind": "text",
        "title": "Admin Hub",
        "content": "This backend is driven by route metadata and low-code page definitions stored in the database. Use the pages below to manage roles, permissions, routes, entities, and user role bindings."
      },
      {
        "id": "guide",
        "kind": "text",
        "title": "Working Pattern",
        "content": "Each list page opens an editable form on the same screen. Save and delete actions flow through the unified API gateway."
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
  'admin-system-roles',
  '/dashboard/system/roles',
  'Role Management',
  'Manage backend roles and bind permissions.',
  'dashboard',
  'published',
  true,
  '{
    "code": "admin-system-roles",
    "route": "/dashboard/system/roles",
    "title": "Role Management",
    "description": "Manage backend roles and bind permissions.",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "roles": {
        "key": "roles",
        "serviceName": "admin",
        "serviceMethod": "listRoles",
        "saveMethod": "saveRole",
        "deleteMethod": "deleteRole"
      },
      "permissions": {
        "key": "permissions",
        "serviceName": "admin",
        "serviceMethod": "listPermissions"
      }
    },
    "blocks": [
      {
        "id": "intro",
        "kind": "text",
        "title": "Role & Permission System",
        "content": "Create roles, assign permissions, and keep the admin surface policy-driven."
      },
      {
        "id": "role-form",
        "kind": "form",
        "title": "Role Editor",
        "description": "Edit one role and bind permissions from the checkbox list.",
        "initialValues": {
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
              "field": "code",
              "label": "Code",
              "component": "vxe-input",
              "props": { "clearable": true, "placeholder": "system_admin" },
              "rules": [{ "required": true, "message": "Code is required" }]
            },
            {
              "field": "name",
              "label": "Name",
              "component": "vxe-input",
              "props": { "clearable": true, "placeholder": "System Admin" },
              "rules": [{ "required": true, "message": "Name is required" }]
            },
            {
              "field": "status",
              "label": "Status",
              "component": "vxe-radio-group",
              "props": { "type": "button" },
              "options": [
                { "label": "Active", "value": "active" },
                { "label": "Inactive", "value": "inactive" }
              ]
            },
            {
              "field": "sort_order",
              "label": "Sort Order",
              "component": "vxe-input",
              "props": { "type": "number", "min": 0 }
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
              "props": { "rows": 3, "resize": "vertical", "placeholder": "Role description" },
              "span": 2
            },
            {
              "field": "permission_codes",
              "label": "Permissions",
              "component": "vxe-checkbox-group",
              "optionsSourceKey": "permissions",
              "optionProps": { "label": "name", "value": "code" },
              "props": { "type": "button" },
              "span": 2
            }
          ],
          "actions": [
            { "code": "submit", "label": "Save", "type": "submit", "status": "primary" },
            { "code": "reset", "label": "Reset", "type": "reset" }
          ]
        }
      },
      {
        "id": "role-grid",
        "kind": "grid",
        "title": "Roles",
        "description": "Select a row to edit or remove it.",
        "sourceKey": "roles",
        "editorBlockId": "role-form",
        "deleteSourceKey": "roles",
        "schema": {
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": true,
            "rowConfig": { "keyField": "id" },
            "columns": [
              { "field": "code", "title": "Code", "minWidth": 160 },
              { "field": "name", "title": "Name", "minWidth": 160 },
              { "field": "status", "title": "Status", "minWidth": 100 },
              { "field": "sort_order", "title": "Sort", "width": 90, "align": "center" },
              { "field": "permission_count", "title": "Permissions", "width": 110, "align": "center" },
              { "field": "permission_names", "title": "Permission Names", "minWidth": 280 },
              { "field": "updated_at", "title": "Updated At", "minWidth": 180 },
              { "title": "Actions", "width": 180, "fixed": "right", "slots": { "default": "actions" } }
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
  'admin-system-permissions',
  '/dashboard/system/permissions',
  'Permission Registry',
  'Manage page, route, entity, and API permissions.',
  'dashboard',
  'published',
  true,
  '{
    "code": "admin-system-permissions",
    "route": "/dashboard/system/permissions",
    "title": "Permission Registry",
    "description": "Manage page, route, entity, and API permissions.",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "permissions": {
        "key": "permissions",
        "serviceName": "admin",
        "serviceMethod": "listPermissions",
        "saveMethod": "savePermission",
        "deleteMethod": "deletePermission"
      },
      "lowcodePages": {
        "key": "lowcodePages",
        "serviceName": "lowcode",
        "serviceMethod": "listPages"
      },
      "entities": {
        "key": "entities",
        "serviceName": "admin",
        "serviceMethod": "listEntities"
      }
    },
    "blocks": [
      {
        "id": "intro",
        "kind": "text",
        "title": "Permission Registry",
        "content": "Permissions are the building blocks of the route and role system. Link them to low-code pages or business entities."
      },
      {
        "id": "permission-form",
        "kind": "form",
        "title": "Permission Editor",
        "description": "Define what a role can do and where it applies.",
        "initialValues": {
          "code": "",
          "name": "",
          "description": "",
          "resource_type": "page",
          "resource_key": "",
          "action_code": "",
          "route_path": "",
          "page_code": "",
          "entity_code": "",
          "status": "active",
          "sort_order": 0
        },
        "schema": {
          "columns": 2,
          "fields": [
            {
              "field": "code",
              "label": "Code",
              "component": "vxe-input",
              "props": { "clearable": true, "placeholder": "admin.users.manage" },
              "rules": [{ "required": true, "message": "Code is required" }]
            },
            {
              "field": "name",
              "label": "Name",
              "component": "vxe-input",
              "props": { "clearable": true, "placeholder": "Manage Users" },
              "rules": [{ "required": true, "message": "Name is required" }]
            },
            {
              "field": "resource_type",
              "label": "Resource Type",
              "component": "vxe-radio-group",
              "props": { "type": "button" },
              "options": [
                { "label": "Page", "value": "page" },
                { "label": "Route", "value": "route" },
                { "label": "Entity", "value": "entity" },
                { "label": "API", "value": "api" },
                { "label": "Menu", "value": "menu" },
                { "label": "Action", "value": "action" }
              ]
            },
            {
              "field": "resource_key",
              "label": "Resource Key",
              "component": "vxe-input",
              "props": { "clearable": true, "placeholder": "users / admin_roles / route-code" }
            },
            {
              "field": "action_code",
              "label": "Action",
              "component": "vxe-input",
              "props": { "clearable": true, "placeholder": "manage" }
            },
            {
              "field": "route_path",
              "label": "Route Path",
              "component": "vxe-input",
              "props": { "clearable": true, "placeholder": "/dashboard/system/users" }
            },
            {
              "field": "page_code",
              "label": "Page",
              "component": "vxe-select",
              "optionsSourceKey": "lowcodePages",
              "optionProps": { "label": "title", "value": "code" },
              "props": { "clearable": true, "placeholder": "Choose a page" }
            },
            {
              "field": "entity_code",
              "label": "Entity",
              "component": "vxe-select",
              "optionsSourceKey": "entities",
              "optionProps": { "label": "title", "value": "code" },
              "props": { "clearable": true, "placeholder": "Choose an entity" }
            },
            {
              "field": "status",
              "label": "Status",
              "component": "vxe-select",
              "options": [
                { "label": "Active", "value": "active" },
                { "label": "Inactive", "value": "inactive" }
              ]
            },
            {
              "field": "sort_order",
              "label": "Sort Order",
              "component": "vxe-input",
              "props": { "type": "number", "min": 0 }
            },
            {
              "field": "description",
              "label": "Description",
              "component": "vxe-textarea",
              "props": { "rows": 3, "resize": "vertical", "placeholder": "Describe the permission" },
              "span": 2
            }
          ],
          "actions": [
            { "code": "submit", "label": "Save", "type": "submit", "status": "primary" },
            { "code": "reset", "label": "Reset", "type": "reset" }
          ]
        }
      },
      {
        "id": "permission-grid",
        "kind": "grid",
        "title": "Permissions",
        "description": "Select a permission row to edit it.",
        "sourceKey": "permissions",
        "editorBlockId": "permission-form",
        "deleteSourceKey": "permissions",
        "schema": {
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": true,
            "rowConfig": { "keyField": "id" },
            "columns": [
              { "field": "code", "title": "Code", "minWidth": 180 },
              { "field": "name", "title": "Name", "minWidth": 160 },
              { "field": "resource_type", "title": "Type", "width": 100 },
              { "field": "resource_key", "title": "Resource Key", "minWidth": 160 },
              { "field": "action_code", "title": "Action", "minWidth": 120 },
              { "field": "route_path", "title": "Route Path", "minWidth": 200 },
              { "field": "page_code", "title": "Page", "minWidth": 180 },
              { "field": "entity_code", "title": "Entity", "minWidth": 160 },
              { "field": "status", "title": "Status", "width": 100, "align": "center" },
              { "field": "sort_order", "title": "Sort", "width": 90, "align": "center" },
              { "title": "Actions", "width": 180, "fixed": "right", "slots": { "default": "actions" } }
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
  'admin-system-routes',
  '/dashboard/system/routes',
  'Route Registry',
  'Manage dynamic routes and menu structure from the database.',
  'dashboard',
  'published',
  true,
  '{
    "code": "admin-system-routes",
    "route": "/dashboard/system/routes",
    "title": "Route Registry",
    "description": "Manage dynamic routes and menu structure from the database.",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "routes": {
        "key": "routes",
        "serviceName": "admin",
        "serviceMethod": "listRoutes",
        "saveMethod": "saveRoute",
        "deleteMethod": "deleteRoute"
      },
      "routeTree": {
        "key": "routeTree",
        "serviceName": "admin",
        "serviceMethod": "listRouteTree"
      },
      "lowcodePages": {
        "key": "lowcodePages",
        "serviceName": "lowcode",
        "serviceMethod": "listPages"
      },
      "permissions": {
        "key": "permissions",
        "serviceName": "admin",
        "serviceMethod": "listPermissions"
      }
    },
    "blocks": [
      {
        "id": "intro",
        "kind": "text",
        "title": "Route Registry",
        "content": "Every backend menu item and dynamic route can be described here, then linked to a low-code page."
      },
      {
        "id": "route-form",
        "kind": "form",
        "title": "Route Editor",
        "description": "Configure the route tree, page binding, and permission gate.",
        "initialValues": {
          "code": "",
          "title": "",
          "path": "",
          "route_type": "page",
          "parent_id": "",
          "icon": "",
          "page_code": "",
          "permission_code": "",
          "visible": true,
          "keep_alive": true,
          "layout": "dashboard",
          "status": "active",
          "sort_order": 0,
          "metadata_json": "{\n  \"group\": \"system\"\n}"
        },
        "schema": {
          "columns": 2,
          "fields": [
            {
              "field": "code",
              "label": "Code",
              "component": "vxe-input",
              "props": { "clearable": true, "placeholder": "system-users" },
              "rules": [{ "required": true, "message": "Code is required" }]
            },
            {
              "field": "title",
              "label": "Title",
              "component": "vxe-input",
              "props": { "clearable": true, "placeholder": "User Management" },
              "rules": [{ "required": true, "message": "Title is required" }]
            },
            {
              "field": "path",
              "label": "Path",
              "component": "vxe-input",
              "props": { "clearable": true, "placeholder": "/dashboard/system/users" },
              "rules": [{ "required": true, "message": "Path is required" }]
            },
            {
              "field": "route_type",
              "label": "Type",
              "component": "vxe-radio-group",
              "props": { "type": "button" },
              "options": [
                { "label": "Group", "value": "group" },
                { "label": "Page", "value": "page" },
                { "label": "Link", "value": "link" }
              ]
            },
            {
              "field": "parent_id",
              "label": "Parent",
              "component": "vxe-tree-select",
              "optionsSourceKey": "routeTree",
              "optionProps": { "label": "title", "value": "id", "children": "children" },
              "props": { "clearable": true, "filterable": true, "placeholder": "Parent route" }
            },
            {
              "field": "icon",
              "label": "Icon",
              "component": "vxe-input",
              "props": { "clearable": true, "placeholder": "user / setting / home" }
            },
            {
              "field": "page_code",
              "label": "Page",
              "component": "vxe-select",
              "optionsSourceKey": "lowcodePages",
              "optionProps": { "label": "title", "value": "code" },
              "props": { "clearable": true, "placeholder": "Bind a low-code page" }
            },
            {
              "field": "permission_code",
              "label": "Permission",
              "component": "vxe-select",
              "optionsSourceKey": "permissions",
              "optionProps": { "label": "name", "value": "code" },
              "props": { "clearable": true, "placeholder": "Bind a permission" }
            },
            {
              "field": "visible",
              "label": "Visible",
              "component": "vxe-switch"
            },
            {
              "field": "keep_alive",
              "label": "Keep Alive",
              "component": "vxe-switch"
            },
            {
              "field": "layout",
              "label": "Layout",
              "component": "vxe-select",
              "options": [
                { "label": "Default", "value": "default" },
                { "label": "Dashboard", "value": "dashboard" },
                { "label": "Blank", "value": "blank" }
              ]
            },
            {
              "field": "status",
              "label": "Status",
              "component": "vxe-select",
              "options": [
                { "label": "Active", "value": "active" },
                { "label": "Inactive", "value": "inactive" }
              ]
            },
            {
              "field": "sort_order",
              "label": "Sort Order",
              "component": "vxe-input",
              "props": { "type": "number", "min": 0 }
            },
            {
              "field": "metadata_json",
              "label": "Metadata JSON",
              "component": "vxe-textarea",
              "props": { "rows": 5, "resize": "vertical" },
              "span": 2
            }
          ],
          "actions": [
            { "code": "submit", "label": "Save", "type": "submit", "status": "primary" },
            { "code": "reset", "label": "Reset", "type": "reset" }
          ]
        }
      },
      {
        "id": "route-grid",
        "kind": "grid",
        "title": "Routes",
        "description": "Edit the route tree from the list below.",
        "sourceKey": "routes",
        "editorBlockId": "route-form",
        "deleteSourceKey": "routes",
        "schema": {
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": true,
            "rowConfig": { "keyField": "id" },
            "columns": [
              { "field": "code", "title": "Code", "minWidth": 160 },
              { "field": "title", "title": "Title", "minWidth": 160 },
              { "field": "path", "title": "Path", "minWidth": 200 },
              { "field": "route_type", "title": "Type", "width": 100 },
              { "field": "page_code", "title": "Page", "minWidth": 160 },
              { "field": "permission_code", "title": "Permission", "minWidth": 160 },
              { "field": "visible", "title": "Visible", "width": 100, "align": "center" },
              { "field": "status", "title": "Status", "width": 100, "align": "center" },
              { "field": "sort_order", "title": "Sort", "width": 90, "align": "center" },
              { "title": "Actions", "width": 180, "fixed": "right", "slots": { "default": "actions" } }
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
  'admin-system-entities',
  '/dashboard/system/entities',
  'Entity Registry',
  'Manage entity definitions used to generate CRUD pages.',
  'dashboard',
  'published',
  true,
  '{
    "code": "admin-system-entities",
    "route": "/dashboard/system/entities",
    "title": "Entity Registry",
    "description": "Manage entity definitions used to generate CRUD pages.",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "entities": {
        "key": "entities",
        "serviceName": "admin",
        "serviceMethod": "listEntities",
        "saveMethod": "saveEntity",
        "deleteMethod": "deleteEntity"
      },
      "lowcodePages": {
        "key": "lowcodePages",
        "serviceName": "lowcode",
        "serviceMethod": "listPages"
      }
    },
    "blocks": [
      {
        "id": "intro",
        "kind": "text",
        "title": "Entity Registry",
        "content": "Register each business entity once, then reuse the metadata to drive route creation and future CRUD pages."
      },
      {
        "id": "entity-form",
        "kind": "form",
        "title": "Entity Editor",
        "description": "Define the table, route, and optional schema payload for an entity.",
        "initialValues": {
          "code": "",
          "title": "",
          "table_name": "",
          "route_path": "",
          "page_code": "",
          "icon": "",
          "primary_key": "id",
          "status": "active",
          "sort_order": 0,
          "description": "",
          "schema_json": "{\n  \"list\": {},\n  \"form\": {}\n}"
        },
        "schema": {
          "columns": 2,
          "fields": [
            {
              "field": "code",
              "label": "Code",
              "component": "vxe-input",
              "props": { "clearable": true, "placeholder": "trial_bookings" },
              "rules": [{ "required": true, "message": "Code is required" }]
            },
            {
              "field": "title",
              "label": "Title",
              "component": "vxe-input",
              "props": { "clearable": true, "placeholder": "Trial Bookings" },
              "rules": [{ "required": true, "message": "Title is required" }]
            },
            {
              "field": "table_name",
              "label": "Table Name",
              "component": "vxe-input",
              "props": { "clearable": true, "placeholder": "public.trial_bookings" },
              "rules": [{ "required": true, "message": "Table name is required" }]
            },
            {
              "field": "route_path",
              "label": "Route Path",
              "component": "vxe-input",
              "props": { "clearable": true, "placeholder": "/dashboard/system/trial-bookings" },
              "rules": [{ "required": true, "message": "Route path is required" }]
            },
            {
              "field": "page_code",
              "label": "Page",
              "component": "vxe-select",
              "optionsSourceKey": "lowcodePages",
              "optionProps": { "label": "title", "value": "code" },
              "props": { "clearable": true, "placeholder": "Bind a page" }
            },
            {
              "field": "icon",
              "label": "Icon",
              "component": "vxe-input",
              "props": { "clearable": true, "placeholder": "table / folder / setting" }
            },
            {
              "field": "primary_key",
              "label": "Primary Key",
              "component": "vxe-input",
              "props": { "clearable": true, "placeholder": "id" }
            },
            {
              "field": "status",
              "label": "Status",
              "component": "vxe-select",
              "options": [
                { "label": "Active", "value": "active" },
                { "label": "Inactive", "value": "inactive" }
              ]
            },
            {
              "field": "sort_order",
              "label": "Sort Order",
              "component": "vxe-input",
              "props": { "type": "number", "min": 0 }
            },
            {
              "field": "description",
              "label": "Description",
              "component": "vxe-textarea",
              "props": { "rows": 3, "resize": "vertical" },
              "span": 2
            },
            {
              "field": "schema_json",
              "label": "Schema JSON",
              "component": "vxe-textarea",
              "props": { "rows": 10, "resize": "vertical" },
              "span": 2
            }
          ],
          "actions": [
            { "code": "submit", "label": "Save", "type": "submit", "status": "primary" },
            { "code": "reset", "label": "Reset", "type": "reset" }
          ]
        }
      },
      {
        "id": "entity-grid",
        "kind": "grid",
        "title": "Entities",
        "description": "Use the registry to generate pages later.",
        "sourceKey": "entities",
        "editorBlockId": "entity-form",
        "deleteSourceKey": "entities",
        "schema": {
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": true,
            "rowConfig": { "keyField": "id" },
            "columns": [
              { "field": "code", "title": "Code", "minWidth": 160 },
              { "field": "title", "title": "Title", "minWidth": 160 },
              { "field": "table_name", "title": "Table", "minWidth": 180 },
              { "field": "route_path", "title": "Route", "minWidth": 220 },
              { "field": "page_code", "title": "Page", "minWidth": 160 },
              { "field": "primary_key", "title": "PK", "width": 100, "align": "center" },
              { "field": "status", "title": "Status", "width": 100, "align": "center" },
              { "field": "sort_order", "title": "Sort", "width": 90, "align": "center" },
              { "title": "Actions", "width": 180, "fixed": "right", "slots": { "default": "actions" } }
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
  'admin-system-users',
  '/dashboard/system/users',
  'User Role Binding',
  'Assign backend roles to users and inspect current bindings.',
  'dashboard',
  'published',
  true,
  '{
    "code": "admin-system-users",
    "route": "/dashboard/system/users",
    "title": "User Role Binding",
    "description": "Assign backend roles to users and inspect current bindings.",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "users": {
        "key": "users",
        "serviceName": "admin",
        "serviceMethod": "listUsers",
        "saveMethod": "saveUserRoles"
      },
      "roles": {
        "key": "roles",
        "serviceName": "admin",
        "serviceMethod": "listRoles"
      }
    },
    "blocks": [
      {
        "id": "intro",
        "kind": "text",
        "title": "User Role Binding",
        "content": "Map backend roles to specific users. The admin guard still uses the public users.role field, while this page controls finer-grained access groups."
      },
      {
        "id": "user-role-form",
        "kind": "form",
        "title": "User Role Editor",
        "description": "Pick a user and assign one or more backend roles.",
        "initialValues": {
          "user_id": "",
          "full_name": "",
          "nickname": "",
          "public_role": "",
          "role_codes": []
        },
        "schema": {
          "columns": 2,
          "fields": [
            {
              "field": "user_id",
              "label": "User ID",
              "component": "vxe-input",
              "props": { "readonly": true }
            },
            {
              "field": "full_name",
              "label": "Full Name",
              "component": "vxe-input",
              "props": { "readonly": true }
            },
            {
              "field": "nickname",
              "label": "Nickname",
              "component": "vxe-input",
              "props": { "readonly": true }
            },
            {
              "field": "public_role",
              "label": "Public Role",
              "component": "vxe-input",
              "props": { "readonly": true }
            },
            {
              "field": "role_codes",
              "label": "Backend Roles",
              "component": "vxe-checkbox-group",
              "optionsSourceKey": "roles",
              "optionProps": { "label": "name", "value": "code" },
              "props": { "type": "button" },
              "span": 2
            }
          ],
          "actions": [
            { "code": "submit", "label": "Save Roles", "type": "submit", "status": "primary" },
            { "code": "reset", "label": "Reset", "type": "reset" }
          ]
        }
      },
      {
        "id": "user-grid",
        "kind": "grid",
        "title": "Users",
        "description": "Click edit to bind backend roles to the selected user.",
        "sourceKey": "users",
        "editorBlockId": "user-role-form",
        "deleteSourceKey": "users",
        "schema": {
          "rowActions": { "delete": false },
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": true,
            "rowConfig": { "keyField": "id" },
            "columns": [
              { "field": "id", "title": "User ID", "minWidth": 220 },
              { "field": "full_name", "title": "Full Name", "minWidth": 160 },
              { "field": "nickname", "title": "Nickname", "minWidth": 140 },
              { "field": "role", "title": "Public Role", "width": 120 },
              { "field": "lead_status", "title": "Lead Status", "width": 120 },
              { "field": "role_names", "title": "Backend Roles", "minWidth": 220 },
              { "title": "Actions", "width": 120, "fixed": "right", "slots": { "default": "actions" } }
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
    'System Center',
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
    title = excluded.title,
    path = excluded.path,
    route_type = excluded.route_type,
    icon = excluded.icon,
    page_code = excluded.page_code,
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
  root_route.id,
  route_seed.route_type,
  route_seed.icon,
  route_seed.page_code,
  route_seed.permission_code,
  route_seed.visible,
  route_seed.keep_alive,
  route_seed.layout,
  route_seed.status,
  route_seed.sort_order,
  route_seed.metadata
from root_route
cross join (
  values
    ('system-users', 'User Roles', '/dashboard/system/users', 'page', 'user', 'admin-system-users', 'admin.users.manage', true, true, 'dashboard', 'active', 20, '{"group": "system"}'::jsonb),
    ('system-roles', 'Roles', '/dashboard/system/roles', 'page', 'users', 'admin-system-roles', 'admin.roles.manage', true, true, 'dashboard', 'active', 30, '{"group": "system"}'::jsonb),
    ('system-permissions', 'Permissions', '/dashboard/system/permissions', 'page', 'lock', 'admin-system-permissions', 'admin.permissions.manage', true, true, 'dashboard', 'active', 40, '{"group": "system"}'::jsonb),
    ('system-routes', 'Routes', '/dashboard/system/routes', 'page', 'route', 'admin-system-routes', 'admin.routes.manage', true, true, 'dashboard', 'active', 50, '{"group": "system"}'::jsonb),
    ('system-entities', 'Entities', '/dashboard/system/entities', 'page', 'table', 'admin-system-entities', 'admin.entities.manage', true, true, 'dashboard', 'active', 60, '{"group": "system"}'::jsonb)
) as route_seed(code, title, path, route_type, icon, page_code, permission_code, visible, keep_alive, layout, status, sort_order, metadata)
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
