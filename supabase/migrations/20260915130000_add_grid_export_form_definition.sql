-- Global table export configuration form. The runtime hydrates the field list
-- from the current grid columns before opening the confirm dialog.
insert into public.lowcode_form_definitions (code, name, description, schema, enabled)
select
  'grid-export',
  '表格数据导出',
  '所有低代码表格共用的数据导出配置。',
  $schema$
  {
    "columns": 1,
    "fields": [
      {
        "field": "fields",
        "label": "导出字段",
        "component": "vxe-select",
        "options": [],
        "props": { "multiple": true, "filterable": true, "clearable": true },
        "rules": [{ "required": true, "message": "请至少选择一个导出字段" }]
      },
      {
        "field": "dataType",
        "label": "数据类型",
        "component": "vxe-select",
        "options": [
          { "label": "当前表格数据", "value": "all" },
          { "label": "选中行", "value": "selected" },
          { "label": "当前行", "value": "current" }
        ],
        "props": { "clearable": false }
      },
      {
        "field": "fileFormat",
        "label": "文件格式",
        "component": "vxe-select",
        "options": [
          { "label": "CSV（Excel）", "value": "csv" },
          { "label": "JSON", "value": "json" }
        ],
        "props": { "clearable": false }
      },
      {
        "field": "fileName",
        "label": "文件名",
        "component": "vxe-input",
        "props": { "clearable": true, "placeholder": "导出文件名（不含扩展名）" }
      }
    ],
    "actions": []
  }
  $schema$::jsonb,
  true
where not exists (
  select 1 from public.lowcode_form_definitions where code = 'grid-export'
);
