begin;

-- The management form is shared. A script's own schema describes its data,
-- and remains stored separately on print_datasource_script.
insert into public.lowcode_form_definitions
  (code, name, description, table_name, schema, enabled, user_id)
select
  'print-designer.datasource-script-meta',
  '打印脚本基本信息',
  '打印脚本管理上方的基本信息表单。',
  'print_datasource_script',
  '{
    "title": "打印脚本基本信息",
    "columns": 3,
    "fields": [
      {
        "field": "code",
        "label": "脚本编码",
        "component": "vxe-input",
        "props": {"maxlength": 120, "placeholder": "例如 orders.remote"},
        "rules": [{"required": true, "message": "请先配置脚本编码。"}]
      },
      {
        "field": "name",
        "label": "脚本名称",
        "component": "vxe-input",
        "props": {"maxlength": 160, "placeholder": "例如 远程订单数据"}
      },
      {"field": "enabled", "label": "启用脚本", "component": "vxe-switch"}
    ],
    "actions": []
  }'::jsonb,
  true,
  null
where not exists (
  select 1 from public.lowcode_form_definitions
  where code = 'print-designer.datasource-script-meta'
);

select pg_notify('pgrst', 'reload schema');

commit;
