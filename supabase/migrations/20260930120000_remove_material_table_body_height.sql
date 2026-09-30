begin;

-- The table body height is derived from the material height minus the four
-- configurable outer regions, so it must not be exposed by the low-code form.
update public.lowcode_form_definitions definition
set schema = jsonb_set(
  definition.schema,
  '{fields}',
  coalesce(
    (
      select jsonb_agg(field.value order by field.ordinality)
      from jsonb_array_elements(coalesce(definition.schema -> 'fields', '[]'::jsonb))
        with ordinality field(value, ordinality)
      where field.value ->> 'field' <> 'tableBodyHeight'
    ),
    '[]'::jsonb
  ),
  true
)
where definition.code = 'print-designer.property.vue-material'
  and jsonb_typeof(coalesce(definition.schema -> 'fields', '[]'::jsonb)) = 'array';

update public.lowcode_form_definitions definition
set schema = jsonb_set(
  definition.schema,
  '{layout}',
  coalesce(
    (
      select jsonb_agg(
        case
          when layout_item.value ->> 'kind' = 'tabs'
            and jsonb_typeof(layout_item.value -> 'tabs') = 'array'
          then jsonb_set(
            layout_item.value,
            '{tabs}',
            coalesce(
              (
                select jsonb_agg(
                  jsonb_set(
                    tab.value,
                    '{blocks}',
                    coalesce(
                      (
                        select jsonb_agg(block.value order by block.ordinality)
                        from jsonb_array_elements(coalesce(tab.value -> 'blocks', '[]'::jsonb))
                          with ordinality block(value, ordinality)
                        where block.value ->> 'field' <> 'tableBodyHeight'
                      ),
                      '[]'::jsonb
                    ),
                    true
                  )
                  order by tab.ordinality
                )
                from jsonb_array_elements(layout_item.value -> 'tabs')
                  with ordinality tab(value, ordinality)
              ),
              '[]'::jsonb
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
    '[]'::jsonb
  ),
  true
)
where definition.code = 'print-designer.property.vue-material'
  and jsonb_typeof(definition.schema -> 'layout') = 'array';

commit;
