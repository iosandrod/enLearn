-- The print data-source panel loads this database-backed form before it can
-- open the add/edit data-source designer. Keep the definition in the same
-- registry as the selector and data-source forms.
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
  'print-designer.datasource-definition',
  '打印数据源定义表单',
  '打印设计器新增和编辑数据源时使用的元数据表单。',
  null,
  $$
  {
    "title": "数据源信息",
    "columns": 2,
    "fields": [
      {
        "field": "code",
        "label": "数据源编码",
        "component": "vxe-input",
        "rules": [{"required": true, "message": "请输入数据源编码"}]
      },
      {
        "field": "name",
        "label": "数据源名称",
        "component": "vxe-input",
        "rules": [{"required": true, "message": "请输入数据源名称"}]
      },
      {
        "field": "tableName",
        "label": "关联表",
        "component": "vxe-input",
        "rules": [{"required": true, "message": "请输入业务表名"}]
      },
      {
        "field": "description",
        "label": "描述",
        "component": "vxe-textarea",
        "props": {"rows": 2}
      }
    ],
    "layout": [
      {"kind": "field", "field": "code"},
      {"kind": "field", "field": "name"},
      {"kind": "field", "field": "tableName"},
      {"kind": "field", "field": "description"}
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
