insert into public.lowcode_form_definitions (
  code,
  name,
  description,
  schema,
  enabled
)
values (
  'entity-design-load-physical-tables',
  '实体设计 - 加载真实表',
  '实体设计器中用于选择数据库真实表并同步 metadata 的低代码表单。',
  $schema$
  {
    "columns": 1,
    "fields": [
      {
        "field": "tables",
        "label": "真实表",
        "component": "lc-array-table",
        "showTitle": false,
        "props": {
          "columns": [
            {
              "field": "checked",
              "title": "",
              "type": "checkbox",
              "width": 52
            },
            {
              "field": "fullName",
              "title": "真实表",
              "component": "lc-text",
              "minWidth": 220,
              "readonly": true
            },
            {
              "field": "title",
              "title": "显示名称",
              "component": "lc-text",
              "minWidth": 180,
              "readonly": true
            },
            {
              "field": "columnCount",
              "title": "字段数",
              "component": "lc-text",
              "width": 96,
              "align": "right",
              "readonly": true
            },
            {
              "field": "metadataStatus",
              "title": "Metadata",
              "component": "lc-text",
              "width": 120,
              "align": "center",
              "readonly": true
            }
          ],
          "showSeq": false,
          "showToolbar": false,
          "showActions": false,
          "movable": false,
          "removable": false,
          "copyable": false,
          "rowConfig": {
            "keyField": "fullName"
          },
          "gridOptions": {
            "border": true,
            "showOverflow": "tooltip",
            "height": "min(440px, calc(100vh - 220px))",
            "minHeight": 280,
            "checkboxConfig": {
              "checkField": "checked"
            }
          }
        }
      }
    ],
    "layout": [
      {
        "kind": "field",
        "field": "tables"
      }
    ],
    "actions": []
  }
  $schema$::jsonb,
  true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  schema = excluded.schema,
  enabled = excluded.enabled;
