begin;

insert into public.lowcode_form_definitions
  (code, name, description, table_name, schema, enabled, user_id)
values (
  'print-designer.datasource-excel',
  '从 Excel 创建打印数据源',
  '先设置 Excel 字段和标题行，再选择文件；工作表名称同时作为数据源名称。',
  null,
  $schema$
  {
    "title": "Excel 导入配置",
    "columns": 2,
    "fields": [
      {
        "field": "hasFieldRow", "label": "包含 field 行", "component": "vxe-switch",
        "defaultValue": true
      },
      {
        "field": "hasChineseRow", "label": "包含中文行", "component": "vxe-switch",
        "defaultValue": false
      },
      {
        "field": "sheetName", "label": "工作表名称（数据源名称）", "component": "vxe-input",
        "props": { "placeholder": "留空使用第一个工作表" }
      },
      {
        "field": "appendExisting", "label": "追加现有明细", "component": "vxe-switch",
        "defaultValue": false
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
