-- Store the production planning Gantt display conditions as a reusable low-code form.

begin;

insert into public.lowcode_form_definitions (
  code,
  name,
  description,
  schema,
  enabled
) values (
  'planning-gantt-display-settings',
  '排产甘特图显示设置',
  '控制排产甘特图的时间范围、日期粒度和列宽。',
  $schema$
  {
    "columns": 5,
    "fields": [
      {
        "field": "start",
        "label": "开始时间",
        "component": "vxe-input",
        "props": {
          "clearable": true,
          "type": "datetime-local",
          "placeholder": "按计划范围自动"
        }
      },
      {
        "field": "end",
        "label": "结束时间",
        "component": "vxe-input",
        "props": {
          "clearable": true,
          "type": "datetime-local",
          "placeholder": "按计划范围自动"
        }
      },
      {
        "field": "granularity",
        "label": "日期粒度",
        "component": "vxe-select",
        "props": { "clearable": false },
        "options": [
          { "label": "自动", "value": "auto" },
          { "label": "小时", "value": "hour" },
          { "label": "天", "value": "day" },
          { "label": "周", "value": "week" },
          { "label": "月", "value": "month" }
        ]
      },
      {
        "field": "cellWidth",
        "label": "时间格宽度",
        "component": "lc-number-input",
        "props": { "min": 40, "max": 160, "step": 4, "placeholder": "自动" }
      },
      {
        "field": "gridWidth",
        "label": "左侧列宽",
        "component": "lc-number-input",
        "props": { "min": 176, "max": 420, "step": 8, "placeholder": "自动" }
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

select pg_notify('pgrst', 'reload schema');

commit;
