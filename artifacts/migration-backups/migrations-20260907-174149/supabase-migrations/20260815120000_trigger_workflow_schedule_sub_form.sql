-- Keep the schedule rule editor in the database-backed inspector schema.

begin;

update public.lowcode_form_definitions
set
  description = '定时触发节点的属性表单，业务定时设置由数据库子表单定义。',
  schema = $schedule_schema$
  {
    "columns": 1,
    "fields": [
      {
        "field": "scheduleRule",
        "label": "业务定时设置",
        "component": "lc-sub-form",
        "props": {
          "schema": {
            "columns": 1,
            "fields": [
              {
                "field": "kind",
                "label": "执行方式",
                "component": "vxe-select",
                "props": { "clearable": false },
                "options": [
                  { "label": "每天", "value": "daily" },
                  { "label": "每周", "value": "weekly" },
                  { "label": "每月", "value": "monthly" },
                  { "label": "周一至周五", "value": "weekdays" },
                  { "label": "每隔几分钟", "value": "interval" },
                  { "label": "自定义 Cron", "value": "custom" }
                ]
              },
              {
                "field": "time",
                "label": "执行时间",
                "component": "vxe-input",
                "props": {
                  "type": "time",
                  "clearable": false,
                  "placeholder": "08:00",
                  "visibleWhen": {
                    "field": "kind",
                    "includes": ["daily", "weekly", "monthly", "weekdays"]
                  }
                }
              },
              {
                "field": "weekday",
                "label": "星期",
                "component": "vxe-select",
                "props": {
                  "clearable": false,
                  "visibleWhen": { "field": "kind", "equals": "weekly" }
                },
                "options": [
                  { "label": "星期一", "value": "1" },
                  { "label": "星期二", "value": "2" },
                  { "label": "星期三", "value": "3" },
                  { "label": "星期四", "value": "4" },
                  { "label": "星期五", "value": "5" },
                  { "label": "星期六", "value": "6" },
                  { "label": "星期日", "value": "0" }
                ]
              },
              {
                "field": "dayOfMonth",
                "label": "每月第几日",
                "component": "lc-number-input",
                "props": {
                  "min": 1,
                  "max": 31,
                  "step": 1,
                  "controls": true,
                  "visibleWhen": { "field": "kind", "equals": "monthly" }
                }
              },
              {
                "field": "intervalMinutes",
                "label": "间隔分钟",
                "component": "lc-number-input",
                "props": {
                  "min": 1,
                  "max": 59,
                  "step": 1,
                  "controls": true,
                  "visibleWhen": { "field": "kind", "equals": "interval" }
                }
              }
            ],
            "actions": []
          }
        }
      },
      {
        "field": "cron",
        "label": "Cron 表达式（高级）",
        "component": "vxe-input",
        "props": { "placeholder": "例如：0 8 * * *", "clearable": true },
        "rules": [{ "required": true, "message": "Cron 表达式不能为空" }]
      },
      {
        "field": "timezone",
        "label": "时区",
        "component": "vxe-input",
        "props": { "placeholder": "Asia/Shanghai", "clearable": true }
      },
      {
        "field": "externalId",
        "label": "外部标识",
        "component": "vxe-input",
        "props": { "placeholder": "用于同步 Trigger.dev 计划", "clearable": true }
      }
    ],
    "layout": [
      {
        "kind": "tabs",
        "defaultKey": "trigger",
        "tabs": [
          {
            "key": "trigger",
            "label": "触发配置",
            "blocks": [
              { "kind": "field", "field": "scheduleRule" },
              { "kind": "field", "field": "cron" },
              { "kind": "field", "field": "timezone" },
              { "kind": "field", "field": "externalId" }
            ]
          }
        ]
      }
    ],
    "actions": []
  }
  $schedule_schema$::jsonb
where code = 'trigger-workflow.node.schedule';

do $validation$
declare
  definition_count integer;
  schedule_schema jsonb;
  schedule_field jsonb;
begin
  select count(*)
  into definition_count
  from public.lowcode_form_definitions
  where code = 'trigger-workflow.node.schedule';

  select schema
  into schedule_schema
  from public.lowcode_form_definitions
  where code = 'trigger-workflow.node.schedule'
  limit 1;

  select field
  into schedule_field
  from jsonb_array_elements(coalesce(schedule_schema->'fields', '[]'::jsonb)) field
  where field->>'field' = 'scheduleRule'
  limit 1;

  if definition_count <> 1
    or coalesce(schedule_field->>'component', '') <> 'lc-sub-form'
    or jsonb_typeof(schedule_field->'props'->'schema'->'fields') <> 'array'
    or jsonb_typeof(schedule_field->'props'->'schema'->'actions') <> 'array'
    or not (schedule_field->'props'->'schema'->'fields' @> '[{"field":"kind"}]'::jsonb)
    or not (schedule_field->'props'->'schema'->'fields' @> '[{"field":"time"}]'::jsonb)
    or not (schedule_field->'props'->'schema'->'fields' @> '[{"field":"intervalMinutes"}]'::jsonb)
    or not ((schedule_schema #> '{layout,0,tabs,0,blocks}') @> '[{"kind":"field","field":"scheduleRule"}]'::jsonb)
  then
    raise exception 'Trigger workflow schedule sub-form migration validation failed.';
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
