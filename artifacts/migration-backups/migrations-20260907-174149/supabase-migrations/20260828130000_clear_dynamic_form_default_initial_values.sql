-- Dynamic defaults must be allowed to populate legacy fields that still have
-- an empty value in their form block's initialValues object.

create or replace function pg_temp.lowcode_clear_dynamic_form_default_initial_values(value jsonb)
returns jsonb
language plpgsql
as $$
declare
  item jsonb;
  key text;
  result jsonb;
  dynamic_fields text[];
begin
  if jsonb_typeof(value) = 'array' then
    result := '[]'::jsonb;
    for item in select jsonb_array_elements(value) loop
      result := result || jsonb_build_array(
        pg_temp.lowcode_clear_dynamic_form_default_initial_values(item)
      );
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
      pg_temp.lowcode_clear_dynamic_form_default_initial_values(item)
    );
  end loop;

  if jsonb_typeof(result->'schema'->'fields') = 'array'
    and jsonb_typeof(result->'initialValues') = 'object'
  then
    select array_agg(field_item->>'field')
    into dynamic_fields
    from jsonb_array_elements(result->'schema'->'fields') field_item
    where field_item->>'defaultValueType' in ('function', 'procedure')
      and coalesce(field_item->>'field', '') <> '';

    if coalesce(array_length(dynamic_fields, 1), 0) > 0 then
      result := jsonb_set(
        result,
        '{initialValues}',
        (result->'initialValues') - dynamic_fields,
        true
      );
    end if;
  end if;

  return result;
end;
$$;

update public.lowcode_pages
set
  schema = pg_temp.lowcode_clear_dynamic_form_default_initial_values(schema),
  version = coalesce(version, 0) + 1,
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now())
where schema::text ~ '"defaultValueType"[[:space:]]*:[[:space:]]*"(function|procedure)"';
