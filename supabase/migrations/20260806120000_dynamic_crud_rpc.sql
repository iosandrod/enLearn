-- One transactional RPC for dynamic create/update operations.
--
-- The caller chooses the relation and TypeScript supplies the operation/configuration.
-- This is intentionally SECURITY INVOKER: dynamic SQL executes with the JWT role, so
-- table grants and RLS remain the database authorization boundary.

create schema if not exists dynamic_crud_private;
revoke all on schema dynamic_crud_private from public, anon;
grant usage on schema dynamic_crud_private to authenticated, service_role;

create or replace function dynamic_crud_private.assert_identifier(
  p_value text,
  p_name text default 'identifier'
)
returns text
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
begin
  if p_value is null or p_value !~ '^[A-Za-z_][A-Za-z0-9_]*$' then
    raise exception '% must be a valid identifier.', p_name using errcode = '22023';
  end if;
  return p_value;
end;
$function$;

create table if not exists public.dynamic_crud_resource_registry (
  resource_name text primary key,
  table_name text not null,
  config_hash text not null,
  config jsonb not null,
  updated_at timestamp with time zone not null default pg_catalog.now(),
  constraint dynamic_crud_resource_registry_resource_name_check
    check (resource_name ~ '^[A-Za-z_][A-Za-z0-9_]*$'),
  constraint dynamic_crud_resource_registry_config_object_check
    check (pg_catalog.jsonb_typeof(config) = 'object')
);
revoke all on table public.dynamic_crud_resource_registry from public, anon, authenticated;
grant select, insert, update, delete on table public.dynamic_crud_resource_registry to service_role;

create or replace function public.register_dynamic_crud_resource(
  p_resource_name text,
  p_table_name text,
  p_config_hash text,
  p_config jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
begin
  if session_user not in ('service_role', 'postgres', 'authenticator')
     and coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') <> 'service_role'
     and coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role' <> 'service_role' then
    raise exception 'Only service_role may register dynamic CRUD resources.' using errcode = '42501';
  end if;
  perform dynamic_crud_private.assert_identifier(p_resource_name, 'resource');
  perform dynamic_crud_private.quote_relation(p_table_name);
  if nullif(p_config_hash, '') is null then
    raise exception 'config hash is required.' using errcode = '22023';
  end if;
  if p_config is null or pg_catalog.jsonb_typeof(p_config) <> 'object' then
    raise exception 'resource config must be an object.' using errcode = '22023';
  end if;
  if coalesce(nullif(p_config->>'resource_name', ''), '') <> p_resource_name then
    raise exception 'Registered resource configuration does not match its resource/table.' using errcode = '42501';
  end if;
  if nullif(p_config->'resources'->p_resource_name->>'table_name', '') is null then
    raise exception 'Registered resource configuration does not match its resource/table.' using errcode = '42501';
  end if;
  if dynamic_crud_private.quote_relation(
       p_config->'resources'->p_resource_name->>'table_name'
     ) <> dynamic_crud_private.quote_relation(p_table_name) then
    raise exception 'Registered resource configuration does not match its resource/table.' using errcode = '42501';
  end if;

  insert into public.dynamic_crud_resource_registry (
    resource_name,
    table_name,
    config_hash,
    config,
    updated_at
  ) values (
    p_resource_name,
    p_table_name,
    p_config_hash,
    p_config,
    pg_catalog.now()
  )
  on conflict (resource_name) do update set
    table_name = excluded.table_name,
    config_hash = excluded.config_hash,
    config = excluded.config,
    updated_at = excluded.updated_at;
end;
$function$;

create or replace function public.get_dynamic_crud_resource_hash(
  p_resource_name text,
  p_table_name text
)
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select registry.config_hash
  from public.dynamic_crud_resource_registry registry
  where registry.resource_name = p_resource_name
    and dynamic_crud_private.quote_relation(registry.table_name) =
        dynamic_crud_private.quote_relation(p_table_name)
$function$;

create or replace function public.get_dynamic_crud_resource_config(
  p_resource_name text,
  p_table_name text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select registry.config
  from public.dynamic_crud_resource_registry registry
  where registry.resource_name = p_resource_name
    and dynamic_crud_private.quote_relation(registry.table_name) =
        dynamic_crud_private.quote_relation(p_table_name)
$function$;

create or replace function dynamic_crud_private.quote_relation(
  p_relation text
)
returns text
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_parts text[];
  v_schema text;
  v_table text;
begin
  v_parts := pg_catalog.string_to_array(p_relation, '.');
  if pg_catalog.array_length(v_parts, 1) = 1 then
    v_schema := 'public';
    v_table := v_parts[1];
  elsif pg_catalog.array_length(v_parts, 1) = 2 then
    v_schema := v_parts[1];
    v_table := v_parts[2];
  else
    raise exception 'tableName must be table or schema.table.' using errcode = '22023';
  end if;

  perform dynamic_crud_private.assert_identifier(v_schema, 'schema');
  perform dynamic_crud_private.assert_identifier(v_table, 'table');
  if pg_catalog.to_regclass(pg_catalog.format('%I.%I', v_schema, v_table)) is null then
    raise exception 'Relation %.% does not exist.', v_schema, v_table using errcode = '42P01';
  end if;
  return pg_catalog.format('%I.%I', v_schema, v_table);
end;
$function$;

drop function if exists dynamic_crud_private.assert_string_array(jsonb, text);

create or replace function dynamic_crud_private.assert_string_array(
  p_value jsonb,
  p_name text,
  p_identifiers boolean default true
)
returns void
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_item jsonb;
begin
  if p_value is null or p_value = 'null'::jsonb then
    return;
  end if;
  if pg_catalog.jsonb_typeof(p_value) <> 'array' then
    raise exception '% must be an array.', p_name using errcode = '22023';
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_value)
  loop
    if pg_catalog.jsonb_typeof(v_item) <> 'string' then
      raise exception '% must contain only strings.', p_name using errcode = '22023';
    end if;
    if p_identifiers then
      perform dynamic_crud_private.assert_identifier(v_item #>> '{}', p_name);
    elsif nullif(v_item #>> '{}', '') is null then
      raise exception '% must not contain empty strings.', p_name using errcode = '22023';
    end if;
  end loop;
end;
$function$;

create or replace function dynamic_crud_private.assert_object_fields_allowed(
  p_value jsonb,
  p_allowed jsonb,
  p_name text
)
returns void
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_field text;
begin
  if p_value is null or pg_catalog.jsonb_typeof(p_value) <> 'object' then
    raise exception '% must be an object.', p_name using errcode = '22023';
  end if;
  if p_allowed is null or p_allowed = 'null'::jsonb then
    return;
  end if;
  perform dynamic_crud_private.assert_string_array(p_allowed, p_name || ' allowed fields');
  for v_field in select key from pg_catalog.jsonb_each(p_value)
  loop
    perform dynamic_crud_private.assert_identifier(v_field, p_name || ' field');
    if not p_allowed ? v_field then
      raise exception '% field % is not allowed.', p_name, v_field using errcode = '42501';
    end if;
  end loop;
end;
$function$;

create or replace function dynamic_crud_private.assert_resource_config(
  p_resource_name text,
  p_resource jsonb,
  p_action text,
  p_account_id uuid
)
returns void
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_table_name text;
  v_action_config jsonb;
  v_account_field text;
  v_primary_key text;
begin
  perform dynamic_crud_private.assert_identifier(p_resource_name, 'resource');
  if p_resource is null or pg_catalog.jsonb_typeof(p_resource) <> 'object' then
    raise exception 'Missing resource configuration for %.', p_resource_name using errcode = '22023';
  end if;

  v_table_name := nullif(p_resource->>'table_name', '');
  perform dynamic_crud_private.quote_relation(v_table_name);
  v_primary_key := coalesce(nullif(p_resource->>'primary_key', ''), 'id');
  perform dynamic_crud_private.assert_identifier(v_primary_key, 'primaryKey');

  if p_action not in ('create', 'update', 'delete') then
    raise exception 'Unsupported dynamic CRUD action: %.', p_action using errcode = '22023';
  end if;
  v_action_config := p_resource->p_action;
  if v_action_config is null or v_action_config = 'null'::jsonb then
    raise exception 'Resource % does not allow %.', p_resource_name, p_action using errcode = '42501';
  end if;
  perform dynamic_crud_private.assert_string_array(v_action_config->'allowed_fields', p_action || '.allowedFields');
  perform dynamic_crud_private.assert_string_array(v_action_config->'required_fields', p_action || '.requiredFields');
  perform dynamic_crud_private.assert_string_array(v_action_config->'hook_input_fields', p_action || '.hookInputFields');

  v_account_field := nullif(p_resource->>'account_field', '');
  if v_account_field is not null then
    perform dynamic_crud_private.assert_identifier(v_account_field, 'accountField');
    if p_account_id is null then
      raise exception 'An active account set is required.' using errcode = '42501';
    end if;
    if pg_catalog.to_regprocedure('public.is_active_account_member(uuid)') is not null
       and current_user = 'authenticated'
       and not public.is_active_account_member(p_account_id) then
      raise exception 'The selected account set is not available to the current user.' using errcode = '42501';
    end if;
  end if;
end;
$function$;

create or replace function dynamic_crud_private.sanitize_hook_input(
  p_input jsonb,
  p_resource jsonb,
  p_action text
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_input jsonb := coalesce(p_input, '{}'::jsonb);
  v_allowed jsonb := coalesce(p_resource->p_action->'hook_input_fields', '[]'::jsonb);
  v_result jsonb;
begin
  if p_input is null or p_input = 'null'::jsonb then
    return null;
  end if;
  if pg_catalog.jsonb_typeof(v_input) <> 'object' then
    raise exception 'hook_input must be an object.' using errcode = '22023';
  end if;
  perform dynamic_crud_private.assert_object_fields_allowed(v_input, v_allowed, 'hook_input');
  select coalesce(pg_catalog.jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
    into v_result
    from pg_catalog.jsonb_each(v_input) entry
   where v_allowed ? entry.key;
  return coalesce(v_result, '{}'::jsonb);
end;
$function$;

drop function if exists dynamic_crud_private.prepare_payload(jsonb, jsonb, text, uuid);

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

create or replace function dynamic_crud_private.call_hooks(
  p_hooks jsonb,
  p_phase text,
  p_payload jsonb,
  p_context jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $function$
declare
  v_hook jsonb;
  v_function text;
  v_parts text[];
  v_result jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if p_hooks is null or pg_catalog.jsonb_typeof(p_hooks->p_phase) <> 'array' then
    return v_result;
  end if;

  for v_hook in select value from pg_catalog.jsonb_array_elements(p_hooks->p_phase)
  loop
    v_function := v_hook->>'function';
    v_parts := pg_catalog.string_to_array(v_function, '.');
    if pg_catalog.array_length(v_parts, 1) = 1 then
      v_parts := array['public', v_parts[1]];
    end if;
    if pg_catalog.array_length(v_parts, 1) <> 2 then
      raise exception 'Database hook must be function or schema.function.' using errcode = '22023';
    end if;
    perform dynamic_crud_private.assert_identifier(v_parts[1], 'hook schema');
    perform dynamic_crud_private.assert_identifier(v_parts[2], 'hook function');
    if pg_catalog.to_regprocedure(pg_catalog.format('%I.%I(jsonb,jsonb,jsonb)', v_parts[1], v_parts[2])) is null then
      raise exception 'Database hook % must have signature (jsonb, jsonb, jsonb).', v_function using errcode = '42883';
    end if;
    execute pg_catalog.format('select %I.%I($1, $2, $3)', v_parts[1], v_parts[2])
       into v_result
      using v_result, coalesce(v_hook->'args', '{}'::jsonb), coalesce(p_context, '{}'::jsonb);
    v_result := coalesce(v_result, '{}'::jsonb);
  end loop;
  return v_result;
end;
$function$;

drop function if exists dynamic_crud_private.prepare_hooked_payload(jsonb, jsonb, text, uuid, jsonb);

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
  -- Filter caller data first, let trusted hooks normalize aliases/defaults, then
  -- filter and validate again so hooks cannot widen the resource write surface.
  v_payload := dynamic_crud_private.prepare_payload(
    p_payload, p_resource, p_action, p_account_id, false
  );
  v_payload := dynamic_crud_private.call_hooks(
    p_resource->'hooks', v_phase, v_payload, p_context
  );
  return dynamic_crud_private.prepare_payload(
    v_payload, p_resource, p_action, p_account_id, p_validate_required
  );
end;
$function$;

create or replace function public.dynamic_crud_sync_role_permissions(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $function$
declare
  v_role_id uuid;
  v_hook_input jsonb := coalesce(context->'input', '{}'::jsonb);
  v_codes jsonb;
  v_missing_codes text[];
begin
  v_role_id := nullif(payload->>'id', '')::uuid;
  if v_role_id is null then
    raise exception 'Role permission hook requires saved role id.' using errcode = '22023';
  end if;

  if v_hook_input ? 'permission_codes' then
    v_codes := v_hook_input->'permission_codes';
  elsif v_hook_input ? 'permissionCodes' then
    v_codes := v_hook_input->'permissionCodes';
  else
    return payload;
  end if;
  perform dynamic_crud_private.assert_string_array(v_codes, 'permission_codes', false);

  if current_user = 'authenticated'
     and pg_catalog.to_regprocedure('public.has_app_permission(text)') is not null
     and not public.has_app_permission('admin.roles.manage') then
    raise exception 'Permission required: admin.roles.manage.' using errcode = '42501';
  end if;

  select pg_catalog.array_agg(requested.code order by requested.code)
    into v_missing_codes
    from (
      select distinct value #>> '{}' as code
      from pg_catalog.jsonb_array_elements(v_codes)
    ) requested
    left join public.admin_permissions permissions on permissions.code = requested.code
   where permissions.id is null;
  if coalesce(pg_catalog.array_length(v_missing_codes, 1), 0) > 0 then
    raise exception 'Unknown permission code(s): %.', pg_catalog.array_to_string(v_missing_codes, ', ')
      using errcode = '22023';
  end if;

  delete from public.admin_role_permissions mappings
   where mappings.role_id = v_role_id;

  insert into public.admin_role_permissions (role_id, permission_id)
  select v_role_id, permissions.id
    from public.admin_permissions permissions
   where permissions.code in (
     select value #>> '{}'
     from pg_catalog.jsonb_array_elements(v_codes)
   )
  on conflict (role_id, permission_id) do nothing;

  return payload || pg_catalog.jsonb_build_object(
    'permission_codes',
    coalesce((
      select pg_catalog.jsonb_agg(code order by code)
      from (
        select distinct value #>> '{}' as code
        from pg_catalog.jsonb_array_elements(v_codes)
      ) selected
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.dynamic_crud_normalize_lowcode_page(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_page_type text;
begin
  v_page_type := nullif(payload->>'page_type', '');
  if v_page_type is null and pg_catalog.jsonb_typeof(payload->'schema') = 'object' then
    v_page_type := nullif(payload->'schema'->>'pageType', '');
  end if;

  if v_page_type is null and context->>'action' = 'update' then
    return payload;
  end if;
  v_page_type := coalesce(v_page_type, 'custom');
  if v_page_type not in ('list', 'edit', 'detail', 'custom') then
    raise exception 'page_type must be list, edit, detail, or custom.' using errcode = '22023';
  end if;
  return payload || pg_catalog.jsonb_build_object('page_type', v_page_type);
end;
$function$;

create or replace function public.dynamic_crud_normalize_admin_route(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_input jsonb := coalesce(context->'input', '{}'::jsonb);
  v_metadata jsonb;
begin
  if not payload ? 'route_type' and v_input ? 'type' then
    payload := payload || pg_catalog.jsonb_build_object('route_type', v_input->'type');
  end if;
  if v_input ? 'metadata_json' or v_input ? 'metadata' then
    v_metadata := coalesce(v_input->'metadata_json', v_input->'metadata');
    if pg_catalog.jsonb_typeof(v_metadata) = 'string' then
      begin
        v_metadata := (v_metadata #>> '{}')::jsonb;
      exception when others then
        raise exception 'Invalid JSON payload.' using errcode = '22023';
      end;
    end if;
    if pg_catalog.jsonb_typeof(v_metadata) <> 'object' then v_metadata := '{}'::jsonb; end if;
    payload := payload || pg_catalog.jsonb_build_object('metadata', v_metadata);
  end if;
  return payload;
end;
$function$;

create or replace function public.dynamic_crud_normalize_admin_entity(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_input jsonb := coalesce(context->'input', '{}'::jsonb);
  v_schema jsonb;
begin
  if v_input ? 'schema_json' or v_input ? 'schema' then
    v_schema := coalesce(v_input->'schema_json', v_input->'schema');
    if pg_catalog.jsonb_typeof(v_schema) = 'string' then
      begin
        v_schema := (v_schema #>> '{}')::jsonb;
      exception when others then
        raise exception 'Invalid JSON payload.' using errcode = '22023';
      end;
    end if;
    if pg_catalog.jsonb_typeof(v_schema) <> 'object' then v_schema := '{}'::jsonb; end if;
    payload := payload || pg_catalog.jsonb_build_object('schema', v_schema);
  end if;
  if v_input ? 'querySql' then
    payload := payload || pg_catalog.jsonb_build_object('query_sql', nullif(v_input->>'querySql', ''));
  end if;
  return payload;
end;
$function$;

create or replace function public.dynamic_crud_normalize_option_source(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_input jsonb := coalesce(context->'input', '{}'::jsonb);
  v_source_type text := coalesce(
    nullif(payload->>'source_type', ''),
    nullif(v_input->>'sourceType', ''),
    'dict'
  );
  v_config jsonb := coalesce(
    v_input->'source_config_json',
    v_input->'source_config',
    v_input->'sourceConfig',
    payload->'source_config',
    '{}'::jsonb
  );
  v_status text := coalesce(nullif(payload->>'status', ''), 'active');
  v_relation text;
  v_function text;
  v_sql text;
begin
  if v_source_type not in ('dict', 'table', 'view', 'rpc', 'sql') then
    v_source_type := 'dict';
  end if;
  if pg_catalog.jsonb_typeof(v_config) = 'string' then
    begin
      v_config := (v_config #>> '{}')::jsonb;
    exception when others then
      raise exception 'Invalid JSON payload.' using errcode = '22023';
    end;
  end if;
  if pg_catalog.jsonb_typeof(v_config) <> 'object' then v_config := '{}'::jsonb; end if;

  if v_status = 'active' and v_source_type in ('table', 'view') then
    v_relation := coalesce(
      nullif(v_config->>case when v_source_type = 'view' then 'view' else 'table' end, ''),
      nullif(v_config->>'table', ''),
      nullif(v_config->>'relation', ''),
      nullif(v_config->>'from', '')
    );
    if v_relation is null then
      raise exception 'source_config.table is required.' using errcode = '22023';
    end if;
    perform dynamic_crud_private.quote_relation(v_relation);
    perform dynamic_crud_private.assert_identifier(
      coalesce(nullif(v_config->>'labelField', ''), nullif(v_config->>'label_field', ''), 'label'),
      'source_config.labelField'
    );
    perform dynamic_crud_private.assert_identifier(
      coalesce(nullif(v_config->>'valueField', ''), nullif(v_config->>'value_field', ''), 'value'),
      'source_config.valueField'
    );
  elsif v_status = 'active' and v_source_type = 'rpc' then
    v_function := coalesce(
      nullif(v_config->>'functionName', ''),
      nullif(v_config->>'function_name', ''),
      nullif(v_config->>'rpc', '')
    );
    perform dynamic_crud_private.assert_identifier(v_function, 'source_config.functionName');
  elsif v_status = 'active' and v_source_type = 'sql' then
    v_sql := coalesce(nullif(v_config->>'sql', ''), nullif(v_config->>'query', ''));
    if v_sql is null then
      raise exception 'source_config.sql is required for SQL option sources.' using errcode = '22023';
    end if;
  end if;

  return payload || pg_catalog.jsonb_build_object(
    'source_type', v_source_type,
    'source_config', v_config
  );
end;
$function$;

create or replace function public.dynamic_crud_normalize_option_item(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_input jsonb := coalesce(context->'input', '{}'::jsonb);
  v_source_code text := coalesce(
    nullif(payload->>'source_code', ''),
    nullif(v_input->>'sourceCode', '')
  );
  v_source_type text;
  v_metadata jsonb;
begin
  if v_source_code is null then
    raise exception 'Missing required field: source_code' using errcode = '22023';
  end if;
  if v_input ? 'sourceCode' then
    payload := payload || pg_catalog.jsonb_build_object('source_code', v_input->>'sourceCode');
  end if;
  if v_input ? 'parentValue' then
    payload := payload || pg_catalog.jsonb_build_object('parent_value', nullif(v_input->>'parentValue', ''));
  end if;
  if v_input ? 'metadata_json' or v_input ? 'metadata' then
    v_metadata := coalesce(v_input->'metadata_json', v_input->'metadata');
    if pg_catalog.jsonb_typeof(v_metadata) = 'string' then
      begin
        v_metadata := (v_metadata #>> '{}')::jsonb;
      exception when others then
        raise exception 'Invalid JSON payload.' using errcode = '22023';
      end;
    end if;
    if pg_catalog.jsonb_typeof(v_metadata) <> 'object' then v_metadata := '{}'::jsonb; end if;
    payload := payload || pg_catalog.jsonb_build_object('metadata', v_metadata);
  end if;

  select sources.source_type into v_source_type
  from public.system_option_sources sources
  where sources.code = v_source_code;
  if v_source_type is null then
    raise exception 'Option source not found.' using errcode = 'P0002';
  end if;
  if v_source_type <> 'dict' then
    raise exception 'Only dict option sources can save manual items.' using errcode = '22023';
  end if;
  return payload;
end;
$function$;

-- Workflow hooks are declared here (before the generic CRUD RPC) so the whole
-- migration can be applied atomically. They preserve the former TypeScript
-- normalizers while keeping validation in the database transaction.
create or replace function public.dynamic_crud_normalize_workflow_model(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_input jsonb := coalesce(context->'input', '{}'::jsonb);
  v_code text := nullif(pg_catalog.btrim(coalesce(payload->>'code', v_input->>'code')), '');
  v_name text := nullif(pg_catalog.btrim(coalesce(payload->>'name', v_input->>'name')), '');
  v_document_type text := nullif(coalesce(
    payload->>'document_type',
    v_input->>'document_type',
    v_input->>'documentType'
  ), '');
  v_schema jsonb := coalesce(
    payload->'draft_schema',
    v_input->'draft_schema',
    v_input->'draftSchema',
    v_input->'schema'
  );
  v_nodes jsonb;
  v_edges jsonb;
begin
  if v_code is not null then payload := payload || pg_catalog.jsonb_build_object('code', v_code); end if;
  if v_name is not null then payload := payload || pg_catalog.jsonb_build_object('name', v_name); end if;
  if payload ? 'document_type' or v_input ? 'document_type' or v_input ? 'documentType' then
    payload := payload || pg_catalog.jsonb_build_object('document_type', v_document_type);
  end if;

  if v_schema is not null then
    if pg_catalog.jsonb_typeof(v_schema) <> 'object' then
      raise exception 'schema must be an object.' using errcode = '22023';
    end if;
    if v_code is null or v_name is null then
      raise exception 'code and name are required when updating workflow schema.' using errcode = '22023';
    end if;
    v_schema := pg_catalog.jsonb_build_object(
      'schemaVersion', coalesce(v_schema->'schemaVersion', '1'::jsonb)
    ) || v_schema || pg_catalog.jsonb_build_object('code', v_code, 'name', v_name);
    if v_document_type is not null then
      v_schema := v_schema || pg_catalog.jsonb_build_object('documentType', v_document_type);
    end if;
    v_nodes := coalesce(v_schema->'nodes', '[]'::jsonb);
    v_edges := coalesce(v_schema->'edges', '[]'::jsonb);
    if pg_catalog.jsonb_typeof(v_nodes) <> 'array' or pg_catalog.jsonb_array_length(v_nodes) = 0 then
      raise exception 'Workflow schema requires nodes.' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_typeof(v_edges) <> 'array' or pg_catalog.jsonb_array_length(v_edges) = 0 then
      raise exception 'Workflow schema requires edges.' using errcode = '22023';
    end if;
    payload := payload || pg_catalog.jsonb_build_object('draft_schema', v_schema);
  end if;
  return payload;
end;
$function$;

create or replace function public.dynamic_crud_normalize_workflow_job(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_input jsonb := coalesce(context->'input', '{}'::jsonb);
  v_type text := nullif(coalesce(payload->>'type', v_input->>'type'), '');
  v_payload jsonb := coalesce(payload->'payload', v_input->'payload', '{}'::jsonb);
  v_interval integer;
  v_interval_source jsonb;
  v_cron text := nullif(coalesce(
    payload->>'cron_expr', v_input->>'cron_expr', v_input->>'cronExpr'
  ), '');
  v_trigger_task text := nullif(coalesce(
    payload->>'trigger_task_id', v_input->>'trigger_task_id', v_input->>'triggerTaskId'
  ), '');
  v_retry_policy jsonb := coalesce(
    payload->'retry_policy', v_input->'retry_policy', v_input->'retryPolicy'
  );
  v_timezone text := nullif(coalesce(payload->>'timezone', v_input->>'timezone'), '');
  v_concurrency_key text := nullif(coalesce(
    payload->>'concurrency_key', v_input->>'concurrency_key', v_input->>'concurrencyKey'
  ), '');
  v_timeout integer;
begin
  if v_type is not null
     and v_type not in ('once', 'cron', 'interval', 'manual', 'service_task') then
    raise exception 'Unsupported workflow job type: %.', v_type using errcode = '22023';
  end if;
  if nullif(pg_catalog.btrim(coalesce(payload->>'code', v_input->>'code')), '') is not null then
    payload := payload || pg_catalog.jsonb_build_object(
      'code', pg_catalog.btrim(coalesce(payload->>'code', v_input->>'code'))
    );
  end if;
  if nullif(pg_catalog.btrim(coalesce(payload->>'name', v_input->>'name')), '') is not null then
    payload := payload || pg_catalog.jsonb_build_object(
      'name', pg_catalog.btrim(coalesce(payload->>'name', v_input->>'name'))
    );
  end if;
  if v_type is not null then
    payload := payload || pg_catalog.jsonb_build_object('type', v_type);
  end if;
  if context->>'action' = 'create' then
    if nullif(pg_catalog.btrim(coalesce(payload->>'code', v_input->>'code')), '') is null then
      raise exception 'Missing required field: code' using errcode = '22023';
    end if;
    if nullif(pg_catalog.btrim(coalesce(payload->>'name', v_input->>'name')), '') is null then
      raise exception 'Missing required field: name' using errcode = '22023';
    end if;
    if v_type is null then
      raise exception 'Missing required field: type' using errcode = '22023';
    end if;
  elsif (payload ? 'name' or v_input ? 'name')
        and nullif(pg_catalog.btrim(coalesce(payload->>'name', v_input->>'name')), '') is null then
    raise exception 'Missing required field: name' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(v_payload) <> 'object' then
    raise exception 'payload must be an object.' using errcode = '22023';
  end if;

  v_interval_source := coalesce(
    v_input->'intervalSeconds',
    v_input->'interval_seconds',
    v_payload->'intervalSeconds'
  );
  if v_interval_source is not null and v_interval_source <> 'null'::jsonb then
    begin
      v_interval := (v_interval_source #>> '{}')::integer;
    exception when others then
      raise exception 'intervalSeconds must be a positive integer.' using errcode = '22023';
    end;
  end if;
  if v_type = 'interval' then
    v_interval := coalesce(v_interval, 60);
  end if;
  if v_interval is not null then
    if v_interval <= 0 or v_interval % 60 <> 0 or v_interval / 60 > 59 then
      raise exception 'Trigger.dev interval jobs must use a whole number of minutes from 1 to 59.' using errcode = '22023';
    end if;
    v_payload := v_payload || pg_catalog.jsonb_build_object('intervalSeconds', v_interval);
  end if;
  if context->>'action' = 'create' or payload ? 'payload'
     or v_input ? 'payload' or v_interval_source is not null then
    payload := payload || pg_catalog.jsonb_build_object('payload', v_payload);
  end if;

  if v_type = 'cron' and v_cron is null then
    raise exception 'Cron job requires cronExpr.' using errcode = '22023';
  end if;
  if payload ? 'cron_expr' or v_input ? 'cron_expr' or v_input ? 'cronExpr' or v_type = 'cron' then
    payload := payload || pg_catalog.jsonb_build_object('cron_expr', v_cron);
  end if;
  if context->>'action' = 'create' or payload ? 'trigger_task_id'
     or v_input ? 'trigger_task_id' or v_input ? 'triggerTaskId' then
    payload := payload || pg_catalog.jsonb_build_object(
      'trigger_task_id',
      coalesce(
        v_trigger_task,
        case when v_type = 'service_task' then 'workflow.service.execute' else 'workflow.job.run' end
      )
    );
  end if;
  if context->>'action' = 'create' or payload ? 'timezone' or v_input ? 'timezone' then
    payload := payload || pg_catalog.jsonb_build_object(
      'timezone', coalesce(v_timezone, 'Asia/Shanghai')
    );
  end if;
  if v_retry_policy is not null then
    if pg_catalog.jsonb_typeof(v_retry_policy) <> 'object' then
      raise exception 'retryPolicy must be an object.' using errcode = '22023';
    end if;
    payload := payload || pg_catalog.jsonb_build_object('retry_policy', v_retry_policy);
  end if;
  if payload ? 'timeout_seconds' or v_input ? 'timeout_seconds' or v_input ? 'timeoutSeconds' then
    if coalesce(payload->'timeout_seconds', v_input->'timeout_seconds', v_input->'timeoutSeconds') = 'null'::jsonb
       or nullif(coalesce(payload->>'timeout_seconds', v_input->>'timeout_seconds', v_input->>'timeoutSeconds'), '') is null then
      payload := payload || pg_catalog.jsonb_build_object('timeout_seconds', null);
    else
    begin
      v_timeout := coalesce(
        payload->>'timeout_seconds', v_input->>'timeout_seconds', v_input->>'timeoutSeconds'
      )::integer;
    exception when others then
      raise exception 'timeoutSeconds must be a positive integer.' using errcode = '22023';
    end;
    if v_timeout <= 0 then
      raise exception 'timeoutSeconds must be a positive integer.' using errcode = '22023';
    end if;
      payload := payload || pg_catalog.jsonb_build_object('timeout_seconds', v_timeout);
    end if;
  end if;
  if payload ? 'concurrency_key' or v_input ? 'concurrency_key' or v_input ? 'concurrencyKey' then
    payload := payload || pg_catalog.jsonb_build_object('concurrency_key', v_concurrency_key);
  end if;
  return payload;
end;
$function$;

create or replace function public.dynamic_crud_normalize_chat_conversation(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_type text := coalesce(nullif(payload->>'type', ''), 'group');
begin
  if v_type not in ('direct', 'group', 'system') then
    v_type := 'group';
  end if;
  return payload || pg_catalog.jsonb_build_object(
    'type', v_type,
    'metadata', case
      when pg_catalog.jsonb_typeof(payload->'metadata') = 'object' then payload->'metadata'
      else '{}'::jsonb
    end
  );
end;
$function$;

create or replace function public.dynamic_crud_normalize_chat_message(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_input jsonb := coalesce(context->'input', '{}'::jsonb);
  v_type text := coalesce(
    nullif(payload->>'message_type', ''),
    nullif(v_input->>'messageType', ''),
    nullif(v_input->>'message_type', ''),
    'text'
  );
  v_attachments jsonb := coalesce(
    payload->'attachment_ids',
    v_input->'attachmentIds',
    v_input->'attachment_ids',
    '[]'::jsonb
  );
  v_reply_to jsonb := coalesce(
    payload->'reply_to_id',
    v_input->'replyToId',
    v_input->'reply_to_id',
    'null'::jsonb
  );
begin
  if v_type not in ('text', 'image', 'file', 'system') then
    v_type := 'text';
  end if;
  if pg_catalog.jsonb_typeof(v_attachments) <> 'array' then
    v_attachments := '[]'::jsonb;
  end if;
  return payload || pg_catalog.jsonb_build_object(
    'message_type', v_type,
    'attachment_ids', v_attachments,
    'reply_to_id', v_reply_to,
    'metadata', case
      when pg_catalog.jsonb_typeof(payload->'metadata') = 'object' then payload->'metadata'
      else '{}'::jsonb
    end
  );
end;
$function$;

create or replace function public.dynamic_crud_normalize_chat_message_update(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $function$
declare
  v_input jsonb := coalesce(context->'input', '{}'::jsonb);
begin
  if coalesce((v_input->>'edit')::boolean, false)
     or coalesce((v_input->>'edited')::boolean, false) then
    payload := payload || pg_catalog.jsonb_build_object(
      'status', 'edited',
      'edited_at', coalesce(payload->'edited_at', pg_catalog.to_jsonb(pg_catalog.now()))
    );
  end if;
  if coalesce((v_input->>'delete')::boolean, false)
     or coalesce((v_input->>'deleted')::boolean, false) then
    payload := payload || pg_catalog.jsonb_build_object(
      'content', '',
      'status', 'deleted',
      'deleted_at', coalesce(payload->'deleted_at', pg_catalog.to_jsonb(pg_catalog.now()))
    );
  end if;
  return payload;
end;
$function$;

create or replace function public.dynamic_crud_assert_account_user(
  p_account_id uuid,
  p_user_id uuid,
  p_message text
)
returns void
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $function$
begin
  if p_user_id is null then return; end if;
  if p_account_id is null or not exists (
    select 1
    from basejump.account_user memberships
    join basejump.accounts accounts on accounts.id = memberships.account_id
    where memberships.account_id = p_account_id
      and memberships.user_id = p_user_id
      and accounts.personal_account = false
      and accounts.status = 'active'
  ) then
    raise exception '%', p_message using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.dynamic_crud_validate_chat_conversation_member(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_account_id uuid := nullif(context->>'account_id', '')::uuid;
  v_user_id uuid := nullif(payload->>'user_id', '')::uuid;
begin
  if current_user in ('service_role', 'postgres')
     and nullif(context->>'user_id', '') is null then
    raise exception 'Authenticated user context is required for chat membership writes.'
      using errcode = '42501';
  end if;
  perform public.dynamic_crud_assert_account_user(
    v_account_id,
    v_user_id,
    'Every chat participant must belong to the active account set.'
  );
  return payload;
end;
$function$;

create or replace function public.dynamic_crud_validate_account_recipient(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_account_id uuid := nullif(context->>'account_id', '')::uuid;
  v_recipient_id uuid := nullif(coalesce(
    payload->>'recipient_id',
    context->'input'->>'recipientId'
  ), '')::uuid;
begin
  perform public.dynamic_crud_assert_account_user(
    v_account_id,
    v_recipient_id,
    'The notification recipient must belong to the active account set.'
  );
  return payload;
end;
$function$;

create or replace function public.dynamic_crud_normalize_notification_message(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_input jsonb := coalesce(context->'input', '{}'::jsonb);
  v_category text := coalesce(nullif(payload->>'category', ''), 'system');
  v_priority text := coalesce(nullif(payload->>'priority', ''), 'normal');
begin
  if v_category not in ('system', 'approval', 'mention', 'security', 'business') then
    v_category := 'system';
  end if;
  if v_priority not in ('low', 'normal', 'high', 'urgent') then
    v_priority := 'normal';
  end if;
  payload := payload || pg_catalog.jsonb_build_object(
    'category', v_category,
    'channel', 'inbox',
    'priority', v_priority,
    'metadata', case
      when pg_catalog.jsonb_typeof(payload->'metadata') = 'object' then payload->'metadata'
      else '{}'::jsonb
    end
  );
  if v_input ? 'linkUrl' then
    payload := payload || pg_catalog.jsonb_build_object('link_url', nullif(v_input->>'linkUrl', ''));
  end if;
  if v_input ? 'sourceType' then
    payload := payload || pg_catalog.jsonb_build_object('source_type', nullif(v_input->>'sourceType', ''));
  end if;
  if v_input ? 'sourceId' then
    payload := payload || pg_catalog.jsonb_build_object('source_id', nullif(v_input->>'sourceId', ''));
  end if;
  return public.dynamic_crud_validate_account_recipient(payload, args, context);
end;
$function$;

create or replace function public.dynamic_crud_normalize_notification_message_update(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $function$
declare
  v_input jsonb := coalesce(context->'input', '{}'::jsonb);
  v_now jsonb := pg_catalog.to_jsonb(pg_catalog.now());
begin
  if coalesce((v_input->>'markRead')::boolean, false)
     or coalesce((v_input->>'mark_read')::boolean, false) then
    payload := payload || pg_catalog.jsonb_build_object(
      'read_at', coalesce(payload->'read_at', v_now)
    );
  end if;
  if coalesce((v_input->>'archive')::boolean, false)
     or coalesce((v_input->>'archived')::boolean, false) then
    payload := payload || pg_catalog.jsonb_build_object(
      'read_at', coalesce(payload->'read_at', v_now),
      'archived_at', coalesce(payload->'archived_at', v_now)
    );
  end if;
  if v_input ? 'readAt' then
    payload := payload || pg_catalog.jsonb_build_object('read_at', nullif(v_input->>'readAt', ''));
  end if;
  if v_input ? 'archivedAt' then
    payload := payload || pg_catalog.jsonb_build_object('archived_at', nullif(v_input->>'archivedAt', ''));
  end if;
  return payload;
end;
$function$;

create or replace function public.dynamic_crud_normalize_notification_preference(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_input jsonb := coalesce(context->'input', '{}'::jsonb);
  v_actor_id uuid := nullif(context->>'user_id', '')::uuid;
  v_target_id uuid := nullif(coalesce(
    v_input->>'userId',
    v_input->>'user_id',
    payload->>'user_id',
    context->>'user_id'
  ), '')::uuid;
  v_category text := nullif(coalesce(payload->>'category', v_input->>'category'), '');
  v_quiet_hours jsonb;
begin
  if v_target_id is null then
    raise exception 'user_id is required.' using errcode = '22023';
  end if;
  if v_actor_id is not null and v_target_id <> v_actor_id
     and pg_catalog.to_regprocedure('public.has_app_permission(text)') is not null
     and not public.has_app_permission('notification.messages.manage') then
    raise exception 'Permission required: notification.messages.manage.' using errcode = '42501';
  end if;
  perform public.dynamic_crud_assert_account_user(
    nullif(context->>'account_id', '')::uuid,
    v_target_id,
    'The notification preference user must belong to the active account set.'
  );
  if v_category is not null
     and v_category not in ('system', 'approval', 'mention', 'security', 'business') then
    v_category := null;
  end if;
  if context->>'action' = 'create' and v_category is null then
    raise exception 'category is required.' using errcode = '22023';
  end if;
  if context->>'action' = 'create' then
    payload := payload || pg_catalog.jsonb_build_object('user_id', v_target_id);
  end if;
  if v_category is not null then
    payload := payload || pg_catalog.jsonb_build_object('category', v_category);
  end if;
  if v_input ? 'inboxEnabled' then
    payload := payload || pg_catalog.jsonb_build_object('inbox_enabled', (v_input->>'inboxEnabled')::boolean);
  end if;
  if v_input ? 'emailEnabled' then
    payload := payload || pg_catalog.jsonb_build_object('email_enabled', (v_input->>'emailEnabled')::boolean);
  end if;
  if v_input ? 'smsEnabled' then
    payload := payload || pg_catalog.jsonb_build_object('sms_enabled', (v_input->>'smsEnabled')::boolean);
  end if;
  if v_input ? 'quietHours' or v_input ? 'quiet_hours' then
    v_quiet_hours := coalesce(v_input->'quietHours', v_input->'quiet_hours');
    if pg_catalog.jsonb_typeof(v_quiet_hours) <> 'object' then v_quiet_hours := '{}'::jsonb; end if;
    payload := payload || pg_catalog.jsonb_build_object('quiet_hours', v_quiet_hours);
  end if;
  return payload;
end;
$function$;

create or replace function public.dynamic_crud_normalize_notification_delivery(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
begin
  if coalesce((context->'input'->>'retry')::boolean, false) then
    return payload || pg_catalog.jsonb_build_object(
      'status', 'pending',
      'error_message', null,
      'next_retry_at', null
    );
  end if;
  return payload;
end;
$function$;

create or replace function public.dynamic_crud_validate_notification_event(
  payload jsonb,
  args jsonb,
  context jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_account_id uuid := nullif(context->>'account_id', '')::uuid;
  v_event_payload jsonb := case
    when pg_catalog.jsonb_typeof(payload->'payload') = 'object' then payload->'payload'
    else '{}'::jsonb
  end;
  v_user_id text;
begin
  for v_user_id in
    select distinct value #>> '{}'
    from pg_catalog.jsonb_array_elements(
      coalesce(v_event_payload->'recipientIds', '[]'::jsonb)
      || coalesce(v_event_payload->'recipient_ids', '[]'::jsonb)
      || coalesce(v_event_payload->'userIds', '[]'::jsonb)
      || coalesce(v_event_payload->'user_ids', '[]'::jsonb)
    )
  loop
    perform public.dynamic_crud_assert_account_user(
      v_account_id,
      nullif(v_user_id, '')::uuid,
      'Every notification recipient must belong to the active account set.'
    );
  end loop;
  return payload;
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
  v_columns text;
  v_values text;
  v_result jsonb;
begin
  if p_payload = '{}'::jsonb then
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
    from pg_catalog.jsonb_each(p_payload);

  execute 'with inserted as (insert into ' || v_relation || ' (' || v_columns || ') select ' || v_values ||
          ' returning *) select to_jsonb(inserted) from inserted'
    into v_result
    using p_payload;
  return v_result;
end;
$function$;

create or replace function dynamic_crud_private.resolve_references(
  p_value jsonb,
  p_saved jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_key text;
  v_item jsonb;
  v_result jsonb;
  v_path text[];
begin
  if p_value is null then return null; end if;
  if pg_catalog.jsonb_typeof(p_value) = 'object' and p_value ? '$ref' then
    if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_value)) <> 1
       or p_value->>'$ref' !~ '^saved(\.[A-Za-z_][A-Za-z0-9_]*)+$' then
      raise exception 'Invalid saved reference.' using errcode = '22023';
    end if;
    v_path := pg_catalog.string_to_array(p_value->>'$ref', '.');
    v_path := v_path[2:pg_catalog.array_length(v_path, 1)];
    v_result := p_saved #> v_path;
    if v_result is null then
      raise exception 'Could not resolve afterSave reference: %.', p_value->>'$ref' using errcode = '22023';
    end if;
    return v_result;
  elsif pg_catalog.jsonb_typeof(p_value) = 'object' then
    v_result := '{}'::jsonb;
    for v_key, v_item in select key, value from pg_catalog.jsonb_each(p_value)
    loop
      v_result := v_result || pg_catalog.jsonb_build_object(
        v_key,
        dynamic_crud_private.resolve_references(v_item, p_saved)
      );
    end loop;
    return v_result;
  elsif pg_catalog.jsonb_typeof(p_value) = 'array' then
    select coalesce(pg_catalog.jsonb_agg(dynamic_crud_private.resolve_references(value, p_saved)), '[]'::jsonb)
      into v_result from pg_catalog.jsonb_array_elements(p_value);
    return v_result;
  end if;
  return p_value;
end;
$function$;

create or replace function dynamic_crud_private.build_filter_clause(
  p_filters jsonb,
  p_relation text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_field text;
  v_value jsonb;
  v_operand jsonb;
  v_op text;
  v_parts text[] := array[]::text[];
  v_values jsonb := '[]'::jsonb;
  v_index integer := 0;
  v_array jsonb;
  v_relation text := dynamic_crud_private.quote_relation(p_relation);
begin
  if p_filters is null or pg_catalog.jsonb_typeof(p_filters) <> 'object' then
    return pg_catalog.jsonb_build_object('sql', '', 'values', v_values);
  end if;

  for v_field, v_value in select key, value from pg_catalog.jsonb_each(p_filters)
  loop
    perform dynamic_crud_private.assert_identifier(v_field, 'filter field');
    if v_value = 'null'::jsonb then
      v_parts := pg_catalog.array_append(v_parts, pg_catalog.format('%I is null', v_field));
    elsif pg_catalog.jsonb_typeof(v_value) = 'array' then
      if pg_catalog.jsonb_array_length(v_value) > 0 then
        v_parts := pg_catalog.array_append(v_parts, pg_catalog.format(
          'exists (select 1 from pg_catalog.jsonb_array_elements($1->%s) x where to_jsonb(%I) = x)',
          v_index,
          v_field
        ));
        v_values := v_values || pg_catalog.jsonb_build_array(v_value);
        v_index := v_index + 1;
      end if;
    elsif pg_catalog.jsonb_typeof(v_value) = 'object' and v_value ? 'op' then
      v_op := pg_catalog.lower(pg_catalog.replace(v_value->>'op', '_', ''));
      v_operand := v_value->'value';
      if v_op = 'isnull' then
        v_parts := pg_catalog.array_append(v_parts, pg_catalog.format('%I is null', v_field));
      elsif v_op = 'isnotnull' then
        v_parts := pg_catalog.array_append(v_parts, pg_catalog.format('%I is not null', v_field));
      elsif v_op in ('in', 'notin') and pg_catalog.jsonb_typeof(v_operand) = 'array' then
        v_parts := pg_catalog.array_append(v_parts, pg_catalog.format(
          '%s exists (select 1 from pg_catalog.jsonb_array_elements($1->%s) x where to_jsonb(%I) = x)',
          case when v_op = 'notin' then 'not' else '' end,
          v_index,
          v_field
        ));
        v_values := v_values || pg_catalog.jsonb_build_array(v_operand);
        v_index := v_index + 1;
      elsif v_op = 'between' and pg_catalog.jsonb_typeof(v_operand) = 'array' and pg_catalog.jsonb_array_length(v_operand) >= 2 then
        v_parts := pg_catalog.array_append(v_parts, pg_catalog.format(
          '%I >= (jsonb_populate_record(null::%s, pg_catalog.jsonb_build_object(%L, $1->%s))).%I '
          || 'and %I <= (jsonb_populate_record(null::%s, pg_catalog.jsonb_build_object(%L, $1->%s))).%I',
          v_field, v_relation, v_field, v_index, v_field,
          v_field, v_relation, v_field, v_index + 1, v_field
        ));
        v_values := v_values || pg_catalog.jsonb_build_array(v_operand->0, v_operand->1);
        v_index := v_index + 2;
      else
        if v_op not in ('eq','ne','gt','gte','lt','lte','like','ilike','notlike','notilike','startswith','endswith','contains','containedby','overlaps') then
          raise exception 'Unsupported filter operator: %.', v_value->>'op' using errcode = '22023';
        end if;
        if v_op in ('like','ilike','notlike','notilike','startswith','endswith') then
          v_operand := pg_catalog.to_jsonb(
            case
              when v_op = 'startswith' then (v_operand #>> '{}') || '%'
              when v_op = 'endswith' then '%' || (v_operand #>> '{}')
              else '%' || (v_operand #>> '{}') || '%'
            end
          );
        end if;
        v_parts := pg_catalog.array_append(v_parts, pg_catalog.format(
          '%I %s (jsonb_populate_record(null::%s, pg_catalog.jsonb_build_object(%L, $1->%s))).%I',
          v_field,
          case v_op
            when 'eq' then '=' when 'ne' then '<>' when 'gt' then '>' when 'gte' then '>='
            when 'lt' then '<' when 'lte' then '<=' when 'like' then 'like'
            when 'ilike' then 'ilike' when 'notlike' then 'not like'
            when 'notilike' then 'not ilike' when 'startswith' then 'like'
            when 'endswith' then 'like' when 'contains' then '@>'
            when 'containedby' then '<@' when 'overlaps' then '&&' end,
          v_relation,
          v_field,
          v_index,
          v_field
        ));
        v_values := v_values || pg_catalog.jsonb_build_array(v_operand);
        v_index := v_index + 1;
      end if;
    else
      v_parts := pg_catalog.array_append(v_parts, pg_catalog.format(
        '%I = (jsonb_populate_record(null::%s, pg_catalog.jsonb_build_object(%L, $1->%s))).%I',
        v_field, v_relation, v_field, v_index, v_field
      ));
      v_values := v_values || pg_catalog.jsonb_build_array(v_value);
      v_index := v_index + 1;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'sql', pg_catalog.array_to_string(v_parts, ' and '),
    'values', v_values
  );
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
  v_set text;
  v_filter jsonb;
  v_where text;
  v_values jsonb;
  v_rows jsonb;
begin
  if p_payload is null or p_payload = '{}'::jsonb then
    raise exception 'No writable update fields were provided.' using errcode = '22023';
  end if;
  select pg_catalog.string_agg(
           pg_catalog.format('%I = (jsonb_populate_record(null::%s, $2)).%I', key, v_relation, key),
           ', ' order by key
         )
    into v_set from pg_catalog.jsonb_each(p_payload);
  v_filter := dynamic_crud_private.build_filter_clause(p_filters, p_table_name);
  v_where := v_filter->>'sql';
  v_values := v_filter->'values';
  if coalesce(v_where, '') = '' then
    raise exception 'At least one effective update condition is required.' using errcode = '22023';
  end if;

  execute 'with changed as (update ' || v_relation || ' set ' || v_set || ' where ' || v_where ||
          ' returning *) select coalesce(pg_catalog.jsonb_agg(to_jsonb(changed)), ''[]''::jsonb) from changed'
    into v_rows
    using v_values, p_payload;
  return coalesce(v_rows, '[]'::jsonb);
end;
$function$;

create or replace function dynamic_crud_private.delete_rows(
  p_table_name text,
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
  v_filter jsonb;
  v_where text;
  v_values jsonb;
  v_rows jsonb;
begin
  v_filter := dynamic_crud_private.build_filter_clause(p_filters, p_table_name);
  v_where := v_filter->>'sql';
  v_values := v_filter->'values';
  if coalesce(v_where, '') = '' then
    raise exception 'At least one effective delete condition is required.' using errcode = '22023';
  end if;

  execute 'with changed as (delete from ' || v_relation || ' where ' || v_where ||
          ' returning *) select coalesce(pg_catalog.jsonb_agg(to_jsonb(changed)), ''[]''::jsonb) from changed'
    into v_rows
    using v_values;
  return coalesce(v_rows, '[]'::jsonb);
end;
$function$;

create or replace function dynamic_crud_private.replace_details(
  p_parent jsonb,
  p_details jsonb,
  p_config jsonb,
  p_context jsonb,
  p_account_id uuid
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $function$
declare
  v_detail jsonb;
  v_relation_config jsonb;
  v_resource_name text;
  v_resource jsonb;
  v_foreign_key text;
  v_parent_key text;
  v_parent_value jsonb;
  v_inherit text;
  v_row jsonb;
  v_payload jsonb;
  v_filters jsonb;
  v_filter jsonb;
begin
  if p_details is null or pg_catalog.jsonb_typeof(p_details) <> 'array' then return; end if;
  for v_detail in select value from pg_catalog.jsonb_array_elements(p_details)
  loop
    v_resource_name := v_detail->>'resource';
    v_relation_config := p_config->'detail_relations'->v_resource_name;
    if v_relation_config is null then
      raise exception 'Detail resource % is not configured.', v_resource_name using errcode = '42501';
    end if;
    if coalesce(v_relation_config->>'update_mode', '') <> 'replace' then
      raise exception 'Detail resource % does not allow replace updates.', v_resource_name using errcode = '42501';
    end if;
  v_resource := p_config->'resources'->(v_relation_config->>'resource');
    perform dynamic_crud_private.assert_resource_config(v_relation_config->>'resource', v_resource, 'create', p_account_id);
    v_foreign_key := v_relation_config->>'foreign_key';
    v_parent_key := v_relation_config->>'parent_key';
    perform dynamic_crud_private.assert_identifier(v_foreign_key, 'detail foreignKey');
    perform dynamic_crud_private.assert_identifier(v_parent_key, 'detail parentKey');
    if nullif(v_detail->>'foreign_key', '') is not null
       and v_detail->>'foreign_key' <> v_foreign_key then
      raise exception 'Detail resource % foreignKey does not match its configuration.', v_resource_name using errcode = '42501';
    end if;
    if nullif(v_detail->>'parent_key', '') is not null
       and v_detail->>'parent_key' <> v_parent_key then
      raise exception 'Detail resource % parentKey does not match its configuration.', v_resource_name using errcode = '42501';
    end if;
    if v_detail ? 'inherit_fields'
       and coalesce(v_detail->'inherit_fields', '[]'::jsonb) <> coalesce(v_relation_config->'inherit_fields', '[]'::jsonb) then
      raise exception 'Detail resource % inheritFields do not match its configuration.', v_resource_name using errcode = '42501';
    end if;
    v_parent_value := p_parent->v_parent_key;
    if v_parent_value is null then
      raise exception 'Parent field % is required for detail resource %.', v_parent_key, v_resource_name using errcode = '22023';
    end if;
    v_filters := pg_catalog.jsonb_build_object(v_foreign_key, v_parent_value);
    if nullif(v_resource->>'account_field', '') is not null then
      v_filters := v_filters || pg_catalog.jsonb_build_object(v_resource->>'account_field', p_account_id);
    end if;
    for v_inherit in select value #>> '{}' from pg_catalog.jsonb_array_elements(coalesce(v_relation_config->'inherit_fields','[]'::jsonb))
    loop
      if p_parent->v_inherit is null then
        raise exception 'Parent field % is required for detail resource %.', v_inherit, v_resource_name using errcode = '22023';
      end if;
      v_filters := v_filters || pg_catalog.jsonb_build_object(v_inherit, p_parent->v_inherit);
    end loop;
    v_filter := dynamic_crud_private.build_filter_clause(v_filters, v_resource->>'table_name');
    execute 'delete from ' || dynamic_crud_private.quote_relation(v_resource->>'table_name') ||
            ' where ' || (v_filter->>'sql') using v_filter->'values';

    for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_detail->'rows','[]'::jsonb))
    loop
      v_payload := v_row || pg_catalog.jsonb_build_object(v_foreign_key, v_parent_value);
      for v_inherit in select value #>> '{}' from pg_catalog.jsonb_array_elements(coalesce(v_relation_config->'inherit_fields','[]'::jsonb))
      loop
        v_payload := v_payload || pg_catalog.jsonb_build_object(v_inherit, p_parent->v_inherit);
      end loop;
      v_payload := dynamic_crud_private.prepare_hooked_payload(
        v_payload, v_resource, 'create', p_account_id, p_context
      );
      v_payload := dynamic_crud_private.insert_row(v_resource->>'table_name', v_payload);
      perform dynamic_crud_private.call_hooks(v_resource->'hooks', 'afterCreate', v_payload, p_context);
    end loop;
  end loop;
end;
$function$;

create or replace function dynamic_crud_private.insert_details(
  p_parent jsonb,
  p_details jsonb,
  p_config jsonb,
  p_context jsonb,
  p_account_id uuid
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $function$
declare
  v_detail jsonb;
  v_relation_config jsonb;
  v_resource_name text;
  v_resource jsonb;
  v_foreign_key text;
  v_parent_key text;
  v_parent_value jsonb;
  v_inherit text;
  v_row jsonb;
  v_payload jsonb;
begin
  if p_details is null or pg_catalog.jsonb_typeof(p_details) <> 'array' then return; end if;
  for v_detail in select value from pg_catalog.jsonb_array_elements(p_details)
  loop
    v_resource_name := v_detail->>'resource';
    v_relation_config := p_config->'detail_relations'->v_resource_name;
    if v_relation_config is null then
      raise exception 'Detail resource % is not configured.', v_resource_name using errcode = '42501';
    end if;
    v_resource := p_config->'resources'->(v_relation_config->>'resource');
    perform dynamic_crud_private.assert_resource_config(v_relation_config->>'resource', v_resource, 'create', p_account_id);
    v_foreign_key := v_relation_config->>'foreign_key';
    v_parent_key := v_relation_config->>'parent_key';
    perform dynamic_crud_private.assert_identifier(v_foreign_key, 'detail foreignKey');
    perform dynamic_crud_private.assert_identifier(v_parent_key, 'detail parentKey');
    if nullif(v_detail->>'foreign_key', '') is not null
       and v_detail->>'foreign_key' <> v_foreign_key then
      raise exception 'Detail resource % foreignKey does not match its configuration.', v_resource_name using errcode = '42501';
    end if;
    if nullif(v_detail->>'parent_key', '') is not null
       and v_detail->>'parent_key' <> v_parent_key then
      raise exception 'Detail resource % parentKey does not match its configuration.', v_resource_name using errcode = '42501';
    end if;
    if v_detail ? 'inherit_fields'
       and coalesce(v_detail->'inherit_fields', '[]'::jsonb) <> coalesce(v_relation_config->'inherit_fields', '[]'::jsonb) then
      raise exception 'Detail resource % inheritFields do not match its configuration.', v_resource_name using errcode = '42501';
    end if;
    v_parent_value := p_parent->v_parent_key;
    if v_parent_value is null then
      raise exception 'Parent field % is required for detail resource %.', v_parent_key, v_resource_name using errcode = '22023';
    end if;
    for v_row in select value from pg_catalog.jsonb_array_elements(coalesce(v_detail->'rows','[]'::jsonb))
    loop
      v_payload := v_row || pg_catalog.jsonb_build_object(v_foreign_key, v_parent_value);
      for v_inherit in select value #>> '{}' from pg_catalog.jsonb_array_elements(coalesce(v_relation_config->'inherit_fields','[]'::jsonb))
      loop
        if p_parent->v_inherit is null then
          raise exception 'Parent field % is required for detail resource %.', v_inherit, v_resource_name using errcode = '22023';
        end if;
        v_payload := v_payload || pg_catalog.jsonb_build_object(v_inherit, p_parent->v_inherit);
      end loop;
      v_payload := dynamic_crud_private.prepare_hooked_payload(
        v_payload, v_resource, 'create', p_account_id, p_context
      );
      v_payload := dynamic_crud_private.insert_row(v_resource->>'table_name', v_payload);
      perform dynamic_crud_private.call_hooks(v_resource->'hooks', 'afterCreate', v_payload, p_context);
    end loop;
  end loop;
end;
$function$;

create or replace function dynamic_crud_private.after_save(
  p_saved jsonb,
  p_actions jsonb,
  p_config jsonb,
  p_account_id uuid
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $function$
declare
  v_action jsonb;
  v_relation jsonb;
  v_resource jsonb;
  v_resource_name text;
  v_data jsonb;
  v_where jsonb;
  v_rows jsonb;
  v_expect integer;
begin
  if p_actions is null or pg_catalog.jsonb_typeof(p_actions) <> 'array' then return; end if;
  for v_action in select value from pg_catalog.jsonb_array_elements(p_actions)
  loop
    v_resource_name := v_action->>'resource';
    v_relation := p_config->'after_save_relations'->v_resource_name;
    if v_relation is null or not coalesce(v_relation->'actions','[]'::jsonb) ? 'update' then
      raise exception 'afterSave resource % is not configured.', v_resource_name using errcode = '42501';
    end if;
    v_resource := p_config->'resources'->(v_relation->>'resource');
    perform dynamic_crud_private.assert_resource_config(v_relation->>'resource', v_resource, 'update', p_account_id);
    v_data := dynamic_crud_private.resolve_references(v_action->'data', p_saved);
    v_where := dynamic_crud_private.resolve_references(v_action->'where', p_saved);
    perform dynamic_crud_private.assert_object_fields_allowed(
      v_data,
      coalesce(v_relation->'allowed_fields', '[]'::jsonb)
        || coalesce(v_resource->'update'->'managed_fields', '[]'::jsonb),
      'afterSave data'
    );
    perform dynamic_crud_private.assert_object_fields_allowed(
      v_where,
      coalesce(
        v_relation->'allowed_where_fields',
        pg_catalog.jsonb_build_array(coalesce(v_resource->>'primary_key', 'id'))
      ),
      'afterSave where'
    );
    v_data := dynamic_crud_private.prepare_payload(v_data, v_resource, 'update', p_account_id);
    if nullif(v_resource->>'account_field', '') is not null then
      v_where := v_where || pg_catalog.jsonb_build_object(v_resource->>'account_field', p_account_id);
    end if;
    v_rows := dynamic_crud_private.update_rows(v_resource->>'table_name', v_data, v_where);
    v_expect := coalesce((v_action->>'expect')::integer, 1);
    if pg_catalog.jsonb_array_length(v_rows) <> v_expect then
      raise exception 'afterSave expected % affected row(s), but updated %.',
        v_expect, pg_catalog.jsonb_array_length(v_rows) using errcode = 'P0001';
    end if;
  end loop;
end;
$function$;

create or replace function public.execute_dynamic_crud(
  p_action text,
  p_table_name text,
  p_config jsonb,
  p_operation jsonb,
  p_account_id uuid default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog
as $function$
declare
  v_resource_name text := p_config->>'resource_name';
  v_resource jsonb := p_config->'resources'->(p_config->>'resource_name');
  v_context jsonb;
  v_item jsonb;
  v_payload jsonb;
  v_saved jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_selector jsonb;
  v_filters jsonb;
  v_primary_key text;
  v_registered_hash text;
  v_registered_config jsonb;
  v_item_context jsonb;
  v_hook_input jsonb;
  v_selector_filter_count integer;
begin
  if auth.uid() is null and current_user not in ('service_role', 'postgres') then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;
  if p_config is null or pg_catalog.jsonb_typeof(p_config) <> 'object'
     or p_operation is null or pg_catalog.jsonb_typeof(p_operation) <> 'object' then
    raise exception 'config and operation must be objects.' using errcode = '22023';
  end if;
  v_context := pg_catalog.jsonb_build_object(
    'action', p_action,
    'resource', p_config->>'resource_name',
    'table_name', p_table_name,
    'account_id', p_account_id,
    'user_id', coalesce(auth.uid(), nullif(p_operation->>'actor_user_id', '')::uuid)
  );
  if current_user = 'authenticated' then
    v_registered_config := public.get_dynamic_crud_resource_config(v_resource_name, p_table_name);
    v_registered_hash := v_registered_config->>'config_hash';
    if v_registered_config is null then
      raise exception 'Dynamic CRUD resource % is not registered.', v_resource_name using errcode = '42501';
    end if;
    if nullif(p_config->>'config_hash', '') is null
       or p_config->>'config_hash' <> v_registered_hash then
      raise exception 'Dynamic CRUD configuration is not trusted.' using errcode = '42501';
    end if;
    p_config := v_registered_config;
    v_resource_name := p_config->>'resource_name';
    v_resource := p_config->'resources'->v_resource_name;
    v_context := v_context || pg_catalog.jsonb_build_object('resource', v_resource_name);
  end if;
  perform dynamic_crud_private.assert_resource_config(v_resource_name, v_resource, p_action, p_account_id);
  if pg_catalog.jsonb_typeof(p_operation->'selector'->'filters') = 'object' then
    select pg_catalog.count(*) into v_selector_filter_count
    from pg_catalog.jsonb_object_keys(p_operation->'selector'->'filters');
  else
    v_selector_filter_count := 0;
  end if;
  if p_action in ('update', 'delete')
     and pg_catalog.jsonb_array_length(coalesce(p_operation->'batch_items', '[]'::jsonb)) = 0
     and nullif(p_operation->'selector'->>'id', '') is null
     and pg_catalog.jsonb_array_length(coalesce(p_operation->'selector'->'ids', '[]'::jsonb)) = 0
     and v_selector_filter_count = 0 then
    raise exception 'id, ids, or filters is required.' using errcode = '22023';
  end if;
  if p_action = 'delete' then
    v_hook_input := '{}'::jsonb;
  else
    v_hook_input := dynamic_crud_private.sanitize_hook_input(
      p_operation->'hook_input', v_resource, p_action
    );
  end if;
  v_context := v_context || pg_catalog.jsonb_build_object(
    'input', coalesce(v_hook_input, '{}'::jsonb)
  );
  if dynamic_crud_private.quote_relation(v_resource->>'table_name') <>
     dynamic_crud_private.quote_relation(p_table_name) then
    raise exception 'tableName does not match the supplied resource configuration.' using errcode = '42501';
  end if;
  v_primary_key := coalesce(v_resource->>'primary_key', 'id');

  if p_action = 'create' then
    if pg_catalog.jsonb_typeof(p_operation->'items') <> 'array' or pg_catalog.jsonb_array_length(p_operation->'items') = 0 then
      raise exception 'Create items are required.' using errcode = '22023';
    end if;
    for v_item in select value from pg_catalog.jsonb_array_elements(p_operation->'items')
    loop
      v_hook_input := dynamic_crud_private.sanitize_hook_input(
        v_item->'hook_input', v_resource, p_action
      );
      v_item_context := v_context || pg_catalog.jsonb_build_object(
        'input', coalesce(v_hook_input, v_context->'input', '{}'::jsonb)
      );
      v_payload := dynamic_crud_private.prepare_hooked_payload(
        v_item->'data', v_resource, 'create', p_account_id, v_item_context
      );
      v_saved := dynamic_crud_private.insert_row(p_table_name, v_payload);
      perform dynamic_crud_private.insert_details(v_saved, v_item->'details', p_config, v_item_context, p_account_id);
      v_saved := dynamic_crud_private.call_hooks(v_resource->'hooks', 'afterCreate', v_saved, v_item_context);
      v_rows := v_rows || pg_catalog.jsonb_build_array(v_saved);
    end loop;
    if pg_catalog.jsonb_array_length(coalesce(p_operation->'after_save','[]'::jsonb)) > 0 then
      if pg_catalog.jsonb_array_length(v_rows) <> 1 then
        raise exception 'afterSave requires exactly one saved item.' using errcode = '22023';
      end if;
      perform dynamic_crud_private.after_save(v_rows->0, p_operation->'after_save', p_config, p_account_id);
    end if;
    return case when pg_catalog.jsonb_array_length(v_rows) = 1 then v_rows->0 else v_rows end;
  end if;

  if p_action = 'delete' then
    v_selector := coalesce(p_operation->'selector', '{}'::jsonb);
    if nullif(v_selector->>'id', '') is not null then
      v_filters := pg_catalog.jsonb_build_object(v_primary_key, v_selector->'id');
    elsif pg_catalog.jsonb_array_length(coalesce(v_selector->'ids','[]'::jsonb)) > 0 then
      v_filters := pg_catalog.jsonb_build_object(v_primary_key, v_selector->'ids');
    else
      v_filters := coalesce(v_selector->'filters', '{}'::jsonb);
    end if;
    if nullif(v_resource->>'account_field', '') is not null then
      v_filters := v_filters || pg_catalog.jsonb_build_object(v_resource->>'account_field', p_account_id);
    end if;
    if nullif(v_resource->>'owner_field', '') is not null and auth.uid() is not null then
      v_filters := v_filters || pg_catalog.jsonb_build_object(v_resource->>'owner_field', auth.uid());
    end if;

    if coalesce((v_resource->'delete'->>'soft_delete')::boolean, false) then
      v_payload := pg_catalog.jsonb_build_object(
        coalesce(nullif(v_resource->'delete'->>'deleted_at_field', ''), 'deleted_at'),
        pg_catalog.to_jsonb(pg_catalog.now())
      );
      if nullif(v_resource->'delete'->>'status_field', '') is not null
         and nullif(v_resource->'delete'->>'deleted_status', '') is not null then
        v_payload := v_payload || pg_catalog.jsonb_build_object(
          v_resource->'delete'->>'status_field',
          v_resource->'delete'->>'deleted_status'
        );
      end if;
      if nullif(v_resource->'delete'->>'deleted_by_field', '') is not null
         and auth.uid() is not null then
        v_payload := v_payload || pg_catalog.jsonb_build_object(
          v_resource->'delete'->>'deleted_by_field',
          auth.uid()
        );
      end if;
      v_payload := dynamic_crud_private.prepare_hooked_payload(
        v_payload, v_resource, 'delete', p_account_id, v_context, false
      );
      v_rows := dynamic_crud_private.update_rows(p_table_name, v_payload, v_filters);
    else
      v_rows := dynamic_crud_private.delete_rows(p_table_name, v_filters);
    end if;
    select coalesce(pg_catalog.jsonb_agg(
      dynamic_crud_private.call_hooks(v_resource->'hooks', 'afterDelete', value, v_context)
    ), '[]'::jsonb) into v_rows from pg_catalog.jsonb_array_elements(v_rows);
    return case when coalesce((p_operation->>'return_single')::boolean, false)
      then v_rows->0 else v_rows end;
  end if;

  if pg_catalog.jsonb_array_length(coalesce(p_operation->'batch_items','[]'::jsonb)) > 0 then
    for v_item in select value from pg_catalog.jsonb_array_elements(p_operation->'batch_items')
    loop
      v_hook_input := dynamic_crud_private.sanitize_hook_input(
        v_item->'hook_input', v_resource, p_action
      );
      v_item_context := v_context || pg_catalog.jsonb_build_object(
        'input', coalesce(v_hook_input, v_context->'input', '{}'::jsonb)
      );
      v_payload := dynamic_crud_private.prepare_hooked_payload(
        v_item->'data', v_resource, 'update', p_account_id, v_item_context, false
      );
      v_filters := pg_catalog.jsonb_build_object(v_primary_key, v_item->'id');
      if nullif(v_resource->>'account_field', '') is not null then
        v_filters := v_filters || pg_catalog.jsonb_build_object(v_resource->>'account_field', p_account_id);
      end if;
      v_saved := dynamic_crud_private.update_rows(p_table_name, v_payload, v_filters);
      if pg_catalog.jsonb_array_length(v_saved) <> 1 then
        raise exception 'No % row matched %: %.', v_resource_name, v_primary_key, v_item->>'id' using errcode = 'P0002';
      end if;
      v_saved := v_saved->0;
      perform dynamic_crud_private.replace_details(v_saved, v_item->'details', p_config, v_item_context, p_account_id);
      v_saved := dynamic_crud_private.call_hooks(v_resource->'hooks', 'afterUpdate', v_saved, v_item_context);
      v_rows := v_rows || pg_catalog.jsonb_build_array(v_saved);
    end loop;
    return v_rows;
  end if;

  v_payload := dynamic_crud_private.prepare_hooked_payload(
    p_operation->'data', v_resource, 'update', p_account_id, v_context, false
  );
  v_selector := coalesce(p_operation->'selector', '{}'::jsonb);
  if nullif(v_selector->>'id', '') is not null then
    v_filters := pg_catalog.jsonb_build_object(v_primary_key, v_selector->'id');
  elsif pg_catalog.jsonb_array_length(coalesce(v_selector->'ids','[]'::jsonb)) > 0 then
    v_filters := pg_catalog.jsonb_build_object(v_primary_key, v_selector->'ids');
  else
    v_filters := coalesce(v_selector->'filters', '{}'::jsonb);
  end if;
  if nullif(v_resource->>'account_field', '') is not null then
    v_filters := v_filters || pg_catalog.jsonb_build_object(v_resource->>'account_field', p_account_id);
  end if;
  if nullif(v_resource->>'owner_field', '') is not null and auth.uid() is not null then
    v_filters := v_filters || pg_catalog.jsonb_build_object(v_resource->>'owner_field', auth.uid());
  end if;
  v_rows := dynamic_crud_private.update_rows(p_table_name, v_payload, v_filters);
  if pg_catalog.jsonb_array_length(coalesce(p_operation->'details','[]'::jsonb)) > 0 then
    if pg_catalog.jsonb_array_length(v_rows) <> 1 then
      raise exception 'A single matching row is required when replacing detail rows.' using errcode = '22023';
    end if;
    perform dynamic_crud_private.replace_details(v_rows->0, p_operation->'details', p_config, v_context, p_account_id);
  end if;
  if pg_catalog.jsonb_array_length(coalesce(p_operation->'after_save','[]'::jsonb)) > 0 then
    if pg_catalog.jsonb_array_length(v_rows) <> 1 then
      raise exception 'afterSave requires a single matching row.' using errcode = '22023';
    end if;
    perform dynamic_crud_private.after_save(v_rows->0, p_operation->'after_save', p_config, p_account_id);
  end if;
  select coalesce(pg_catalog.jsonb_agg(
    dynamic_crud_private.call_hooks(v_resource->'hooks', 'afterUpdate', value, v_context)
  ), '[]'::jsonb) into v_rows from pg_catalog.jsonb_array_elements(v_rows);
  return case when coalesce((p_operation->>'return_single')::boolean, false) then v_rows->0 else v_rows end;
end;
$function$;

revoke all on function public.execute_dynamic_crud(text, text, jsonb, jsonb, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.execute_dynamic_crud(text, text, jsonb, jsonb, uuid)
  to authenticated, service_role;

revoke all on table public.dynamic_crud_resource_registry
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.dynamic_crud_resource_registry
  to service_role;

revoke all on function public.register_dynamic_crud_resource(text, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.register_dynamic_crud_resource(text, text, text, jsonb)
  to service_role;
revoke all on function public.get_dynamic_crud_resource_hash(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_dynamic_crud_resource_hash(text, text)
  to authenticated, service_role;
revoke all on function public.get_dynamic_crud_resource_config(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_dynamic_crud_resource_config(text, text)
  to authenticated, service_role;

revoke all on function dynamic_crud_private.assert_identifier(text, text) from public, anon;
revoke all on function dynamic_crud_private.quote_relation(text) from public, anon;
revoke all on function dynamic_crud_private.assert_string_array(jsonb, text, boolean) from public, anon;
revoke all on function dynamic_crud_private.assert_object_fields_allowed(jsonb, jsonb, text) from public, anon;
revoke all on function dynamic_crud_private.assert_resource_config(text, jsonb, text, uuid) from public, anon;
revoke all on function dynamic_crud_private.sanitize_hook_input(jsonb, jsonb, text) from public, anon;
revoke all on function dynamic_crud_private.prepare_payload(jsonb, jsonb, text, uuid, boolean) from public, anon;
revoke all on function dynamic_crud_private.prepare_hooked_payload(jsonb, jsonb, text, uuid, jsonb, boolean) from public, anon;
revoke all on function dynamic_crud_private.call_hooks(jsonb, text, jsonb, jsonb) from public, anon;
revoke all on function dynamic_crud_private.insert_row(text, jsonb) from public, anon;
revoke all on function dynamic_crud_private.resolve_references(jsonb, jsonb) from public, anon;
revoke all on function dynamic_crud_private.build_filter_clause(jsonb, text) from public, anon;
revoke all on function dynamic_crud_private.update_rows(text, jsonb, jsonb) from public, anon;
revoke all on function dynamic_crud_private.delete_rows(text, jsonb) from public, anon;
revoke all on function dynamic_crud_private.replace_details(jsonb, jsonb, jsonb, jsonb, uuid) from public, anon;
revoke all on function dynamic_crud_private.insert_details(jsonb, jsonb, jsonb, jsonb, uuid) from public, anon;
revoke all on function dynamic_crud_private.after_save(jsonb, jsonb, jsonb, uuid) from public, anon;

grant execute on function dynamic_crud_private.assert_identifier(text, text) to authenticated, service_role;
grant execute on function dynamic_crud_private.quote_relation(text) to authenticated, service_role;
grant execute on function dynamic_crud_private.assert_string_array(jsonb, text, boolean) to authenticated, service_role;
grant execute on function dynamic_crud_private.assert_object_fields_allowed(jsonb, jsonb, text) to authenticated, service_role;
grant execute on function dynamic_crud_private.assert_resource_config(text, jsonb, text, uuid) to authenticated, service_role;
grant execute on function dynamic_crud_private.sanitize_hook_input(jsonb, jsonb, text) to authenticated, service_role;
grant execute on function dynamic_crud_private.prepare_payload(jsonb, jsonb, text, uuid, boolean) to authenticated, service_role;
grant execute on function dynamic_crud_private.prepare_hooked_payload(jsonb, jsonb, text, uuid, jsonb, boolean) to authenticated, service_role;
grant execute on function dynamic_crud_private.call_hooks(jsonb, text, jsonb, jsonb) to authenticated, service_role;
grant execute on function dynamic_crud_private.insert_row(text, jsonb) to authenticated, service_role;
grant execute on function dynamic_crud_private.resolve_references(jsonb, jsonb) to authenticated, service_role;
grant execute on function dynamic_crud_private.build_filter_clause(jsonb, text) to authenticated, service_role;
grant execute on function dynamic_crud_private.update_rows(text, jsonb, jsonb) to authenticated, service_role;
grant execute on function dynamic_crud_private.delete_rows(text, jsonb) to authenticated, service_role;
grant execute on function dynamic_crud_private.replace_details(jsonb, jsonb, jsonb, jsonb, uuid) to authenticated, service_role;
grant execute on function dynamic_crud_private.insert_details(jsonb, jsonb, jsonb, jsonb, uuid) to authenticated, service_role;
grant execute on function dynamic_crud_private.after_save(jsonb, jsonb, jsonb, uuid) to authenticated, service_role;

revoke all on function public.dynamic_crud_sync_role_permissions(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.dynamic_crud_sync_role_permissions(jsonb, jsonb, jsonb)
  to authenticated, service_role;
revoke all on function public.dynamic_crud_normalize_lowcode_page(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.dynamic_crud_normalize_lowcode_page(jsonb, jsonb, jsonb)
  to authenticated, service_role;
revoke all on function public.dynamic_crud_normalize_admin_route(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.dynamic_crud_normalize_admin_route(jsonb, jsonb, jsonb)
  to authenticated, service_role;
revoke all on function public.dynamic_crud_normalize_admin_entity(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.dynamic_crud_normalize_admin_entity(jsonb, jsonb, jsonb)
  to authenticated, service_role;
revoke all on function public.dynamic_crud_normalize_option_source(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.dynamic_crud_normalize_option_source(jsonb, jsonb, jsonb)
  to authenticated, service_role;
revoke all on function public.dynamic_crud_normalize_option_item(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.dynamic_crud_normalize_option_item(jsonb, jsonb, jsonb)
  to authenticated, service_role;
revoke all on function public.dynamic_crud_normalize_workflow_model(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.dynamic_crud_normalize_workflow_model(jsonb, jsonb, jsonb)
  to authenticated, service_role;
revoke all on function public.dynamic_crud_normalize_workflow_job(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.dynamic_crud_normalize_workflow_job(jsonb, jsonb, jsonb)
  to authenticated, service_role;
revoke all on function public.dynamic_crud_normalize_chat_conversation(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.dynamic_crud_normalize_chat_conversation(jsonb, jsonb, jsonb)
  to authenticated, service_role;
revoke all on function public.dynamic_crud_normalize_chat_message(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.dynamic_crud_normalize_chat_message(jsonb, jsonb, jsonb)
  to authenticated, service_role;
revoke all on function public.dynamic_crud_normalize_chat_message_update(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.dynamic_crud_normalize_chat_message_update(jsonb, jsonb, jsonb)
  to authenticated, service_role;
revoke all on function public.dynamic_crud_assert_account_user(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.dynamic_crud_assert_account_user(uuid, uuid, text)
  to authenticated, service_role;
revoke all on function public.dynamic_crud_validate_chat_conversation_member(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.dynamic_crud_validate_chat_conversation_member(jsonb, jsonb, jsonb)
  to authenticated, service_role;
revoke all on function public.dynamic_crud_validate_account_recipient(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.dynamic_crud_validate_account_recipient(jsonb, jsonb, jsonb)
  to authenticated, service_role;
revoke all on function public.dynamic_crud_normalize_notification_message(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.dynamic_crud_normalize_notification_message(jsonb, jsonb, jsonb)
  to authenticated, service_role;
revoke all on function public.dynamic_crud_normalize_notification_message_update(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.dynamic_crud_normalize_notification_message_update(jsonb, jsonb, jsonb)
  to authenticated, service_role;
revoke all on function public.dynamic_crud_normalize_notification_preference(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.dynamic_crud_normalize_notification_preference(jsonb, jsonb, jsonb)
  to authenticated, service_role;
revoke all on function public.dynamic_crud_normalize_notification_delivery(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.dynamic_crud_normalize_notification_delivery(jsonb, jsonb, jsonb)
  to authenticated, service_role;
revoke all on function public.dynamic_crud_validate_notification_event(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.dynamic_crud_validate_notification_event(jsonb, jsonb, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';
