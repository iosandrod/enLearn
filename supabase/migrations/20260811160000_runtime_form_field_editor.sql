insert into public.lowcode_form_definitions (
  code,
  name,
  description,
  schema,
  enabled
) values (
  'runtime-form-field-editor',
  '运行时字段属性编辑',
  '编辑单个运行时表单字段的必录、默认值、下拉编码、更新事件和校验函数。',
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
        "component": "vxe-input",
        "props": { "clearable": true, "placeholder": "例如 order_status" }
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
