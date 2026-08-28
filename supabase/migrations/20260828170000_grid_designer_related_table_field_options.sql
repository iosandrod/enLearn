-- Drive grid configuration field selectors from the currently associated table metadata.

begin;

create or replace function pg_temp.lowcode_configure_grid_field_pickers(node jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb;
  field_name text;
  source_key text;
begin
  if jsonb_typeof(node) = 'array' then
    select coalesce(jsonb_agg(
      pg_temp.lowcode_configure_grid_field_pickers(value)
      order by ordinality
    ), '[]'::jsonb)
    into result
    from jsonb_array_elements(node) with ordinality as entry(value, ordinality);
    return result;
  end if;

  if jsonb_typeof(node) <> 'object' then
    return node;
  end if;

  select coalesce(jsonb_object_agg(
    key,
    pg_temp.lowcode_configure_grid_field_pickers(value)
  ), '{}'::jsonb)
  into result
  from jsonb_each(node);

  field_name := result ->> 'field';
  source_key := case
    when field_name = 'foreignKey' then 'grid-designer-detail-fields'
    else 'grid-designer-source-fields'
  end;

  if (
    field_name = any (array[
      'categoryField',
      'keyField',
      'checkField',
      'labelField',
      'rowField',
      'parentField',
      'childrenField',
      'hasChild',
      'foreignKey',
      'parentKey'
    ])
    or (field_name = 'field' and result ->> 'label' = '排序字段')
  ) and result ->> 'component' = 'vxe-input' then
    result := jsonb_set(
      result,
      '{component}',
      to_jsonb('vxe-select'::text),
      true
    );
    result := jsonb_set(
      result,
      '{optionsSourceKey}',
      to_jsonb(source_key),
      true
    );
    result := jsonb_set(
      result,
      '{props}',
      coalesce(result -> 'props', '{}'::jsonb) || jsonb_build_object(
        'filterable', true,
        'clearable', true,
        'placeholder', case
          when field_name = 'foreignKey' then '请选择子表关联字段'
          when field_name = 'parentKey' then '请选择主表关联字段'
          else '请选择关联表字段'
        end
      ),
      true
    );
  end if;

  if field_name = 'inheritFields' and result ->> 'component' = 'lc-array-table' then
    result := jsonb_set(
      result,
      '{props}',
      coalesce(result -> 'props', '{}'::jsonb) || jsonb_build_object(
        'columns',
        jsonb_build_array(jsonb_build_object(
          'field', 'value',
          'title', '字段名',
          'component', 'vxe-select',
          'optionsSourceKey', 'grid-designer-source-fields',
          'props', jsonb_build_object(
            'filterable', true,
            'clearable', true,
            'placeholder', '请选择主表字段'
          )
        ))
      ),
      true
    );
  end if;

  return result;
end;
$$;

do $update_grid_designer$
declare
  current_schema jsonb;
  next_schema jsonb;
begin
  select schema
  into current_schema
  from public.lowcode_form_definitions
  where code = 'grid-designer'
  for update;

  if current_schema is null then
    raise exception 'Low-code form grid-designer does not exist.';
  end if;

  next_schema := pg_temp.lowcode_configure_grid_field_pickers(current_schema);

  if current_schema is distinct from next_schema then
    update public.lowcode_form_definitions
    set
      schema = next_schema,
      updated_at = timezone('utc'::text, now())
    where code = 'grid-designer';
  end if;

  if next_schema::text not like '%"optionsSourceKey": "grid-designer-source-fields"%'
    or next_schema::text not like '%"optionsSourceKey": "grid-designer-detail-fields"%'
  then
    raise exception 'Grid designer related-table field option migration validation failed.';
  end if;
end;
$update_grid_designer$;

select pg_notify('pgrst', 'reload schema');

commit;
