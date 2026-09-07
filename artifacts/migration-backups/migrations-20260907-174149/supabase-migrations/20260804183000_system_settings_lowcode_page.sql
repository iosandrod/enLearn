-- Add a database-backed system settings page to the left navigation.

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
  'system-settings',
  '/dashboard/system/settings',
  U&'\7CFB\7EDF\8BBE\7F6E',
  U&'\7CFB\7EDF\5916\89C2\3001\8868\683C\4E0E\672C\5730\5316\53C2\6570\914D\7F6E\3002',
  'custom',
  'dashboard',
  'published',
  true,
  $json$
  {
    "schemaVersion": 1,
    "code": "system-settings",
    "route": "/dashboard/system/settings",
    "title": "系统设置",
    "description": "系统外观、表格与本地化参数配置。",
    "pageType": "custom",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "systemSettings": {
        "key": "systemSettings",
        "label": "系统设置",
        "serviceName": "admin",
        "serviceMethod": "listItems",
        "saveMethod": "saveItem",
        "entityCode": "system_config",
        "tableName": "system_config",
        "postData": {
          "resource": "system_config",
          "tableName": "system_config",
          "sorts": [
            { "field": "updated_at", "direction": "desc" }
          ],
          "limit": 1
        },
        "autoLoad": true
      },
      "selectedSystemSettingRows": {
        "key": "selectedSystemSettingRows",
        "label": "当前系统设置",
        "serviceName": "admin",
        "serviceMethod": "listItems",
        "postData": {
          "resource": "system_config",
          "tableName": "system_config",
          "limit": 1
        },
        "autoLoad": false
      }
    },
    "blocks": [
      {
        "id": "system-settings-actions",
        "kind": "buttonGroup",
        "align": "left",
        "gap": 8,
        "actions": [
          {
            "code": "show-current-settings",
            "label": "当前配置",
            "status": "primary",
            "icon": "ri-settings-3-line",
            "directives": [
              {
                "type": "refreshDataSource",
                "sourceKeys": ["systemSettings"]
              }
            ]
          },
          {
            "code": "reload-system-settings",
            "label": "刷新",
            "icon": "ri-refresh-line",
            "directives": [
              {
                "type": "refreshDataSource",
                "sourceKeys": ["systemSettings"]
              }
            ]
          }
        ]
      },
      {
        "id": "system-settings-grid",
        "kind": "grid",
        "sourceKey": "systemSettings",
        "editorBlockId": "system-settings-form",
        "schema": {
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": true,
            "height": 300,
            "rowConfig": {
              "keyField": "id",
              "isCurrent": true
            },
            "columns": [
              { "type": "seq", "title": "序号", "width": 64, "align": "center" },
              {
                "field": "theme_mode",
                "title": "主题模式",
                "width": 110,
                "fixed": "left",
                "align": "center",
                "formatter": {
                  "type": "enum",
                  "map": {
                    "system": "跟随系统",
                    "light": "浅色",
                    "dark": "深色"
                  },
                  "emptyText": "跟随系统"
                }
              },
              {
                "field": "primary_color",
                "title": "主题色",
                "width": 110,
                "align": "center",
                "formatter": { "type": "text", "emptyText": "#2563eb" }
              },
              {
                "field": "language",
                "title": "界面语言",
                "width": 110,
                "align": "center",
                "formatter": {
                  "type": "enum",
                  "map": {
                    "zh-CN": "简体中文",
                    "en-US": "English"
                  },
                  "emptyText": "简体中文"
                }
              },
              {
                "field": "locale_config.timezone",
                "title": "时区",
                "minWidth": 150,
                "formatter": { "type": "text", "emptyText": "UTC" }
              },
              {
                "field": "table_config.pageSize",
                "title": "默认分页",
                "width": 110,
                "align": "right",
                "formatter": { "type": "number", "emptyText": "20" }
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
                "sourceKey": "selectedSystemSettingRows",
                "value": ["{{ event.row }}"]
              },
              {
                "type": "setFormValues",
                "blockId": "system-settings-form",
                "mode": "replace",
                "value": "{{ event.row }}"
              }
            ]
          }
        }
      },
      {
        "id": "system-settings-tabs",
        "kind": "tabs",
        "defaultKey": "appearance",
        "tabs": [
          {
            "key": "appearance",
            "label": "外观与本地化",
            "blocks": [
              {
                "id": "system-settings-form",
                "kind": "form",
                "submitSourceKey": "systemSettings",
                "initialValues": {
                  "id": "",
                  "theme_mode": "system",
                  "primary_color": "#2563eb",
                  "language": "zh-CN",
                  "theme_config": {
                    "colors": {
                      "primary": "#2563eb",
                      "success": "#16a34a",
                      "warning": "#d97706",
                      "danger": "#dc2626",
                      "info": "#0891b2",
                      "background": "#ffffff",
                      "surface": "#f8fafc",
                      "text": "#0f172a"
                    },
                    "radius": 6
                  },
                  "locale_config": {
                    "timezone": "UTC",
                    "dateFormat": "YYYY-MM-DD",
                    "timeFormat": "HH:mm:ss"
                  }
                },
                "schema": {
                  "columns": 3,
                  "fields": [
                    {
                      "field": "id",
                      "label": "配置ID",
                      "component": "vxe-input",
                      "props": { "disabled": true }
                    },
                    {
                      "field": "theme_mode",
                      "label": "主题模式",
                      "component": "vxe-radio-group",
                      "props": { "type": "button" },
                      "options": [
                        { "label": "跟随系统", "value": "system" },
                        { "label": "浅色", "value": "light" },
                        { "label": "深色", "value": "dark" }
                      ],
                      "rules": [
                        { "required": true, "message": "请选择主题模式" }
                      ]
                    },
                    {
                      "field": "primary_color",
                      "label": "主题色",
                      "component": "lc-color-picker",
                      "props": { "clearable": false },
                      "rules": [
                        { "required": true, "message": "请选择主题色" }
                      ]
                    },
                    {
                      "field": "language",
                      "label": "界面语言",
                      "component": "vxe-select",
                      "options": [
                        { "label": "简体中文", "value": "zh-CN" },
                        { "label": "English", "value": "en-US" }
                      ],
                      "rules": [
                        { "required": true, "message": "请选择界面语言" }
                      ]
                    },
                    {
                      "field": "locale_config",
                      "label": "本地化配置 JSON",
                      "component": "lc-json-editor",
                      "props": { "rows": 8, "resize": "vertical" },
                      "span": 3
                    },
                    {
                      "field": "theme_config",
                      "label": "主题配置 JSON",
                      "component": "lc-json-editor",
                      "props": { "rows": 12, "resize": "vertical" },
                      "span": 3
                    }
                  ],
                  "actions": [
                    {
                      "code": "submit",
                      "label": "保存设置",
                      "type": "submit",
                      "status": "primary"
                    },
                    {
                      "code": "reset",
                      "label": "重置",
                      "type": "reset"
                    }
                  ]
                }
              }
            ]
          },
          {
            "key": "table",
            "label": "表格设置",
            "blocks": [
              {
                "id": "system-settings-table-grid",
                "kind": "grid",
                "sourceKey": "selectedSystemSettingRows",
                "schema": {
                  "grid": {
                    "border": true,
                    "stripe": true,
                    "showOverflow": true,
                    "height": 220,
                    "rowConfig": { "keyField": "id", "isCurrent": true },
                    "columns": [
                      {
                        "field": "table_config.size",
                        "title": "表格尺寸",
                        "width": 120,
                        "align": "center",
                        "formatter": { "type": "text", "emptyText": "medium" }
                      },
                      {
                        "field": "table_config.stripe",
                        "title": "斑马纹",
                        "width": 100,
                        "align": "center",
                        "formatter": {
                          "type": "enum",
                          "map": { "true": "开启", "false": "关闭" },
                          "emptyText": "开启"
                        }
                      },
                      {
                        "field": "table_config.border",
                        "title": "边框",
                        "width": 100,
                        "align": "center",
                        "formatter": {
                          "type": "enum",
                          "map": { "true": "开启", "false": "关闭" },
                          "emptyText": "开启"
                        }
                      },
                      {
                        "field": "table_config.showOverflow",
                        "title": "溢出显示",
                        "width": 130,
                        "align": "center",
                        "formatter": { "type": "text", "emptyText": "tooltip" }
                      },
                      {
                        "field": "table_config.pageSize",
                        "title": "默认分页",
                        "width": 110,
                        "align": "right",
                        "formatter": { "type": "number", "emptyText": "20" }
                      },
                      {
                        "field": "table_config.pageSizes",
                        "title": "分页选项",
                        "minWidth": 180,
                        "formatter": { "type": "text", "emptyText": "10, 20, 50, 100" }
                      },
                      {
                        "field": "table_config.autoHeight",
                        "title": "自动高度",
                        "width": 110,
                        "align": "center",
                        "formatter": {
                          "type": "enum",
                          "map": { "true": "开启", "false": "关闭" },
                          "emptyText": "开启"
                        }
                      }
                    ]
                  },
                  "rowActions": { "edit": false, "delete": false }
                }
              }
            ]
          },
          {
            "key": "advanced",
            "label": "高级配置",
            "blocks": [
              {
                "id": "system-settings-advanced-grid",
                "kind": "grid",
                "sourceKey": "selectedSystemSettingRows",
                "schema": {
                  "grid": {
                    "border": true,
                    "stripe": true,
                    "showOverflow": true,
                    "height": 220,
                    "rowConfig": { "keyField": "id", "isCurrent": true },
                    "columns": [
                      {
                        "field": "feature_flags",
                        "title": "功能开关",
                        "minWidth": 320,
                        "showOverflow": "tooltip",
                        "formatter": { "type": "text", "emptyText": "{}" }
                      },
                      {
                        "field": "metadata",
                        "title": "扩展元数据",
                        "minWidth": 320,
                        "showOverflow": "tooltip",
                        "formatter": { "type": "text", "emptyText": "{}" }
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
where code = 'system-settings'
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
) values (
  'system_config',
  U&'\7CFB\7EDF\8BBE\7F6E',
  'public.system_config',
  '/dashboard/system/settings',
  'system-settings',
  'ri-settings-3-line',
  'Per-user application appearance, table, locale, and feature configuration.',
  'id',
  'active',
  225,
  '{"ownerField":"user_id"}'::jsonb
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
  'system-settings',
  U&'\7CFB\7EDF\8BBE\7F6E',
  '/dashboard/system/settings',
  parent.id,
  'page',
  'ri-settings-3-line',
  'system-settings',
  null,
  true,
  true,
  'dashboard',
  'active',
  34,
  '{"group":"system-settings","navigation":"sidebar"}'::jsonb
from public.admin_routes parent
where parent.code = 'business-root'
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
