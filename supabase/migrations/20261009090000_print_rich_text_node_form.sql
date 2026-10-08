begin;

insert into public.lowcode_form_definitions (code, name, description, schema, enabled, user_id)
select
  'print-designer.property.vue-rich-text',
  '富文本节点属性',
  '打印设计器富文本节点的属性表单。',
  ' {
    "title": "富文本节点",
    "columns": 1,
    "fields": [
      {"field":"shapeId","label":"节点 ID","component":"vxe-input","props":{"disabled":true}},
      {"field":"shapeTypeLabel","label":"节点类型","component":"vxe-input","props":{"disabled":true}},
      {"field":"x","label":"X","component":"lc-number-input","props":{"step":1}},
      {"field":"y","label":"Y","component":"lc-number-input","props":{"step":1}},
      {"field":"w","label":"宽度","component":"lc-number-input","props":{"min":1,"step":1}},
      {"field":"h","label":"高度","component":"lc-number-input","props":{"min":1,"step":1}},
      {"field":"content","label":"富文本内容","component":"vxe-textarea","props":{"auto-size":{"minRows":2,"maxRows":5}}},
      {"field":"color","label":"文字颜色","component":"lc-color-picker"},
      {"field":"fontSize","label":"字号","component":"lc-number-input","props":{"min":8,"max":128,"step":1}},
      {"field":"showBorder","label":"显示边框","component":"vxe-switch"},
      {"field":"rotation","label":"旋转角度","component":"lc-number-input","props":{"min":-360,"max":360,"step":1}},
      {"field":"opacity","label":"透明度","component":"lc-number-input","props":{"min":0,"max":100,"step":1}},
      {"field":"isLocked","label":"锁定","component":"vxe-switch"}
    ],
    "actions": []
  }'::jsonb,
  true,
  null
where not exists (select 1 from public.lowcode_form_definitions where code = 'print-designer.property.vue-rich-text');

commit;
