-- Normalize empty strings according to the physical target column type.
-- Text-like columns keep "" exactly as submitted; scalar columns that cannot
-- parse an empty string (date/time, numeric, boolean, uuid, enum, arrays, etc.)
-- receive SQL NULL. This applies to every dynamic CRUD resource and detail row.

create or replace function dynamic_crud_private.normalize_empty_typed_values(
  p_table_name text,
  p_payload jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_relation regclass := pg_catalog.to_regclass(
    dynamic_crud_private.quote_relation(p_table_name)
  );
  v_result jsonb := coalesce(p_payload, '{}'::jsonb);
  v_field text;
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    return p_payload;
  end if;

  for v_field in
    select input.key
    from pg_catalog.jsonb_each(p_payload) input
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = v_relation
     and attribute.attname = input.key
     and attribute.attnum > 0
     and not attribute.attisdropped
    join pg_catalog.pg_type declared_type
      on declared_type.oid = attribute.atttypid
    left join pg_catalog.pg_type base_type
      on base_type.oid = nullif(declared_type.typbasetype, 0)
    where pg_catalog.jsonb_typeof(input.value) = 'string'
      and pg_catalog.btrim(input.value #>> '{}') = ''
      and coalesce(base_type.typname, declared_type.typname) not in (
        'text', 'varchar', 'bpchar', 'citext', 'json', 'jsonb', 'xml', 'bytea'
      )
  loop
    v_result := pg_catalog.jsonb_set(
      v_result,
      array[v_field],
      'null'::jsonb,
      false
    );
  end loop;

  return v_result;
end;
$function$;

create or replace function dynamic_crud_private.insert_row(
  p_table_name text,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $function$
declare
  v_relation text := dynamic_crud_private.quote_relation(p_table_name);
  v_payload jsonb := dynamic_crud_private.normalize_empty_typed_values(
    p_table_name,
    p_payload
  );
  v_columns text;
  v_values text;
  v_result jsonb;
begin
  if v_payload = '{}'::jsonb then
    execute 'with inserted as (insert into ' || v_relation ||
            ' default values returning *) select to_jsonb(inserted) from inserted'
      into v_result;
    return v_result;
  end if;

  select pg_catalog.string_agg(pg_catalog.format('%I', key), ', ' order by key),
         pg_catalog.string_agg(
           pg_catalog.format('(jsonb_populate_record(null::%s, $1)).%I', v_relation, key),
           ', ' order by key
         )
    into v_columns, v_values
    from pg_catalog.jsonb_each(v_payload);

  execute 'with inserted as (insert into ' || v_relation || ' (' || v_columns || ') select ' || v_values ||
          ' returning *) select to_jsonb(inserted) from inserted'
    into v_result
    using v_payload;
  return v_result;
end;
$function$;

create or replace function dynamic_crud_private.update_rows(
  p_table_name text,
  p_payload jsonb,
  p_filters jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $function$
declare
  v_relation text := dynamic_crud_private.quote_relation(p_table_name);
  v_payload jsonb := dynamic_crud_private.normalize_empty_typed_values(
    p_table_name,
    p_payload
  );
  v_set text;
  v_filter jsonb;
  v_where text;
  v_values jsonb;
  v_rows jsonb;
begin
  if v_payload is null or v_payload = '{}'::jsonb then
    raise exception 'No writable update fields were provided.' using errcode = '22023';
  end if;
  select pg_catalog.string_agg(
           pg_catalog.format('%I = (jsonb_populate_record(null::%s, $2)).%I', key, v_relation, key),
           ', ' order by key
         )
    into v_set from pg_catalog.jsonb_each(v_payload);
  v_filter := dynamic_crud_private.build_filter_clause(p_filters, p_table_name);
  v_where := v_filter->>'sql';
  v_values := v_filter->'values';
  if coalesce(v_where, '') = '' then
    raise exception 'At least one effective update condition is required.' using errcode = '22023';
  end if;

  execute 'with changed as (update ' || v_relation || ' set ' || v_set || ' where ' || v_where ||
          ' returning *) select coalesce(pg_catalog.jsonb_agg(to_jsonb(changed)), ''[]''::jsonb) from changed'
    into v_rows
    using v_values, v_payload;
  return coalesce(v_rows, '[]'::jsonb);
end;
$function$;

revoke all on function dynamic_crud_private.normalize_empty_typed_values(text, jsonb)
  from public, anon;
grant execute on function dynamic_crud_private.normalize_empty_typed_values(text, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';
