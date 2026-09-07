-- Keep the VXE tabs property panel database-driven in both page and form designers.

insert into public.lowcode_form_definitions (
  code,
  name,
  description,
  schema,
  enabled
) values (
  'material-prop.vxe-tabs',
  '设计器属性 - VXE 标签页',
  '页面设计与表单设计共用的 VXE 标签页属性面板。',
  $schema$
  {
    "componentKey": "vxe-tabs",
    "title": "标签属性",
    "extendsVisualProps": true,
    "mergeBuiltinFields": true,
    "separateArrayTableTabs": true,
    "fields": [],
    "layout": [
      {
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          {
            "key": "basic",
            "label": "基础",
            "blocks": [
              { "kind": "field", "field": "__block._vid" },
              { "kind": "field", "field": "blockId" },
              { "kind": "field", "field": "title" },
              { "kind": "field", "field": "description" },
              { "kind": "field", "field": "modelValue" }
            ]
          },
          {
            "key": "appearance",
            "label": "外观",
            "blocks": [
              { "kind": "field", "field": "type" },
              { "kind": "field", "field": "position" },
              { "kind": "field", "field": "width" },
              { "kind": "field", "field": "height" },
              { "kind": "field", "field": "titleWidth" },
              { "kind": "field", "field": "titleAlign" },
              { "kind": "field", "field": "padding" },
              { "kind": "field", "field": "showBody" }
            ]
          },
          {
            "key": "behavior",
            "label": "行为",
            "blocks": [
              { "kind": "field", "field": "trigger" },
              { "kind": "field", "field": "showClose" },
              { "kind": "field", "field": "destroyOnClose" }
            ]
          },
          {
            "key": "panes",
            "label": "TabPane 操作表格",
            "blocks": [
              { "kind": "field", "field": "panes" }
            ]
          }
        ]
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

notify pgrst, 'reload schema';
