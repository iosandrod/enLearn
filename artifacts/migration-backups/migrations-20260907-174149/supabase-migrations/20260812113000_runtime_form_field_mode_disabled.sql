begin;

update public.lowcode_form_definitions definitions
set description = '编辑单个运行时表单字段的组件、必录、模式禁用、默认值、下拉编码、更新事件和校验函数。',
    schema = jsonb_insert(
      definitions.schema,
      array[
        'fields',
        (
          select coalesce(
            max(ordinal) filter (where field_item->>'field' = 'requiredMessage'),
            jsonb_array_length(coalesce(definitions.schema -> 'fields', '[]'::jsonb))
          )::text
          from jsonb_array_elements(coalesce(definitions.schema -> 'fields', '[]'::jsonb))
            with ordinality fields(field_item, ordinal)
        )
      ],
      '{
        "field": "createDisabled",
        "label": "新增禁用",
        "component": "vxe-switch",
        "props": { "openLabel": "是", "closeLabel": "否" }
      }'::jsonb,
      false
    )
where definitions.code = 'runtime-form-field-editor'
  and not coalesce(definitions.schema -> 'fields', '[]'::jsonb)
    @> '[{"field":"createDisabled"}]'::jsonb;

update public.lowcode_form_definitions definitions
set description = '编辑单个运行时表单字段的组件、必录、模式禁用、默认值、下拉编码、更新事件和校验函数。',
    schema = jsonb_insert(
      definitions.schema,
      array[
        'fields',
        (
          select coalesce(
            max(ordinal) filter (where field_item->>'field' = 'createDisabled'),
            max(ordinal) filter (where field_item->>'field' = 'requiredMessage'),
            jsonb_array_length(coalesce(definitions.schema -> 'fields', '[]'::jsonb))
          )::text
          from jsonb_array_elements(coalesce(definitions.schema -> 'fields', '[]'::jsonb))
            with ordinality fields(field_item, ordinal)
        )
      ],
      '{
        "field": "editDisabled",
        "label": "编辑禁用",
        "component": "vxe-switch",
        "props": { "openLabel": "是", "closeLabel": "否" }
      }'::jsonb,
      false
    )
where definitions.code = 'runtime-form-field-editor'
  and not coalesce(definitions.schema -> 'fields', '[]'::jsonb)
    @> '[{"field":"editDisabled"}]'::jsonb;

notify pgrst, 'reload schema';

commit;
