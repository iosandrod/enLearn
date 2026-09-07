update public.lowcode_form_definitions
set schema = jsonb_set(
  schema,
  '{layout}',
  $layout$
  [{
    "kind": "tabs",
    "defaultKey": "basic",
    "tabs": [
      { "key": "basic", "label": "基础", "blocks": [
        { "kind": "field", "field": "__block._vid" },
        { "kind": "field", "field": "blockId" },
        { "kind": "field", "field": "title" }
      ] },
      { "key": "data", "label": "数据", "blocks": [
        { "kind": "field", "field": "sourceKey" },
        { "kind": "field", "field": "initialValuesJson" }
      ] },
      { "key": "structure", "label": "字段", "blocks": [
        { "kind": "field", "field": "fields" }
      ] }
    ]
  }]
  $layout$::jsonb,
  true
)
where code = 'material-prop.lowcode-search-form';

notify pgrst, 'reload schema';
