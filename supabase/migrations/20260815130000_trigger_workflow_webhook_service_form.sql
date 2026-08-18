-- Align the Webhook entry inspector with the public service gateway contract.

begin;

update public.lowcode_form_definitions
set
  description = 'Webhook 触发节点固定使用 POST /api/service，并通过子表单配置服务调用请求体。',
  schema = $webhook_schema$
  {
    "columns": 1,
    "fields": [
      {
        "field": "id",
        "label": "节点 ID",
        "component": "vxe-input",
        "props": { "disabled": true, "clearable": false }
      },
      {
        "field": "name",
        "label": "节点名称",
        "component": "vxe-input",
        "props": { "placeholder": "请输入节点名称", "clearable": true },
        "rules": [{ "required": true, "message": "节点名称不能为空" }]
      },
      {
        "field": "description",
        "label": "节点说明",
        "component": "vxe-textarea",
        "props": { "placeholder": "说明节点的业务用途", "rows": 3, "resize": "vertical" }
      },
      {
        "field": "webhookPath",
        "label": "请求路径",
        "component": "vxe-input",
        "props": { "disabled": true, "clearable": false },
        "rules": [{ "required": true, "message": "请求路径不能为空" }]
      },
      {
        "field": "webhookMethod",
        "label": "请求方法",
        "component": "vxe-select",
        "props": { "disabled": true, "clearable": false },
        "options": [{ "label": "POST", "value": "POST" }]
      },
      {
        "field": "webhookBody",
        "label": "请求 Body",
        "component": "lc-sub-form",
        "props": {
          "schema": {
            "columns": 1,
            "fields": [
              {
                "field": "serviceName",
                "label": "服务名称",
                "component": "vxe-select",
                "props": { "clearable": false },
                "options": [
                  { "label": "账户服务", "value": "account" },
                  { "label": "支付服务", "value": "payment" },
                  { "label": "用户服务", "value": "user" },
                  { "label": "低代码服务", "value": "lowcode" },
                  { "label": "系统管理服务", "value": "admin" },
                  { "label": "文章服务", "value": "posts" },
                  { "label": "通知服务", "value": "notification" },
                  { "label": "工作流服务", "value": "workflow" },
                  { "label": "实体设计服务", "value": "entityDesign" },
                  { "label": "文件服务", "value": "files" },
                  { "label": "聊天服务", "value": "chat" },
                  { "label": "计划服务", "value": "planning" },
                  { "label": "MES 服务", "value": "mes" }
                ],
                "rules": [{ "required": true, "message": "服务名称不能为空" }]
              },
              {
                "field": "serviceMethod",
                "label": "服务方法",
                "component": "vxe-input",
                "props": { "placeholder": "例如：listItems", "clearable": true },
                "rules": [{ "required": true, "message": "服务方法不能为空" }]
              },
              {
                "field": "postData",
                "label": "请求参数",
                "component": "lc-json-editor",
                "props": {
                  "dialogTitle": "编辑 postData",
                  "jsonRootType": "object",
                  "jsonValueMode": "parsed",
                  "placeholder": "打开 JSON 编辑器"
                }
              }
            ],
            "actions": []
          }
        }
      },
      {
        "field": "metadata",
        "label": "运行元数据",
        "component": "lc-json-editor",
        "props": {
          "dialogTitle": "编辑运行元数据",
          "jsonRootType": "object",
          "jsonValueMode": "parsed",
          "placeholder": "打开 JSON 编辑器"
        }
      },
      {
        "field": "rawConfig",
        "label": "完整配置",
        "component": "lc-json-editor",
        "help": "修改后将替换节点的全部 config。",
        "props": {
          "dialogTitle": "编辑节点完整配置",
          "jsonRootType": "object",
          "jsonValueMode": "parsed",
          "placeholder": "打开 JSON 编辑器"
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
            "label": "基础信息",
            "blocks": [
              { "kind": "field", "field": "id" },
              { "kind": "field", "field": "name" },
              { "kind": "field", "field": "description" }
            ]
          },
          {
            "key": "trigger",
            "label": "触发配置",
            "blocks": [
              { "kind": "field", "field": "webhookPath" },
              { "kind": "field", "field": "webhookMethod" },
              { "kind": "field", "field": "webhookBody" }
            ]
          },
          {
            "key": "advanced",
            "label": "高级配置",
            "blocks": [
              { "kind": "field", "field": "metadata" },
              { "kind": "field", "field": "rawConfig" }
            ]
          }
        ]
      }
    ],
    "actions": []
  }
  $webhook_schema$::jsonb
where code = 'trigger-workflow.node.webhook';

do $validation$
declare
  definition_count integer;
  webhook_schema jsonb;
  webhook_body_field jsonb;
begin
  select count(*)
  into definition_count
  from public.lowcode_form_definitions
  where code = 'trigger-workflow.node.webhook';

  select schema
  into webhook_schema
  from public.lowcode_form_definitions
  where code = 'trigger-workflow.node.webhook'
  limit 1;

  select field
  into webhook_body_field
  from jsonb_array_elements(coalesce(webhook_schema->'fields', '[]'::jsonb)) field
  where field->>'field' = 'webhookBody'
  limit 1;

  if definition_count <> 1
    or coalesce(webhook_body_field->>'component', '') <> 'lc-sub-form'
    or jsonb_typeof(webhook_body_field->'props'->'schema'->'fields') <> 'array'
    or not (webhook_body_field->'props'->'schema'->'fields' @> '[{"field":"serviceName"}]'::jsonb)
    or not (webhook_body_field->'props'->'schema'->'fields' @> '[{"field":"serviceMethod"}]'::jsonb)
    or not (webhook_body_field->'props'->'schema'->'fields' @> '[{"field":"postData"}]'::jsonb)
    or not ((webhook_schema #> '{layout,0,tabs,1,blocks}') @> '[{"kind":"field","field":"webhookBody"}]'::jsonb)
  then
    raise exception 'Trigger workflow webhook service form migration validation failed.';
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
