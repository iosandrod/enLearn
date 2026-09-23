-- Database-backed configuration for importing Excel rows into a print data-source detail table.
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
  'print-designer.datasource-detail-import',
  '打印数据源明细导入配置',
  '配置 Excel 明细导入时的字段行、中文行、工作表和导入方式。',
  null,
  $$
  {
    "title": "Excel 导入配置",
    "columns": 2,
    "fields": [
      {"field": "hasFieldRow", "label": "包含 field 行", "component": "vxe-switch", "defaultValue": true},
      {"field": "hasChineseRow", "label": "包含中文行", "component": "vxe-switch", "defaultValue": false},
      {"field": "sheetName", "label": "工作表名称", "component": "vxe-input", "props": {"placeholder": "留空使用第一个工作表"}},
      {
        "field": "mode",
        "label": "导入方式",
        "component": "vxe-select",
        "options": [
          {"label": "追加到现有数据", "value": "append"},
          {"label": "替换现有数据", "value": "replace"}
        ],
        "defaultValue": "append"
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
