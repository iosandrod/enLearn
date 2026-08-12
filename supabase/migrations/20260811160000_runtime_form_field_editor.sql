insert into public.lowcode_form_definitions (
  code,
  name,
  description,
  schema,
  enabled
) values (
  'runtime-form-field-editor',
  '运行时字段属性编辑',
  '编辑单个运行时表单字段的组件、必录、模式禁用、默认值、下拉编码、更新事件和校验函数。',
  $schema$
  {
    "columns": 2,
    "fields": [
      {
        "field": "field",
        "label": "字段编码",
        "component": "vxe-input",
        "props": { "readonly": true }
      },
      {
        "field": "label",
        "label": "字段名称",
        "component": "vxe-input",
        "props": { "clearable": true },
        "rules": [{ "required": true, "message": "字段名称不能为空" }]
      },
      {
        "field": "component",
        "label": "组件类型",
        "component": "vxe-select",
        "optionsCode": "form_field_component_type",
        "props": {
          "clearable": false,
          "filterable": true,
          "placeholder": "请选择组件类型"
        },
        "rules": [{ "required": true, "message": "请选择组件类型" }]
      },
      {
        "field": "required",
        "label": "必须录入",
        "component": "vxe-switch",
        "props": { "openLabel": "是", "closeLabel": "否" }
      },
      {
        "field": "requiredMessage",
        "label": "必录提示",
        "component": "vxe-input",
        "props": { "clearable": true }
      },
      {
        "field": "createDisabled",
        "label": "新增禁用",
        "component": "vxe-switch",
        "props": { "openLabel": "是", "closeLabel": "否" }
      },
      {
        "field": "editDisabled",
        "label": "编辑禁用",
        "component": "vxe-switch",
        "props": { "openLabel": "是", "closeLabel": "否" }
      },
      {
        "field": "relateInfoConfig",
        "label": "关联资料配置",
        "component": "lc-sub-form",
        "span": 2,
        "props": {
          "columns": 2,
          "padding": false,
          "schema": {
            "columns": 2,
            "fields": [
              {
                "field": "sourceType",
                "label": "来源类型",
                "component": "vxe-select",
                "options": [
                  { "label": "实体/表/视图", "value": "entity" },
                  { "label": "低代码页面", "value": "lowcode_page" }
                ],
                "props": { "clearable": false }
              },
              { "field": "entityCode", "label": "实体编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "例如 planning_item" } },
              { "field": "tableName", "label": "表名/视图名", "component": "vxe-input", "props": { "clearable": true, "placeholder": "例如 public.planning_item" } },
              { "field": "resource", "label": "业务资源", "component": "vxe-input", "props": { "clearable": true, "placeholder": "例如 planning_item" } },
              { "field": "pageCode", "label": "页面编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "例如 planning_item-list" } },
              { "field": "sourceKey", "label": "页面数据源", "component": "vxe-input", "props": { "clearable": true, "placeholder": "留空时使用主表格" } },
              { "field": "serviceName", "label": "服务名称", "component": "vxe-input", "props": { "clearable": true, "placeholder": "可选，例如 planning" } },
              { "field": "serviceMethod", "label": "服务方法", "component": "vxe-input", "props": { "clearable": true, "placeholder": "可选，默认 listItems" } },
              { "field": "valueField", "label": "值字段", "component": "vxe-input", "props": { "clearable": true, "placeholder": "例如 id" } },
              { "field": "displayField", "label": "显示字段", "component": "vxe-input", "props": { "clearable": true, "placeholder": "例如 name" } },
              { "field": "displayValueField", "label": "显示值目标字段", "component": "vxe-input", "props": { "clearable": true, "placeholder": "例如 item_id_label" } },
              { "field": "searchField", "label": "搜索字段", "component": "vxe-input", "props": { "clearable": true, "placeholder": "例如 name" } },
              { "field": "pageSize", "label": "每次加载条数", "component": "lc-number-input", "props": { "min": 1, "max": 1000 } },
              { "field": "searchable", "label": "允许搜索", "component": "vxe-switch", "props": { "openLabel": "是", "closeLabel": "否" } },
              {
                "field": "fieldMappings",
                "label": "字段映射",
                "component": "lc-array-table",
                "span": 2,
                "props": {
                  "columns": [
                    { "field": "sourceField", "title": "来源字段", "minWidth": 180, "placeholder": "例如 id" },
                    { "field": "targetField", "title": "目标表单字段", "minWidth": 180, "placeholder": "例如 item_id" }
                  ],
                  "defaultRow": { "sourceField": "", "targetField": "" },
                  "rowConfig": { "keyField": "__rowKey" },
                  "toolbarButtons": [
                    { "code": "add", "label": "新增映射", "command": "add", "status": "primary" }
                  ]
                }
              }
            ],
            "actions": []
          }
        }
      },
      {
        "field": "defaultValueType",
        "label": "默认值类型",
        "component": "vxe-select",
        "options": [
          { "label": "无默认值", "value": "none" },
          { "label": "固定值", "value": "literal" },
          { "label": "函数", "value": "function" }
        ]
      },
      {
        "field": "defaultValue",
        "label": "默认值",
        "component": "vxe-input",
        "props": { "clearable": true, "placeholder": "文本或 JSON，例如 draft、0、false、{}" }
      },
      {
        "field": "optionsCode",
        "label": "关联下拉 Code",
        "component": "vxe-select",
        "optionsCode": "option_source_code",
        "props": {
          "clearable": true,
          "filterable": true,
          "allowCreate": true,
          "placeholder": "请选择或输入下拉 Code"
        }
      },
      {
        "field": "validationMessage",
        "label": "校验提示",
        "component": "vxe-input",
        "props": { "clearable": true }
      },
      {
        "field": "defaultValueScript",
        "label": "默认值函数",
        "component": "lc-monaco-editor",
        "span": 2,
        "props": {
          "dialog": true,
          "dialogTitle": "编辑默认值函数",
          "language": "javascript",
          "scriptThisType": "LowCodeButtonScriptThis",
          "contextDrawer": true,
          "contextDrawerTitle": "当前页面上下文",
          "placeholder": "async function main() { return new Date().toISOString(); }"
        }
      },
      {
        "field": "updateScript",
        "label": "值更新事件",
        "component": "lc-monaco-editor",
        "span": 2,
        "props": {
          "dialog": true,
          "dialogTitle": "编辑值更新事件",
          "language": "javascript",
          "scriptThisType": "LowCodeButtonScriptThis",
          "contextDrawer": true,
          "contextDrawerTitle": "当前页面上下文",
          "placeholder": "async function main(event) { await this.$form.patch(event.blockId, {}); }"
        }
      },
      {
        "field": "validationScript",
        "label": "校验函数",
        "component": "lc-monaco-editor",
        "span": 2,
        "props": {
          "dialog": true,
          "dialogTitle": "编辑字段校验函数",
          "language": "javascript",
          "scriptThisType": "LowCodeButtonScriptThis",
          "contextDrawer": true,
          "contextDrawerTitle": "当前页面上下文",
          "placeholder": "async function main(event) { return event.value ? true : '请输入有效值'; }"
        }
      }
    ],
    "layout": [
      {
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          {
            "key": "basic",
            "label": "基础属性",
            "blocks": [
              {
                "kind": "row",
                "gutter": 16,
                "columns": [
                  { "span": 12, "blocks": [{ "kind": "field", "field": "field" }] },
                  { "span": 12, "blocks": [{ "kind": "field", "field": "label" }] }
                ]
              },
              {
                "kind": "row",
                "gutter": 16,
                "columns": [
                  { "span": 12, "blocks": [{ "kind": "field", "field": "component" }] },
                  { "span": 12, "blocks": [{ "kind": "field", "field": "required" }] }
                ]
              },
              {
                "kind": "row",
                "gutter": 16,
                "columns": [
                  { "span": 12, "blocks": [{ "kind": "field", "field": "requiredMessage" }] },
                  { "span": 6, "blocks": [{ "kind": "field", "field": "createDisabled" }] },
                  { "span": 6, "blocks": [{ "kind": "field", "field": "editDisabled" }] }
                ]
              }
            ]
          },
          {
            "key": "relation",
            "label": "关联资料",
            "blocks": [{ "kind": "field", "field": "relateInfoConfig" }]
          },
          {
            "key": "default-options",
            "label": "默认值与选项",
            "blocks": [
              {
                "kind": "row",
                "gutter": 16,
                "columns": [
                  { "span": 12, "blocks": [{ "kind": "field", "field": "defaultValueType" }] },
                  { "span": 12, "blocks": [{ "kind": "field", "field": "defaultValue" }] }
                ]
              },
              { "kind": "field", "field": "optionsCode" },
              { "kind": "field", "field": "defaultValueScript" }
            ]
          },
          {
            "key": "events-validation",
            "label": "事件与校验",
            "blocks": [
              { "kind": "field", "field": "updateScript" },
              { "kind": "field", "field": "validationMessage" },
              { "kind": "field", "field": "validationScript" }
            ]
          }
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
