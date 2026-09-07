-- Normalize empty strings submitted for non-text columns before dynamic CRUD
-- writes. Form controls commonly submit an empty string for an unselected or
-- optional value; PostgreSQL cannot cast that value to typed columns such as
-- uuid, interval, timestamp, numeric, boolean, or jsonb.

create or replace function dynamic_crud_private.normalize_empty_strings_for_typed_columns(
  p_payload jsonb,
  p_table_name text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_schema_name text;
  v_table_name text;
  v_result jsonb;
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    return p_payload;
  end if;

  if pg_catalog.array_length(pg_catalog.string_to_array(p_table_name, '.'), 1) = 2 then
    v_schema_name := (pg_catalog.string_to_array(p_table_name, '.'))[1];
    v_table_name := (pg_catalog.string_to_array(p_table_name, '.'))[2];
  else
    v_schema_name := 'public';
    v_table_name := p_table_name;
  end if;

  select coalesce(
    pg_catalog.jsonb_object_agg(
      entry.key,
      case
        when pg_catalog.jsonb_typeof(entry.value) = 'string'
         and entry.value #>> '{}' = ''
         and exists (
           select 1
           from information_schema.columns columns
           where columns.table_schema = v_schema_name
             and columns.table_name = v_table_name
             and columns.column_name = entry.key
             and (
               columns.udt_name = 'uuid'
               or columns.data_type in (
                 'ARRAY', 'bigint', 'boolean', 'date', 'double precision',
                 'integer', 'interval', 'json', 'jsonb', 'numeric', 'real',
                 'smallint', 'time without time zone', 'time with time zone',
                 'timestamp without time zone', 'timestamp with time zone'
               )
             )
         )
          then 'null'::jsonb
        else entry.value
      end
    ),
    '{}'::jsonb
  )
    into v_result
    from pg_catalog.jsonb_each(p_payload) entry;

  return v_result;
end;
$function$;

create or replace function dynamic_crud_private.prepare_payload(
  p_payload jsonb,
  p_resource jsonb,
  p_action text,
  p_account_id uuid,
  p_validate_required boolean default true
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_result jsonb := coalesce(p_payload, '{}'::jsonb);
  v_action_config jsonb := p_resource->p_action;
  v_allowed jsonb := v_action_config->'allowed_fields';
  v_required jsonb := coalesce(v_action_config->'required_fields', '[]'::jsonb);
  v_field text;
  v_account_field text := nullif(p_resource->>'account_field', '');
begin
  if pg_catalog.jsonb_typeof(v_result) <> 'object' then
    raise exception 'data must be an object.' using errcode = '22023';
  end if;

  if v_allowed is not null and v_allowed <> 'null'::jsonb then
    select coalesce(pg_catalog.jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
      into v_result
      from pg_catalog.jsonb_each(v_result) entry
     where v_allowed ? entry.key;
  end if;

  if v_account_field is not null then
    if v_result ? v_account_field
       and nullif(v_result->>v_account_field, '') is not null
       and v_result->>v_account_field <> p_account_id::text then
      raise exception 'The requested data belongs to a different account set.' using errcode = '42501';
    end if;
    v_result := v_result || pg_catalog.jsonb_build_object(v_account_field, p_account_id);
  end if;

  -- Convert UUID empty strings before required-field validation as well as
  -- before the eventual INSERT/UPDATE cast.
  v_result := dynamic_crud_private.normalize_empty_strings_for_typed_columns(
    v_result, p_resource->>'table_name'
  );

  if p_validate_required then
    for v_field in select value #>> '{}' from pg_catalog.jsonb_array_elements(v_required)
    loop
      if not (v_result ? v_field)
         or v_result->v_field is null
         or v_result->v_field = 'null'::jsonb
         or v_result->>v_field = '' then
        raise exception 'Missing required field: %', v_field using errcode = '22023';
      end if;
    end loop;
  end if;

  return v_result;
end;
$function$;

create or replace function dynamic_crud_private.prepare_hooked_payload(
  p_payload jsonb,
  p_resource jsonb,
  p_action text,
  p_account_id uuid,
  p_context jsonb,
  p_validate_required boolean default true
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $function$
declare
  v_payload jsonb;
  v_phase text := case p_action
    when 'create' then 'beforeCreate'
    when 'update' then 'beforeUpdate'
    else 'beforeDelete'
  end;
begin
  -- Filter caller data first, let trusted hooks normalize aliases/defaults,
  -- then normalize UUID empty strings and validate/filter once more.
  v_payload := dynamic_crud_private.prepare_payload(
    p_payload, p_resource, p_action, p_account_id, false
  );
  v_payload := dynamic_crud_private.call_hooks(
    p_resource->'hooks', v_phase, v_payload, p_context
  );
  v_payload := dynamic_crud_private.normalize_empty_strings_for_typed_columns(
    v_payload, p_resource->>'table_name'
  );
  return dynamic_crud_private.prepare_payload(
    v_payload, p_resource, p_action, p_account_id, p_validate_required
  );
end;
$function$;

revoke all on function dynamic_crud_private.normalize_empty_strings_for_typed_columns(jsonb, text)
  from public, anon;
grant execute on function dynamic_crud_private.normalize_empty_strings_for_typed_columns(jsonb, text)
  to authenticated, service_role;

revoke all on function dynamic_crud_private.prepare_hooked_payload(jsonb, jsonb, text, uuid, jsonb, boolean)
  from public, anon;
grant execute on function dynamic_crud_private.prepare_hooked_payload(jsonb, jsonb, text, uuid, jsonb, boolean)
  to authenticated, service_role;
