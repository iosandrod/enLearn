-- Organize the runtime field editor into database-defined tabs.

begin;

update public.lowcode_form_definitions
set description = U&'\4F7F\7528\9875\7B7E\7EC4\7EC7\5355\4E2A\8FD0\884C\65F6\8868\5355\5B57\6BB5\7684\57FA\7840\5C5E\6027\3001\5173\8054\8D44\6599\3001\9ED8\8BA4\503C\9009\9879\3001\4E8B\4EF6\548C\6821\9A8C\3002',
    schema = jsonb_set(
      schema,
      '{layout}',
      $layout$
      [
        {
          "kind": "tabs",
          "defaultKey": "basic",
          "tabs": [
            {
              "key": "basic",
              "label": "基础属性",
              "blocks": [
                {
                  "kind": "row",
                  "gutter": 16,
                  "columns": [
                    { "span": 12, "blocks": [{ "kind": "field", "field": "field" }] },
                    { "span": 12, "blocks": [{ "kind": "field", "field": "label" }] }
                  ]
                },
                {
                  "kind": "row",
                  "gutter": 16,
                  "columns": [
                    { "span": 12, "blocks": [{ "kind": "field", "field": "component" }] },
                    { "span": 12, "blocks": [{ "kind": "field", "field": "required" }] }
                  ]
                },
                {
                  "kind": "row",
                  "gutter": 16,
                  "columns": [
                    { "span": 12, "blocks": [{ "kind": "field", "field": "requiredMessage" }] },
                    { "span": 6, "blocks": [{ "kind": "field", "field": "createDisabled" }] },
                    { "span": 6, "blocks": [{ "kind": "field", "field": "editDisabled" }] }
                  ]
                }
              ]
            },
            {
              "key": "relation",
              "label": "关联资料",
              "blocks": [{ "kind": "field", "field": "relateInfoConfig" }]
            },
            {
              "key": "default-options",
              "label": "默认值与选项",
              "blocks": [
                {
                  "kind": "row",
                  "gutter": 16,
                  "columns": [
                    { "span": 12, "blocks": [{ "kind": "field", "field": "defaultValueType" }] },
                    { "span": 12, "blocks": [{ "kind": "field", "field": "defaultValue" }] }
                  ]
                },
                { "kind": "field", "field": "optionsCode" },
                { "kind": "field", "field": "defaultValueProcedure" },
                { "kind": "field", "field": "defaultValueScript" }
              ]
            },
            {
              "key": "events-validation",
              "label": "事件与校验",
              "blocks": [
                { "kind": "field", "field": "updateScript" },
                { "kind": "field", "field": "validationMessage" },
                { "kind": "field", "field": "validationScript" }
              ]
            }
          ]
        }
      ]
      $layout$::jsonb,
      true
    )
where code = 'runtime-form-field-editor';

do $validation$
declare
  v_layout jsonb;
  v_tab_keys text[];
  v_layout_fields text[];
  v_schema_fields text[];
begin
  select schema->'layout'
  into v_layout
  from public.lowcode_form_definitions
  where code = 'runtime-form-field-editor';

  select array_agg(tab->>'key' order by ordinal)
  into v_tab_keys
  from jsonb_array_elements(v_layout->0->'tabs') with ordinality tabs(tab, ordinal);

  with recursive layout_nodes(node) as (
    select block
    from jsonb_array_elements(v_layout->0->'tabs') tab,
      lateral jsonb_array_elements(tab->'blocks') block

    union all

    select child
    from layout_nodes parent,
      lateral jsonb_array_elements(
        case
          when parent.node->>'kind' = 'row' then coalesce(
            (
              select jsonb_agg(block)
              from jsonb_array_elements(parent.node->'columns') column_item,
                lateral jsonb_array_elements(column_item->'blocks') block
            ),
            '[]'::jsonb
          )
          when parent.node->>'kind' = 'stack' then coalesce(parent.node->'blocks', '[]'::jsonb)
          else '[]'::jsonb
        end
      ) child
  )
  select array_agg(distinct node->>'field' order by node->>'field')
  into v_layout_fields
  from layout_nodes
  where node->>'kind' = 'field';

  select array_agg(field_item->>'field' order by field_item->>'field')
  into v_schema_fields
  from public.lowcode_form_definitions definitions,
    lateral jsonb_array_elements(definitions.schema->'fields') field_item
  where definitions.code = 'runtime-form-field-editor';

  if coalesce(v_layout->0->>'kind', '') <> 'tabs'
    or v_tab_keys <> array['basic', 'relation', 'default-options', 'events-validation']::text[]
    or v_layout_fields <> v_schema_fields
  then
    raise exception 'Runtime field editor tab layout validation failed: keys %, layout fields %, schema fields %.',
      v_tab_keys, v_layout_fields, v_schema_fields;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
