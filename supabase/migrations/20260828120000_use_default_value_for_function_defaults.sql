-- Store function default source in the field's existing defaultValue property.

create or replace function pg_temp.lowcode_move_function_default_value(value jsonb)
returns jsonb
language plpgsql
as $$
declare
  item jsonb;
  key text;
  result jsonb;
begin
  if jsonb_typeof(value) = 'array' then
    result := '[]'::jsonb;
    for item in select jsonb_array_elements(value) loop
      result := result || jsonb_build_array(pg_temp.lowcode_move_function_default_value(item));
    end loop;
    return result;
  end if;

  if jsonb_typeof(value) <> 'object' then
    return value;
  end if;

  result := '{}'::jsonb;
  for key, item in select * from jsonb_each(value) loop
    result := result || jsonb_build_object(
      key,
      pg_temp.lowcode_move_function_default_value(item)
    );
  end loop;

  if result->>'defaultValueType' = 'function'
    and coalesce(result->>'defaultValue', '') = ''
    and coalesce(result->>'defaultValueScript', '') <> ''
  then
    result := jsonb_set(result, '{defaultValue}', result->'defaultValueScript', true);
  end if;

  return result - 'defaultValueScript';
end;
$$;

create or replace function pg_temp.lowcode_remove_default_value_script_layout(value jsonb)
returns jsonb
language plpgsql
as $$
declare
  item jsonb;
  key text;
  next_item jsonb;
  result jsonb;
begin
  if jsonb_typeof(value) = 'array' then
    result := '[]'::jsonb;
    for item in select jsonb_array_elements(value) loop
      next_item := pg_temp.lowcode_remove_default_value_script_layout(item);
      if next_item is not null then
        result := result || jsonb_build_array(next_item);
      end if;
    end loop;
    return result;
  end if;

  if jsonb_typeof(value) <> 'object' then
    return value;
  end if;

  if value->>'field' = 'defaultValueScript' then
    return null;
  end if;

  result := '{}'::jsonb;
  for key, item in select * from jsonb_each(value) loop
    result := result || jsonb_build_object(
      key,
      pg_temp.lowcode_remove_default_value_script_layout(item)
    );
  end loop;
  return result;
end;
$$;

update public.lowcode_pages
set
  schema = pg_temp.lowcode_move_function_default_value(schema),
  version = coalesce(version, 0) + 1,
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now())
where schema::text like '%defaultValueScript%';

update public.lowcode_form_definitions definitions
set schema = jsonb_set(
  definitions.schema,
  '{fields}',
  (
    select coalesce(jsonb_agg(field_item order by ordinal), '[]'::jsonb)
    from jsonb_array_elements(coalesce(definitions.schema->'fields', '[]'::jsonb))
      with ordinality fields(field_item, ordinal)
    where field_item->>'field' <> 'defaultValueScript'
  ),
  true
)
where definitions.code = 'runtime-form-field-editor'
  and definitions.schema->'fields' @> '[{"field":"defaultValueScript"}]'::jsonb;

update public.lowcode_form_definitions definitions
set schema = jsonb_set(
  definitions.schema,
  '{layout}',
  pg_temp.lowcode_remove_default_value_script_layout(definitions.schema->'layout'),
  true
)
where definitions.code = 'runtime-form-field-editor'
  and definitions.schema::text like '%defaultValueScript%';

do $validation$
begin
  if exists (
    select 1
    from public.lowcode_form_definitions definitions,
      lateral jsonb_array_elements(coalesce(definitions.schema->'fields', '[]'::jsonb)) field_item
    where definitions.code = 'runtime-form-field-editor'
      and field_item->>'field' = 'defaultValueScript'
  ) then
    raise exception 'Runtime form field editor must not expose defaultValueScript.';
  end if;

  if exists (
    select 1
    from public.lowcode_form_definitions definitions
    where definitions.code = 'runtime-form-field-editor'
      and definitions.schema::text like '%defaultValueScript%'
  ) then
    raise exception 'Runtime form field editor layout must not reference defaultValueScript.';
  end if;
end;
$validation$;
