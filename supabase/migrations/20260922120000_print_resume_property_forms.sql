-- Register database-backed property forms for the resume pagination material.
-- The designer loads all property forms in one request, so both the root
-- component and its section nodes must be enabled together.
begin;

insert into public.lowcode_form_definitions (
  code,
  name,
  description,
  schema,
  enabled,
  updated_at
) values
(
  'print-designer.property.vue-resume',
  '打印设计器 - 简历分页组件属性',
  '简历分页组件的尺寸、名称和分页容器属性。',
  $schema$
  {
    "title": "简历分页组件",
    "columns": 1,
    "fields": [
      {"field":"shapeId","label":"节点 ID","component":"vxe-input","props":{"disabled":true}},
      {"field":"shapeTypeLabel","label":"节点类型","component":"vxe-input","props":{"disabled":true}},
      {"field":"x","label":"X 坐标","component":"lc-number-input","props":{"step":1}},
      {"field":"y","label":"Y 坐标","component":"lc-number-input","props":{"step":1}},
      {"field":"w","label":"宽度","component":"lc-number-input","props":{"min":360,"step":1}},
      {"field":"h","label":"高度","component":"lc-number-input","props":{"min":328,"step":1}},
      {"field":"name","label":"组件名称","component":"vxe-input"},
      {"field":"rotation","label":"旋转角度","component":"lc-number-input","props":{"min":-360,"max":360,"step":1}},
      {"field":"opacity","label":"透明度 (%)","component":"lc-number-input","props":{"min":0,"max":100,"step":1}},
      {"field":"isLocked","label":"锁定节点","component":"vxe-switch"}
    ],
    "layout": [{
      "kind":"tabs",
      "defaultKey":"basic",
      "tabs":[
        {"key":"basic","label":"基本属性","blocks":[{"kind":"field","field":"shapeId"},{"kind":"field","field":"shapeTypeLabel"},{"kind":"field","field":"name"},{"kind":"field","field":"x"},{"kind":"field","field":"y"},{"kind":"field","field":"w"},{"kind":"field","field":"h"}]},
        {"key":"advanced","label":"高级属性","blocks":[{"kind":"field","field":"rotation"},{"kind":"field","field":"opacity"},{"kind":"field","field":"isLocked"}]}
      ]
    }],
    "actions": []
  }
  $schema$::jsonb,
  true,
  timezone('utc', now())
),
(
  'print-designer.property.vue-resume-section',
  '打印设计器 - 简历分区属性',
  '简历分页组件的页头、自动填充内容和页尾分区属性。',
  $schema$
  {
    "title": "简历分区",
    "columns": 1,
    "fields": [
      {"field":"shapeId","label":"节点 ID","component":"vxe-input","props":{"disabled":true}},
      {"field":"shapeTypeLabel","label":"节点类型","component":"vxe-input","props":{"disabled":true}},
      {"field":"x","label":"X 坐标","component":"lc-number-input","props":{"disabled":true}},
      {"field":"y","label":"Y 坐标","component":"lc-number-input","props":{"disabled":true}},
      {"field":"w","label":"宽度","component":"lc-number-input","props":{"disabled":true}},
      {"field":"h","label":"高度","component":"lc-number-input","props":{"min":28,"step":1}},
      {"field":"zone","label":"分区","component":"vxe-select","options":[{"label":"简历页头","value":"pageHeader"},{"label":"自动填充内容","value":"content"},{"label":"简历页尾","value":"pageFooter"}]},
      {"field":"label","label":"名称","component":"vxe-input","props":{"disabled":true}},
      {"field":"rotation","label":"旋转角度","component":"lc-number-input","props":{"min":-360,"max":360,"step":1}},
      {"field":"opacity","label":"透明度 (%)","component":"lc-number-input","props":{"min":0,"max":100,"step":1}},
      {"field":"isLocked","label":"锁定节点","component":"vxe-switch"}
    ],
    "layout": [{
      "kind":"tabs",
      "defaultKey":"basic",
      "tabs":[
        {"key":"basic","label":"基本属性","blocks":[{"kind":"field","field":"shapeId"},{"kind":"field","field":"shapeTypeLabel"},{"kind":"field","field":"label"},{"kind":"field","field":"zone"},{"kind":"field","field":"h"}]},
        {"key":"advanced","label":"高级属性","blocks":[{"kind":"field","field":"w"},{"kind":"field","field":"x"},{"kind":"field","field":"y"},{"kind":"field","field":"rotation"},{"kind":"field","field":"opacity"},{"kind":"field","field":"isLocked"}]}
      ]
    }],
    "actions": []
  }
  $schema$::jsonb,
  true,
  timezone('utc', now())
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = true,
  updated_at = timezone('utc', now());

select pg_notify('pgrst', 'reload schema');

commit;
