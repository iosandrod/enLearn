begin;

insert into public.lowcode_form_definitions
  (code, name, description, table_name, schema, enabled, user_id)
values (
  'print-designer.format',
  '文本格式化',
  '打印设计器文本变量的数字和日期格式化表单。',
  null,
  $schema$
  {
    "title": "格式化",
    "columns": 1,
    "fields": [
      {"field":"variable","label":"变量","component":"vxe-select","props":{"allowCreate":false,"clearable":false},"options":[]},
      {"field":"formatType","label":"格式化类型","component":"vxe-select","props":{"allowCreate":false,"clearable":false},"options":[{"label":"数字","value":"number"},{"label":"日期","value":"date"}]},
      {"field":"digits","label":"保留小数位","component":"vxe-select","props":{"allowCreate":false,"clearable":false,"visibleWhen":{"field":"formatType","equals":"number"}},"options":[{"label":"0 位","value":"0"},{"label":"1 位","value":"1"},{"label":"2 位","value":"2"},{"label":"3 位","value":"3"},{"label":"4 位","value":"4"},{"label":"5 位","value":"5"},{"label":"6 位","value":"6"}]},
      {"field":"useGrouping","label":"千分位分隔","component":"vxe-switch","props":{"visibleWhen":{"field":"formatType","equals":"number"}}},
      {"field":"dateFormat","label":"日期格式","component":"vxe-select","props":{"allowCreate":false,"clearable":false,"visibleWhen":{"field":"formatType","equals":"date"}},"options":[{"label":"2026-10-15","value":"YYYY-MM-DD"},{"label":"2026/10/15","value":"YYYY/MM/DD"},{"label":"2026年10月15日","value":"YYYY年MM月DD日"},{"label":"2026-10-15 14:30","value":"YYYY-MM-DD HH:mm"},{"label":"2026-10-15 14:30:00","value":"YYYY-MM-DD HH:mm:ss"},{"label":"14:30:00","value":"HH:mm:ss"}]},
      {"field":"expression","label":"生成表达式","component":"vxe-input","props":{"readonly":true}},
      {"field":"preview","label":"示例结果","component":"vxe-input","props":{"readonly":true}},
      {"field":"hint","label":"说明","component":"vxe-textarea","props":{"readonly":true,"rows":2}}
    ],
    "actions": []
  }
  $schema$::jsonb,
  true,
  null
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  table_name = excluded.table_name,
  schema = excluded.schema,
  enabled = true,
  updated_at = timezone('utc', now());

select pg_notify('pgrst', 'reload schema');
commit;
