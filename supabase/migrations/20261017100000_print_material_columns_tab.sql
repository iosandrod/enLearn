begin;

-- Extend the saved material property form without replacing its existing tabs
-- or custom fields. Reuse the detail-column subtable input and its configuration.
do $$
declare
  material_schema jsonb;
  columns_field jsonb;
  form_layout jsonb;
  tabs_index integer;
begin
  select schema into material_schema
  from public.lowcode_form_definitions
  where code = 'print-designer.property.vue-material'
  for update;
  if material_schema is null then
    raise exception 'Material property form is missing.';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(material_schema->'fields') field
    where field->>'field' = 'columns'
  ) then
    select field into columns_field
    from public.lowcode_form_definitions definition
    cross join lateral jsonb_array_elements(definition.schema->'fields') field
    where definition.code = 'print-designer.detail-table-columns'
      and field->>'field' = 'columns'
      and field->>'component' = 'lc-array-table'
    limit 1;
    if columns_field is null then
      raise exception 'Print detail columns subtable input is missing.';
    end if;
    columns_field = columns_field || '{"label":"列属性","showTitle":false,"span":1}'::jsonb;
    material_schema = jsonb_set(material_schema, '{fields}',
      (material_schema->'fields') || jsonb_build_array(columns_field));
  end if;

  form_layout = coalesce(material_schema->'layout', '[]'::jsonb);
  select (ordinality - 1)::integer into tabs_index
  from jsonb_array_elements(form_layout) with ordinality as layout(node, ordinality)
  where node->>'kind' = 'tabs'
  limit 1;
  if tabs_index is null then
    form_layout = jsonb_build_array(jsonb_build_object(
      'kind', 'tabs', 'defaultKey', 'basic',
      'tabs', jsonb_build_array(jsonb_build_object(
        'key', 'basic', 'label', '基本属性', 'blocks', form_layout
      ))
    ));
    tabs_index = 0;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(form_layout->tabs_index->'tabs') tab
    where tab->>'key' = 'material-columns'
  ) then
    form_layout = jsonb_set(form_layout, array[tabs_index::text, 'tabs'],
      (form_layout->tabs_index->'tabs') || '[{
        "key":"material-columns","label":"列属性",
        "blocks":[{"kind":"field","field":"columns"}]
      }]'::jsonb);
  end if;

  update public.lowcode_form_definitions
  set schema = jsonb_set(material_schema, '{layout}', form_layout),
      updated_at = timezone('utc', now())
  where code = 'print-designer.property.vue-material';
end;
$$;

select pg_notify('pgrst', 'reload schema');
commit;
