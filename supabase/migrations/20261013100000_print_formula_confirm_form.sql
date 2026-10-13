begin;

insert into public.lowcode_form_definitions
  (code, name, description, table_name, schema, enabled, user_id)
values (
  'print-designer.formula',
  '插入公式',
  '打印设计器本地预览使用的简易公式选择表单。',
  null,
  $schema$
  {
    "title": "插入公式",
    "columns": 1,
    "fields": [
      {"field":"functionName","label":"函数","component":"vxe-select","props":{"allowCreate":false,"clearable":false},"options":[{"label":"合计（TOTAL）","value":"TOTAL"},{"label":"最大值（MAX）","value":"MAX"},{"label":"最小值（MIN）","value":"MIN"},{"label":"平均值（AVERAGE）","value":"AVERAGE"},{"label":"条数（COUNT）","value":"COUNT"}]},
      {"field":"detailField","label":"明细源","component":"vxe-select","props":{"allowCreate":false,"clearable":false},"options":[]},
      {"field":"field","label":"字段","component":"vxe-select","props":{"allowCreate":false,"clearable":false},"options":[]},
      {"field":"scope","label":"统计范围","component":"vxe-select","props":{"allowCreate":false,"clearable":false},"options":[{"label":"全单","value":"all"},{"label":"本页","value":"page"}]},
      {"field":"digits","label":"小数位","component":"vxe-select","props":{"allowCreate":false,"clearable":false},"options":[{"label":"不固定","value":""},{"label":"0 位","value":"0"},{"label":"1 位","value":"1"},{"label":"2 位","value":"2"},{"label":"3 位","value":"3"},{"label":"4 位","value":"4"},{"label":"5 位","value":"5"},{"label":"6 位","value":"6"},{"label":"7 位","value":"7"},{"label":"8 位","value":"8"},{"label":"9 位","value":"9"},{"label":"10 位","value":"10"},{"label":"11 位","value":"11"},{"label":"12 位","value":"12"},{"label":"13 位","value":"13"},{"label":"14 位","value":"14"},{"label":"15 位","value":"15"},{"label":"16 位","value":"16"},{"label":"17 位","value":"17"},{"label":"18 位","value":"18"},{"label":"19 位","value":"19"},{"label":"20 位","value":"20"}]},
      {"field":"pageIndex","label":"示例页","component":"vxe-select","props":{"allowCreate":false,"clearable":false},"options":[]},
      {"field":"formula","label":"生成公式","component":"vxe-input","props":{"readonly":true}},
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
