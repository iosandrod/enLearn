-- Complete the system option-source edit page and keep the list page linked to it.

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
  'admin-system-options-edit',
  '/dashboard/system/options/edit',
  U&'\4E0B\62C9\6570\636E\7F16\8F91',
  U&'\7EF4\62A4\4E0B\62C9\6570\636E\6E90\7684\57FA\672C\4FE1\606F\3001\6765\6E90\914D\7F6E\4E0E\5B57\5178\660E\7EC6\3002',
  'edit',
  'dashboard',
  'published',
  false,
  $json$
  {
    "schemaVersion": 1,
    "code": "admin-system-options-edit",
    "route": "/dashboard/system/options/edit",
    "title": "下拉数据编辑",
    "description": "维护下拉数据源的基础信息、来源配置与字典明细。",
    "pageType": "edit",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": false,
    "dataSources": {
      "optionSource": {
        "key": "optionSource",
        "label": "下拉数据源",
        "serviceName": "admin",
        "serviceMethod": "listItems",
        "saveMethod": "saveItem",
        "tableName": "system_option_sources",
        "postData": {
          "resource": "system_option_sources",
          "tableName": "system_option_sources",
          "filters": { "id": "{{ route.query.id }}" },
          "requiredFilters": ["id"],
          "limit": 1
        },
        "autoLoad": true
      },
      "optionItems": {
        "key": "optionItems",
        "label": "字典明细",
        "serviceName": "admin",
        "serviceMethod": "listItems",
        "tableName": "system_option_items",
        "postData": {
          "resource": "system_option_items",
          "tableName": "system_option_items",
          "filters": { "source_code": "{{ data.optionSource.0.code }}" },
          "requiredFilters": ["source_code"],
          "sorts": [
            { "field": "sort_order", "direction": "asc" },
            { "field": "created_at", "direction": "asc" }
          ],
          "limit": 500
        },
        "autoLoad": true
      }
    },
    "blocks": [
      {
        "id": "option-source-edit-actions",
        "kind": "buttonGroup",
        "align": "left",
        "gap": 8,
        "actions": [
          {
            "code": "back-to-options",
            "label": "返回列表",
            "type": "button",
            "icon": "ri-arrow-left-line",
            "route": "/dashboard/system/options"
          },
          {
            "code": "refresh",
            "label": "重新载入",
            "type": "button",
            "icon": "ri-refresh-line"
          }
        ]
      },
      {
        "id": "option-source-edit-tabs",
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          {
            "key": "basic",
            "label": "基础信息",
            "blocks": [
              {
                "id": "option-source-edit-form",
                "kind": "form",
                "title": "数据源信息",
                "sourceKey": "optionSource",
                "submitSourceKey": "optionSource",
                "initialValues": {
                  "id": "",
                  "code": "",
                  "name": "",
                  "description": "",
                  "source_type": "dict",
                  "source_config_json": {},
                  "cache_ttl_seconds": 0,
                  "status": "active",
                  "sort_order": 0,
                  "is_system": false
                },
                "schema": {
                  "columns": 4,
                  "fields": [
                    {
                      "field": "code",
                      "label": "数据源编码",
                      "component": "vxe-input",
                      "span": 2,
                      "props": {
                        "clearable": true,
                        "maxlength": 80,
                        "placeholder": "例如 customer_status"
                      },
                      "rules": [
                        { "required": true, "message": "请输入数据源编码" }
                      ]
                    },
                    {
                      "field": "name",
                      "label": "数据源名称",
                      "component": "vxe-input",
                      "span": 2,
                      "props": {
                        "clearable": true,
                        "maxlength": 120,
                        "placeholder": "请输入数据源名称"
                      },
                      "rules": [
                        { "required": true, "message": "请输入数据源名称" }
                      ]
                    },
                    {
                      "field": "source_type",
                      "label": "来源类型",
                      "component": "vxe-select",
                      "options": [
                        { "label": "字典明细", "value": "dict" },
                        { "label": "数据表", "value": "table" },
                        { "label": "视图", "value": "view" },
                        { "label": "RPC", "value": "rpc" },
                        { "label": "SQL", "value": "sql" }
                      ]
                    },
                    {
                      "field": "status",
                      "label": "状态",
                      "component": "vxe-select",
                      "options": [
                        { "label": "启用", "value": "active" },
                        { "label": "停用", "value": "inactive" }
                      ]
                    },
                    {
                      "field": "cache_ttl_seconds",
                      "label": "缓存秒数",
                      "component": "lc-number-input",
                      "props": { "min": 0, "digits": 0 }
                    },
                    {
                      "field": "sort_order",
                      "label": "排序",
                      "component": "lc-number-input",
                      "props": { "min": 0, "digits": 0 }
                    },
                    {
                      "field": "is_system",
                      "label": "系统内置",
                      "component": "vxe-switch",
                      "props": { "disabled": true }
                    },
                    {
                      "field": "description",
                      "label": "说明",
                      "component": "vxe-textarea",
                      "span": 4,
                      "props": {
                        "rows": 3,
                        "maxlength": 500,
                        "showWordCount": true,
                        "resize": "vertical",
                        "placeholder": "说明此数据源的业务用途"
                      }
                    },
                    {
                      "field": "source_config_json",
                      "label": "来源配置 JSON",
                      "component": "lc-json-editor",
                      "span": 4,
                      "help": "字典类型可保留为空对象；数据表、视图、RPC 和 SQL 类型需填写对应来源配置。",
                      "props": {
                        "rows": 10,
                        "resize": "vertical",
                        "placeholder": "{}"
                      }
                    }
                  ],
                  "actions": [
                    {
                      "code": "submit",
                      "label": "保存",
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
            "key": "items",
            "label": "字典明细",
            "blocks": [
              {
                "id": "option-source-items-note",
                "kind": "text",
                "title": "明细预览",
                "content": "字典类型的数据源在此显示全部可选项；明细新增和维护仍在下拉数据列表的关联表格中完成。",
                "tone": "muted"
              },
              {
                "id": "option-source-items-grid",
                "kind": "grid",
                "title": "字典明细",
                "sourceKey": "optionItems",
                "schema": {
                  "grid": {
                    "border": true,
                    "stripe": true,
                    "showOverflow": "tooltip",
                    "height": 320,
                    "rowConfig": { "keyField": "id", "isCurrent": true },
                    "columns": [
                      { "type": "seq", "title": "序号", "width": 64, "align": "center" },
                      { "field": "label", "title": "显示文本", "minWidth": 180, "fixed": "left" },
                      { "field": "value", "title": "选项值", "minWidth": 180, "fixed": "left" },
                      { "field": "parent_value", "title": "父级值", "minWidth": 140 },
                      { "field": "color", "title": "颜色", "width": 110, "align": "center" },
                      { "field": "disabled", "title": "禁用", "width": 88, "align": "center", "formatter": { "type": "enum", "map": { "true": "是", "false": "否" }, "emptyText": "否" } },
                      { "field": "status", "title": "状态", "width": 96, "align": "center", "formatter": { "type": "enum", "map": { "active": "启用", "inactive": "停用" }, "emptyText": "-" } },
                      { "field": "sort_order", "title": "排序", "width": 88, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
                      { "field": "is_system", "title": "系统", "width": 88, "align": "center", "formatter": { "type": "enum", "map": { "true": "是", "false": "否" }, "emptyText": "否" } },
                      { "field": "updated_at", "title": "更新时间", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } }
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
where code = 'admin-system-options-edit'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

update public.lowcode_pages as list_page
set
  edit_page_id = edit_page.id,
  updated_at = timezone('utc'::text, now())
from public.lowcode_pages as edit_page
where list_page.code = 'admin-system-options'
  and edit_page.code = 'admin-system-options-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

select pg_notify('pgrst', 'reload schema');
