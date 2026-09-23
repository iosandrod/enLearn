-- Keep the visual editor animation controls database-driven so labels, validation,
-- and layout can be changed without rebuilding the low-code framework.
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
  'visual-editor.animation',
  '可视化设计器动画参数',
  '可视化设计器动画列表中的时长、延迟、次数和循环播放设置。',
  null,
  $$
  {
    "title": "动画参数",
    "columns": 1,
    "fields": [
      {
        "field": "duration",
        "label": "持续时间（秒）",
        "component": "lc-number-input",
        "props": {"min": 0, "step": 0.1, "precision": 2},
        "rules": [{"required": true, "message": "请输入持续时间"}]
      },
      {
        "field": "delay",
        "label": "延迟（秒）",
        "component": "lc-number-input",
        "props": {"min": 0, "step": 0.1, "precision": 2},
        "rules": [{"required": true, "message": "请输入延迟时间"}]
      },
      {
        "field": "count",
        "label": "播放次数",
        "component": "lc-number-input",
        "props": {"min": 1, "step": 1, "precision": 0},
        "rules": [{"required": true, "message": "请输入播放次数"}]
      },
      {
        "field": "infinite",
        "label": "循环播放",
        "component": "vxe-switch"
      }
    ],
    "layout": [
      {
        "kind": "row",
        "gutter": 8,
        "columns": [
          {"span": 12, "blocks": [{"kind": "field", "field": "duration"}]},
          {"span": 12, "blocks": [{"kind": "field", "field": "delay"}]},
          {"span": 12, "blocks": [{"kind": "field", "field": "count"}]},
          {"span": 12, "blocks": [{"kind": "field", "field": "infinite"}]}
        ]
      }
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
