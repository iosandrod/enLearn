-- Store the button-group designer form in the database so its layout and
-- editable fields can be changed without rebuilding the frontend bundle.
begin;

insert into public.lowcode_form_definitions (code, name, description, schema, enabled)
values (
  'button-group-designer',
  '按钮组设计',
  '维护按钮组的按钮配置和组件信息。',
  $schema$
  {
    "columns": 1,
    "fields": [
      {
        "field": "button-group-designer-buttons-form",
        "label": "按钮配置",
        "component": "lc-sub-form",
        "showTitle": false,
        "props": {
          "schema": {
            "columns": 1,
            "fields": [
              {
                "field": "buttons",
                "label": "按钮配置",
                "component": "lc-array-table",
                "span": 24,
                "props": {
                  "height": "100%",
                  "toolbarButtons": [
                    { "code": "add", "label": "新增按钮", "status": "primary" },
                    { "code": "add-dropdown", "label": "新增下拉按钮", "status": "primary" },
                    { "code": "select-default", "label": "选择默认按钮", "status": "primary", "prefixIcon": "ri-list-check-3" }
                  ],
                  "toolbarAlign": "left",
                  "rowKey": "__id",
                  "preserveRowKey": true,
                  "treeConfig": {
                    "childrenField": "children",
                    "expandAll": true,
                    "showLine": true,
                    "indent": 20
                  },
                  "minRows": 1,
                  "childAddable": true,
                  "addChildText": "新增子按钮",
                  "movable": true,
                  "copyable": true,
                  "removable": true,
                  "actionWidth": 156,
                  "defaultRow": {
                    "label": "按钮",
                    "code": "",
                    "status": "",
                    "type": "button",
                    "route": "",
                    "eventName": "",
                    "script": "",
                    "disabled": false,
                    "directivesJson": "[]",
                    "children": []
                  },
                  "columns": [
                    { "field": "label", "title": "按钮名称", "component": "vxe-input", "minWidth": 150, "placeholder": "按钮名称" },
                    { "field": "code", "title": "编码 code", "component": "vxe-input", "minWidth": 150, "placeholder": "create" },
                    {
                      "field": "script",
                      "title": "执行脚本",
                      "component": "lc-monaco-editor",
                      "minWidth": 260,
                      "placeholder": "例如：await this.$source.refresh(\"records\")",
                      "defaultValue": "",
                      "props": {
                        "dialog": true,
                        "dialogTitle": "编辑按钮执行脚本",
                        "language": "javascript",
                        "theme": "vs",
                        "scriptThisType": "LowCodeButtonScriptThis",
                        "contextDrawer": true,
                        "contextDrawerTitle": "当前页面上下文",
                        "editorHeight": "min(500px, calc(100vh - 250px))",
                        "editorOptions": {
                          "wordWrap": "on",
                          "formatOnPaste": true,
                          "formatOnType": true
                        }
                      }
                    },
                    {
                      "field": "status",
                      "title": "状态",
                      "component": "vxe-select",
                      "width": 140,
                      "options": [
                        { "label": "默认", "value": "" },
                        { "label": "主要 primary", "value": "primary" },
                        { "label": "成功 success", "value": "success" },
                        { "label": "警告 warning", "value": "warning" },
                        { "label": "危险 danger", "value": "danger" },
                        { "label": "信息 info", "value": "info" }
                      ]
                    },
                    {
                      "field": "type",
                      "title": "类型",
                      "component": "vxe-select",
                      "width": 140,
                      "options": [
                        { "label": "普通按钮", "value": "button" },
                        { "label": "提交 submit", "value": "submit" },
                        { "label": "重置 reset", "value": "reset" }
                      ]
                    },
                    { "field": "route", "title": "路由", "component": "vxe-input", "minWidth": 180, "placeholder": "/dashboard/..." },
                    { "field": "eventName", "title": "事件名", "component": "vxe-input", "minWidth": 180, "placeholder": "buttonGroup.click" },
                    { "field": "disabled", "title": "禁用", "component": "vxe-switch", "width": 80 },
                    {
                      "field": "directivesJson",
                      "title": "directives JSON",
                      "component": "lc-json-editor",
                      "minWidth": 260,
                      "defaultValue": "[]",
                      "props": {
                        "rows": 3,
                        "placeholder": "[]",
                        "jsonRootType": "array",
                        "jsonValueMode": "string"
                      }
                    }
                  ]
                }
              }
            ],
            "layout": [],
            "actions": []
          }
        }
      },
      {
        "field": "button-group-designer-info-form",
        "label": "组件信息",
        "component": "lc-sub-form",
        "showTitle": false,
        "props": {
          "schema": {
            "columns": 2,
            "fields": [
              { "field": "blockId", "label": "Block ID", "component": "vxe-input", "props": { "placeholder": "button-group" } },
              { "field": "title", "label": "标题", "component": "vxe-input", "props": { "placeholder": "按钮组" } },
              { "field": "description", "label": "描述", "component": "vxe-textarea", "span": 2, "props": { "rows": 3 } },
              {
                "field": "align",
                "label": "对齐方式",
                "component": "vxe-select",
                "options": [
                  { "label": "左对齐", "value": "left" },
                  { "label": "居中", "value": "center" },
                  { "label": "右对齐", "value": "right" },
                  { "label": "两端分布", "value": "space-between" }
                ]
              },
              { "field": "gap", "label": "按钮间距", "component": "vxe-input", "props": { "placeholder": "8" } }
            ],
            "layout": [],
            "actions": []
          }
        }
      }
    ],
    "layout": [
      {
        "kind": "tabs",
        "defaultKey": "buttons",
        "fillRemaining": true,
        "tabs": [
          { "key": "buttons", "label": "按钮设计", "blocks": [{ "kind": "field", "field": "button-group-designer-buttons-form" }] },
          { "key": "info", "label": "组件信息", "blocks": [{ "kind": "field", "field": "button-group-designer-info-form" }] }
        ]
      }
    ],
    "actions": []
  }
  $schema$::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled;

notify pgrst, 'reload schema';
commit;
