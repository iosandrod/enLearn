-- Allow designers to reorder VXE tab panes directly in the bound-property table.

update public.lowcode_form_definitions
set schema = jsonb_set(
  schema,
  '{fields}',
  (
    select jsonb_agg(
      case
        when field_definition ->> 'field' = 'panes' then
          jsonb_set(
            field_definition,
            '{props}',
            coalesce(field_definition -> 'props', '{}'::jsonb) || jsonb_build_object(
              'rowDraggable', true,
              'rowDragConfig', jsonb_build_object(
                'trigger', 'cell',
                'showIcon', true,
                'animation', true,
                'showGuidesStatus', true,
                'showDragTip', true
              ),
              'movable', false
            ),
            true
          )
        else field_definition
      end
      order by field_ordinality
    )
    from jsonb_array_elements(schema -> 'fields') with ordinality
      as fields(field_definition, field_ordinality)
  ),
  false
)
where code = 'material-prop.vxe-tabs'
  and jsonb_typeof(schema -> 'fields') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(schema -> 'fields') as fields(field_definition)
    where field_definition ->> 'field' = 'panes'
      and field_definition ->> 'component' = 'lc-array-table'
  );

notify pgrst, 'reload schema';
