-- The presentation editor animation panel is rendered from this low-code schema.
insert into public.lowcode_form_definitions (
  code,
  name,
  description,
  table_name,
  schema,
  enabled,
  updated_at
)
values (
  'presentation-animation',
  '演示文稿动画设置',
  '演示文稿设计器左侧动画面板的动画效果、播放时机和时间参数。',
  null,
  $$
  {
    "title": "进场动画",
    "columns": 1,
    "fields": [
      {
        "field": "preset",
        "label": "效果",
        "component": "vxe-select",
        "options": [
          {"label": "无动画", "value": "none"},
          {"label": "淡入", "value": "fade"},
          {"label": "从左侧进入", "value": "fly-left"},
          {"label": "从右侧进入", "value": "fly-right"},
          {"label": "从上方进入", "value": "fly-up"},
          {"label": "从下方进入", "value": "fly-down"},
          {"label": "缩放进入", "value": "zoom"}
        ],
        "props": {"clearable": false, "filterable": false}
      },
      {
        "field": "start",
        "label": "开始方式",
        "component": "vxe-select",
        "options": [
          {"label": "自动播放", "value": "auto"},
          {"label": "点击后播放", "value": "onClick"}
        ],
        "props": {"clearable": false, "filterable": false}
      },
      {
        "field": "duration",
        "label": "时长（毫秒）",
        "component": "lc-number-input",
        "props": {"min": 80, "max": 10000, "step": 50, "precision": 0}
      },
      {
        "field": "delay",
        "label": "延迟（毫秒）",
        "component": "lc-number-input",
        "props": {"min": 0, "max": 10000, "step": 50, "precision": 0}
      },
      {
        "field": "order",
        "label": "播放顺序",
        "component": "lc-number-input",
        "props": {"min": 1, "max": 999, "step": 1, "precision": 0}
      }
    ],
    "layout": [
      {"kind": "field", "field": "preset"},
      {"kind": "field", "field": "start"},
      {
        "kind": "row",
        "gutter": 8,
        "columns": [
          {"span": 12, "blocks": [{"kind": "field", "field": "duration"}]},
          {"span": 12, "blocks": [{"kind": "field", "field": "delay"}]}
        ]
      },
      {"kind": "field", "field": "order"}
    ],
    "actions": []
  }
  $$::jsonb,
  true,
  timezone('utc', now())
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  table_name = excluded.table_name,
  schema = excluded.schema,
  enabled = true,
  updated_at = timezone('utc', now());

select pg_notify('pgrst', 'reload schema');
