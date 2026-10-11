begin;

insert into public.lowcode_form_definitions
  (code, name, description, table_name, schema, enabled, user_id)
values (
  'admin.search-model.create',
  '新增查询方案',
  '列表页面新增用户查询方案时使用的低代码表单。',
  null,
  $schema$
  {
    "title": "新增查询方案",
    "columns": 1,
    "fields": [
      {
        "field": "name",
        "label": "方案名称",
        "component": "vxe-input",
        "props": {
          "maxlength": 120,
          "clearable": true,
          "placeholder": "请输入方案名称"
        },
        "rules": [
          {"required": true, "message": "请输入方案名称。"}
        ]
      }
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
