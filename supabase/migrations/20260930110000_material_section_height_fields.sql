begin;

-- The print designer loads this schema from the database. Add the section
-- height controls without replacing any fields customized by the form designer.
do $material_height_fields$
declare
  field_definition jsonb;
  field_name text;
begin
  for field_definition in
    select value
    from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object(
        'field', 'pageHeaderHeight',
        'label', '页头高度',
        'component', 'lc-number-input',
        'props', jsonb_build_object('min', 0, 'step', 1)
      ),
      jsonb_build_object(
        'field', 'tableHeaderHeight',
        'label', '表头高度',
        'component', 'lc-number-input',
        'props', jsonb_build_object('min', 0, 'step', 1)
      ),
      jsonb_build_object(
        'field', 'tableBodyHeight',
        'label', '表体高度',
        'component', 'lc-number-input',
        'props', jsonb_build_object('min', 0, 'step', 1)
      ),
      jsonb_build_object(
        'field', 'tableFooterHeight',
        'label', '表尾高度',
        'component', 'lc-number-input',
        'props', jsonb_build_object('min', 0, 'step', 1)
      ),
      jsonb_build_object(
        'field', 'pageFooterHeight',
        'label', '页尾高度',
        'component', 'lc-number-input',
        'props', jsonb_build_object('min', 0, 'step', 1)
      )
    ))
  loop
    field_name := field_definition ->> 'field';

    update public.lowcode_form_definitions definition
    set schema = jsonb_set(
      definition.schema,
      '{fields}',
      coalesce(definition.schema -> 'fields', '[]'::jsonb) || jsonb_build_array(field_definition),
      true
    )
    where definition.code = 'print-designer.property.vue-material'
      and jsonb_typeof(coalesce(definition.schema -> 'fields', '[]'::jsonb)) = 'array'
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(definition.schema -> 'fields', '[]'::jsonb)) existing_field
        where existing_field ->> 'field' = field_name
      );

    -- Existing property forms use tabs, so fields must also be referenced by
    -- the layout or LowCodeForm intentionally leaves them out of the UI.
    update public.lowcode_form_definitions definition
    set schema = jsonb_set(
      definition.schema,
      '{layout}',
      (
        select jsonb_agg(
          case when layout_item.value ->> 'kind' = 'tabs' then
            jsonb_set(
              layout_item.value,
              '{tabs}',
              (
                select jsonb_agg(
                  case
                    when tab.value ->> 'label' = '高级属性'
                      and not exists (
                        select 1
                        from jsonb_array_elements(coalesce(tab.value -> 'blocks', '[]'::jsonb)) block
                        where block ->> 'field' = field_name
                      )
                    then jsonb_set(
                      tab.value,
                      '{blocks}',
                      coalesce(tab.value -> 'blocks', '[]'::jsonb) || jsonb_build_array(
                        jsonb_build_object('kind', 'field', 'field', field_name)
                      ),
                      true
                    )
                    else tab.value
                  end
                  order by tab.ordinality
                )
                from jsonb_array_elements(layout_item.value -> 'tabs')
                  with ordinality tab(value, ordinality)
              ),
              true
            )
          else layout_item.value
          end
          order by layout_item.ordinality
        )
        from jsonb_array_elements(definition.schema -> 'layout')
          with ordinality layout_item(value, ordinality)
      ),
      true
    )
    where definition.code = 'print-designer.property.vue-material'
      and jsonb_typeof(definition.schema -> 'layout') = 'array'
      and jsonb_path_exists(
        definition.schema,
        '$.layout[*].tabs[*] ? (@.label == "高级属性")'
      );
  end loop;
end
$material_height_fields$;

commit;
