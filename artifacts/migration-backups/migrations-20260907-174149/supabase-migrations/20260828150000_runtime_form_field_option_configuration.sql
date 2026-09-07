-- Expose every option configuration mechanism in the runtime field editor.

begin;

update public.lowcode_form_definitions definitions
set description = U&'\8BBE\7F6E\8FD0\884C\65F6\8868\5355\5B57\6BB5\7684\57FA\7840\5C5E\6027\3001\5173\8054\8D44\6599\3001\9ED8\8BA4\503C\3001\9759\6001\9009\9879\3001\4E0B\62C9\7F16\7801\3001\4E0B\62C9\6570\636E\6E90\548C\4E8B\4EF6\6821\9A8C\3002',
    schema = jsonb_set(
      jsonb_set(
        definitions.schema,
        '{fields}',
        (
          select coalesce(jsonb_agg(field_item order by sort_key), '[]'::jsonb)
          from (
            select field_item, ordinal * 2 as sort_key
            from jsonb_array_elements(coalesce(definitions.schema->'fields', '[]'::jsonb))
              with ordinality fields(field_item, ordinal)
            where field_item->>'field' not in ('options', 'optionsSourceKey')

            union all

            select $field$
            {
              "field": "options",
              "label": "静态选项 options",
              "component": "lc-json-editor",
              "span": 2,
              "props": {
                "rows": 6,
                "placeholder": "[{\"label\": \"选项 A\", \"value\": \"a\"}]"
              }
            }
            $field$::jsonb,
            9001

            union all

            select $field$
            {
              "field": "optionsSourceKey",
              "label": "选项数据源 optionsSourceKey",
              "component": "vxe-input",
              "props": {
                "clearable": true,
                "placeholder": "页面 dataSources 中的数据源 Key"
              }
            }
            $field$::jsonb,
            9002
          ) fields
        ),
        true
      ),
      '{layout,0,tabs}',
      (
        select jsonb_agg(
          case
            when tab->>'key' = 'default-options' then
              jsonb_set(
                tab,
                '{blocks}',
                $layout$
                [
                  {
                    "kind": "row",
                    "gutter": 16,
                    "columns": [
                      { "span": 12, "blocks": [{ "kind": "field", "field": "defaultValueType" }] },
                      { "span": 12, "blocks": [{ "kind": "field", "field": "defaultValue" }] }
                    ]
                  },
                  { "kind": "field", "field": "options" },
                  {
                    "kind": "row",
                    "gutter": 16,
                    "columns": [
                      { "span": 12, "blocks": [{ "kind": "field", "field": "optionsCode" }] },
                      { "span": 12, "blocks": [{ "kind": "field", "field": "optionsSourceKey" }] }
                    ]
                  },
                  { "kind": "field", "field": "defaultValueProcedure" }
                ]
                $layout$::jsonb,
                true
              )
            else tab
          end
          order by ordinal
        )
        from jsonb_array_elements(coalesce(definitions.schema#>'{layout,0,tabs}', '[]'::jsonb))
          with ordinality tabs(tab, ordinal)
      ),
      true
    )
where definitions.code = 'runtime-form-field-editor';

do $validation$
declare
  v_options jsonb;
  v_options_source_key jsonb;
  v_default_options_tab jsonb;
begin
  select field_item
  into v_options
  from public.lowcode_form_definitions definitions,
    lateral jsonb_array_elements(definitions.schema->'fields') field_item
  where definitions.code = 'runtime-form-field-editor'
    and field_item->>'field' = 'options';

  select field_item
  into v_options_source_key
  from public.lowcode_form_definitions definitions,
    lateral jsonb_array_elements(definitions.schema->'fields') field_item
  where definitions.code = 'runtime-form-field-editor'
    and field_item->>'field' = 'optionsSourceKey';

  select tab
  into v_default_options_tab
  from public.lowcode_form_definitions definitions,
    lateral jsonb_array_elements(definitions.schema#>'{layout,0,tabs}') tab
  where definitions.code = 'runtime-form-field-editor'
    and tab->>'key' = 'default-options';

  if coalesce(v_options->>'component', '') <> 'lc-json-editor'
    or coalesce(v_options_source_key->>'component', '') <> 'vxe-input'
    or coalesce(v_default_options_tab::text, '') not like '%"field": "options"%'
    or coalesce(v_default_options_tab::text, '') not like '%"field": "optionsCode"%'
    or coalesce(v_default_options_tab::text, '') not like '%"field": "optionsSourceKey"%'
  then
    raise exception 'Runtime form field option configuration validation failed: options %, optionsSourceKey %, tab %.',
      v_options, v_options_source_key, v_default_options_tab;
  end if;
end;
$validation$;

select pg_notify('pgrst', 'reload schema');

commit;
