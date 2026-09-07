-- Database view management without a version/history table.
-- Draft metadata is saved first; publishing validates and creates a PostgreSQL view.

create table if not exists public.entity_design_views (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  schema_name text not null default 'public',
  view_name text not null,
  title text not null,
  description text,
  definition_sql text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  security_invoker boolean not null default true
    check (security_invoker = true),
  published_at timestamp with time zone,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (schema_name, view_name)
);

drop trigger if exists set_entity_design_views_updated_at on public.entity_design_views;
create trigger set_entity_design_views_updated_at
before update on public.entity_design_views
for each row execute function public.set_updated_at();

create index if not exists idx_entity_design_views_status
  on public.entity_design_views (status, updated_at desc);

alter table public.entity_design_views enable row level security;

drop policy if exists "Entity view managers can manage views"
  on public.entity_design_views;
drop policy if exists "Entity view managers can read views"
  on public.entity_design_views;
create policy "Entity view managers can read views"
on public.entity_design_views
for select
to authenticated
using (
  public.has_app_permission('entity.views.manage')
);

revoke insert, update, delete on public.entity_design_views from authenticated;
grant select on public.entity_design_views to authenticated;

create schema if not exists entity_view_private;
revoke all on schema entity_view_private from public, anon, service_role;
revoke all on schema entity_view_private from authenticated;

create or replace function entity_view_private.assert_manage_permission()
returns void
language plpgsql
security invoker
stable
set search_path = pg_catalog
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if not public.has_app_permission('entity.views.manage') then
    raise exception 'View management permission required.' using errcode = '42501';
  end if;
end;
$function$;

create or replace function entity_view_private.assert_identifier(
  p_value text,
  p_name text
)
returns void
language plpgsql
security invoker
immutable
set search_path = pg_catalog
as $function$
begin
  if p_value is null
     or p_value !~ '^[a-zA-Z_][a-zA-Z0-9_]*$'
     or pg_catalog.length(p_value) > 63 then
    raise exception '% must be a valid PostgreSQL identifier.', p_name
      using errcode = '22023';
  end if;
end;
$function$;

create or replace function entity_view_private.assert_target(
  p_schema_name text,
  p_view_name text
)
returns void
language plpgsql
security invoker
immutable
set search_path = pg_catalog
as $function$
begin
  perform entity_view_private.assert_identifier(p_schema_name, 'schemaName');
  perform entity_view_private.assert_identifier(p_view_name, 'viewName');

  if p_schema_name <> 'public' then
    raise exception 'Only views in the public schema can be managed.'
      using errcode = '22023';
  end if;

  if p_view_name in (
    'entity_design_views',
    'entity_design_tables',
    'entity_design_columns',
    'entity_design_relations',
    'schema_migrations'
  ) then
    raise exception 'View public.% is protected from view management.', p_view_name
      using errcode = '42501';
  end if;
end;
$function$;

create or replace function entity_view_private.normalize_definition(p_sql text)
returns text
language plpgsql
security invoker
immutable
set search_path = pg_catalog
as $function$
declare
  v_sql text := pg_catalog.btrim(p_sql);
begin
  if v_sql is null or v_sql = '' then
    raise exception 'definitionSql is required.' using errcode = '22023';
  end if;

  v_sql := pg_catalog.regexp_replace(v_sql, ';[[:space:]]*$', '');
  if v_sql ~ ';' then
    raise exception 'Only one SELECT statement is allowed.' using errcode = '22023';
  end if;
  if v_sql ~ '--|/\*|\*/' then
    raise exception 'SQL comments are not allowed in a managed view definition.'
      using errcode = '22023';
  end if;
  if v_sql !~* '^[[:space:]]*(select|with)[[:space:]]' then
    raise exception 'A managed view definition must start with SELECT or WITH.'
      using errcode = '22023';
  end if;
  if v_sql ~* '(^|[^a-z0-9_])(insert|update|delete|merge|alter|drop|create|truncate|grant|revoke|copy|call|do|vacuum|analyze|refresh|set|reset|listen|notify|execute)([^a-z0-9_]|$)' then
    raise exception 'The managed view definition contains a forbidden SQL command.'
      using errcode = '22023';
  end if;

  return v_sql;
end;
$function$;

create or replace function entity_view_private.resolve_view(p_payload jsonb)
returns public.entity_design_views
language plpgsql
security invoker
stable
set search_path = pg_catalog
as $function$
declare
  v_view public.entity_design_views%rowtype;
  v_schema_name text;
  v_view_name text;
begin
  perform entity_view_private.assert_manage_permission();

  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'A view selector is required.' using errcode = '22023';
  end if;

  if nullif(p_payload->>'id', '') is not null then
    select * into v_view
    from public.entity_design_views
    where id = (p_payload->>'id')::uuid;
  elsif nullif(p_payload->>'code', '') is not null then
    select * into v_view
    from public.entity_design_views
    where code = p_payload->>'code';
  elsif nullif(p_payload->>'view_name', '') is not null then
    v_schema_name := coalesce(nullif(p_payload->>'schema_name', ''), 'public');
    v_view_name := p_payload->>'view_name';
    perform entity_view_private.assert_target(v_schema_name, v_view_name);
    select * into v_view
    from public.entity_design_views
    where schema_name = v_schema_name
      and view_name = v_view_name;
  else
    raise exception 'id, viewCode, or viewName is required.' using errcode = '22023';
  end if;

  if not found then
    raise exception 'Managed view not found.' using errcode = 'P0002';
  end if;

  perform entity_view_private.assert_target(v_view.schema_name, v_view.view_name);
  return v_view;
end;
$function$;

create or replace function entity_view_private.assert_name_available(
  p_schema_name text,
  p_view_name text,
  p_current_view_id uuid default null
)
returns void
language plpgsql
security invoker
stable
set search_path = pg_catalog
as $function$
declare
  v_kind "char";
begin
  select relation.relkind into v_kind
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = p_schema_name
    and relation.relname = p_view_name;

  if v_kind is null then return; end if;
  if v_kind <> 'v' then
    raise exception 'Relation %.% already exists and is not a regular view.',
      p_schema_name, p_view_name using errcode = '42P07';
  end if;
  if p_current_view_id is null or not exists (
    select 1
    from public.entity_design_views managed_view
    where managed_view.schema_name = p_schema_name
      and managed_view.view_name = p_view_name
      and managed_view.id = p_current_view_id
      and managed_view.status = 'published'
  ) then
    raise exception 'View %.% exists but is not managed by this system.',
      p_schema_name, p_view_name using errcode = '42501';
  end if;
end;
$function$;

create or replace function entity_view_private.validate_definition(p_sql text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_sql text;
  v_plan jsonb;
  v_columns jsonb;
  v_temp_view_name text := pg_catalog.format(
    'entity_view_analysis_%s_%s',
    pg_catalog.pg_backend_pid(),
    pg_catalog.txid_current()
  );
begin
  perform entity_view_private.assert_manage_permission();
  v_sql := entity_view_private.normalize_definition(p_sql);

  execute 'explain (format json, costs false) ' || v_sql into v_plan;
  begin
    execute pg_catalog.format('create temporary view %I as %s', v_temp_view_name, v_sql);

    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'column_name', attribute.attname,
          'ordinal_position', attribute.attnum,
          'data_type', pg_catalog.format_type(attribute.atttypid, attribute.atttypmod),
          'udt_name', data_type.typname,
          'is_nullable', case when attribute.attnotnull then 'NO' else 'YES' end
        ) order by attribute.attnum
      ),
      '[]'::jsonb
    )
    into v_columns
    from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_class relation on relation.oid = attribute.attrelid
    join pg_catalog.pg_type data_type on data_type.oid = attribute.atttypid
    where relation.relnamespace = pg_catalog.pg_my_temp_schema()
      and relation.relname = v_temp_view_name
      and attribute.attnum > 0
      and not attribute.attisdropped;

    execute pg_catalog.format('drop view pg_temp.%I', v_temp_view_name);
  exception when others then
    begin
      execute pg_catalog.format('drop view if exists pg_temp.%I', v_temp_view_name);
    exception when others then
      null;
    end;
    raise;
  end;

  return pg_catalog.jsonb_build_object(
    'valid', true,
    'definitionSql', v_sql,
    'plan', v_plan,
    'columns', v_columns
  );
end;
$function$;

create or replace function entity_view_private.create_or_replace_view(
  p_schema_name text,
  p_view_name text,
  p_definition_sql text,
  p_current_view_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_sql text;
begin
  perform entity_view_private.assert_manage_permission();
  perform entity_view_private.assert_target(p_schema_name, p_view_name);
  perform entity_view_private.assert_name_available(
    p_schema_name,
    p_view_name,
    p_current_view_id
  );
  v_sql := entity_view_private.normalize_definition(p_definition_sql);

  execute pg_catalog.format(
    'create or replace view %I.%I with (security_invoker = true) as %s',
    p_schema_name,
    p_view_name,
    v_sql
  );
  execute pg_catalog.format(
    'grant select on table %I.%I to authenticated',
    p_schema_name,
    p_view_name
  );
end;
$function$;

create or replace function entity_view_private.drop_view(
  p_schema_name text,
  p_view_name text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform entity_view_private.assert_manage_permission();
  perform entity_view_private.assert_target(p_schema_name, p_view_name);

  if exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = p_schema_name
      and relation.relname = p_view_name
      and relation.relkind <> 'v'
  ) then
    raise exception 'Relation %.% is not a regular view.', p_schema_name, p_view_name
      using errcode = '42809';
  end if;

  execute pg_catalog.format('drop view if exists %I.%I restrict', p_schema_name, p_view_name);
end;
$function$;

create or replace function public.entity_design_list_views(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog
as $function$
declare
  v_result jsonb;
  v_status text := nullif(p_payload->>'status', '');
  v_search text := pg_catalog.lower(nullif(p_payload->>'search', ''));
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_code text := nullif(p_payload->>'code', '');
  v_schema_name text := nullif(p_payload->>'schema_name', '');
  v_view_name text := nullif(p_payload->>'view_name', '');
begin
  perform entity_view_private.assert_manage_permission();

  select coalesce(pg_catalog.jsonb_agg(row_data order by row_data->>'updated_at' desc), '[]'::jsonb)
  into v_result
  from (
      select pg_catalog.to_jsonb(managed_view)
      || pg_catalog.jsonb_build_object(
        'full_name', managed_view.schema_name || '.' || managed_view.view_name,
        'columns', case
          when pg_catalog.jsonb_typeof(managed_view.metadata->'columns') = 'array'
            and pg_catalog.jsonb_array_length(managed_view.metadata->'columns') > 0
            then managed_view.metadata->'columns'
          else coalesce(column_metadata.columns, '[]'::jsonb)
        end,
        'exists_in_database', physical_view.oid is not null,
        'database_definition', case
          when physical_view.oid is not null then pg_catalog.pg_get_viewdef(physical_view.oid, true)
          else null
        end,
        'column_count', coalesce(column_metadata.column_count, 0),
        'definition_sql_preview', case
          when pg_catalog.length(managed_view.definition_sql) > 180
            then pg_catalog.left(managed_view.definition_sql, 177) || '...'
          else managed_view.definition_sql
        end
      ) as row_data
    from public.entity_design_views managed_view
    left join pg_catalog.pg_namespace namespace
      on namespace.nspname = managed_view.schema_name
    left join pg_catalog.pg_class physical_view
      on physical_view.relnamespace = namespace.oid
     and physical_view.relname = managed_view.view_name
     and physical_view.relkind = 'v'
    left join (
      select
        columns.table_schema,
        columns.table_name,
        pg_catalog.count(*)::integer as column_count,
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'schema_name', columns.table_schema,
            'view_name', columns.table_name,
            'column_name', columns.column_name,
            'ordinal_position', columns.ordinal_position,
            'data_type', columns.data_type,
            'udt_name', columns.udt_name,
            'is_nullable', columns.is_nullable
          ) order by columns.ordinal_position
        ) as columns
      from information_schema.columns columns
      group by columns.table_schema, columns.table_name
    ) column_metadata
      on column_metadata.table_schema = managed_view.schema_name
     and column_metadata.table_name = managed_view.view_name
    where (v_id is null or managed_view.id = v_id)
      and (v_code is null or managed_view.code = v_code)
      and (v_schema_name is null or managed_view.schema_name = v_schema_name)
      and (v_view_name is null or managed_view.view_name = v_view_name)
      and (v_status is null or managed_view.status = v_status)
      and (
        v_search is null
        or pg_catalog.lower(managed_view.code) like '%' || v_search || '%'
        or pg_catalog.lower(managed_view.title) like '%' || v_search || '%'
        or pg_catalog.lower(managed_view.view_name) like '%' || v_search || '%'
      )
  ) rows;

  return v_result;
end;
$function$;

create or replace function public.entity_design_list_view_columns(p_payload jsonb)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog
as $function$
declare
  v_view public.entity_design_views%rowtype;
  v_result jsonb;
begin
  v_view := entity_view_private.resolve_view(p_payload);

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'view_id', v_view.id,
        'schema_name', columns.table_schema,
        'view_name', columns.table_name,
        'column_name', columns.column_name,
        'ordinal_position', columns.ordinal_position,
        'data_type', columns.data_type,
        'udt_name', columns.udt_name,
        'is_nullable', columns.is_nullable
      ) order by columns.ordinal_position
    ),
    '[]'::jsonb
  ) into v_result
  from information_schema.columns columns
  where columns.table_schema = v_view.schema_name
    and columns.table_name = v_view.view_name;

  if pg_catalog.jsonb_array_length(v_result) = 0
    and pg_catalog.jsonb_typeof(v_view.metadata->'columns') = 'array' then
    select coalesce(
      pg_catalog.jsonb_agg(
        saved_column.column_data
        || pg_catalog.jsonb_build_object(
          'view_id', v_view.id,
          'schema_name', v_view.schema_name,
          'view_name', v_view.view_name
        ) order by saved_column.ordinality
      ),
      '[]'::jsonb
    )
    into v_result
    from pg_catalog.jsonb_array_elements(v_view.metadata->'columns')
      with ordinality as saved_column(column_data, ordinality);
  end if;

  return v_result;
end;
$function$;

create or replace function public.entity_design_validate_view(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform entity_view_private.assert_manage_permission();
  return entity_view_private.validate_definition(p_payload->>'definition_sql');
end;
$function$;

create or replace function public.entity_design_save_view(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_existing public.entity_design_views%rowtype;
  v_saved public.entity_design_views%rowtype;
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_code text := nullif(p_payload->>'code', '');
  v_schema_name text := coalesce(nullif(p_payload->>'schema_name', ''), 'public');
  v_view_name text := nullif(p_payload->>'view_name', '');
  v_title text := nullif(p_payload->>'title', '');
  v_definition text := coalesce(p_payload->>'definition_sql', '');
  v_status text;
  v_metadata jsonb := coalesce(p_payload->'metadata', '{}'::jsonb);
begin
  perform entity_view_private.assert_manage_permission();
  perform entity_view_private.assert_target(v_schema_name, v_view_name);
  perform entity_view_private.assert_identifier(v_code, 'code');

  if v_title is null then
    raise exception 'title is required.' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'metadata must be a JSON object.' using errcode = '22023';
  end if;
  if v_definition <> '' then
    v_definition := entity_view_private.normalize_definition(v_definition);
  end if;

  if v_id is not null then
    select * into v_existing from public.entity_design_views where id = v_id;
    if not found then
      raise exception 'Managed view not found.' using errcode = 'P0002';
    end if;
    if (v_existing.schema_name, v_existing.view_name) is distinct from (v_schema_name, v_view_name) then
      raise exception 'schemaName and viewName cannot be changed after a managed view is created.'
        using errcode = '22023';
    end if;
    v_status := v_existing.status;
  else
    v_status := 'draft';
  end if;

  insert into public.entity_design_views (
    id, code, schema_name, view_name, title, description, definition_sql,
    status, security_invoker, published_at, metadata, created_by, updated_by
  ) values (
    coalesce(v_id, pg_catalog.gen_random_uuid()),
    v_code,
    v_schema_name,
    v_view_name,
    v_title,
    nullif(p_payload->>'description', ''),
    v_definition,
    v_status,
    true,
    case when v_status = 'published' then pg_catalog.timezone('utc'::text, pg_catalog.now()) else null end,
    v_metadata,
    auth.uid(),
    auth.uid()
  )
  on conflict (id) do update set
    code = excluded.code,
    schema_name = excluded.schema_name,
    view_name = excluded.view_name,
    title = excluded.title,
    description = excluded.description,
    definition_sql = excluded.definition_sql,
    status = excluded.status,
    security_invoker = true,
    published_at = case
      when excluded.status = 'published' then coalesce(public.entity_design_views.published_at, excluded.published_at)
      else public.entity_design_views.published_at
    end,
    metadata = excluded.metadata,
    updated_by = excluded.updated_by,
    updated_at = pg_catalog.timezone('utc'::text, pg_catalog.now())
  returning * into v_saved;

  if v_saved.status = 'published' then
    perform entity_view_private.validate_definition(v_saved.definition_sql);
    perform entity_view_private.create_or_replace_view(
      v_saved.schema_name, v_saved.view_name, v_saved.definition_sql, v_saved.id
    );
  end if;

  return pg_catalog.to_jsonb(v_saved)
    || pg_catalog.jsonb_build_object('full_name', v_saved.schema_name || '.' || v_saved.view_name);
end;
$function$;

create or replace function public.entity_design_publish_view(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_view public.entity_design_views%rowtype;
begin
  v_view := entity_view_private.resolve_view(p_payload);
  perform entity_view_private.validate_definition(v_view.definition_sql);
  perform entity_view_private.create_or_replace_view(
    v_view.schema_name, v_view.view_name, v_view.definition_sql, v_view.id
  );

  update public.entity_design_views
  set status = 'published',
      security_invoker = true,
      published_at = pg_catalog.timezone('utc'::text, pg_catalog.now()),
      updated_by = auth.uid(),
      updated_at = pg_catalog.timezone('utc'::text, pg_catalog.now())
  where id = v_view.id
  returning * into v_view;

  return pg_catalog.to_jsonb(v_view)
    || pg_catalog.jsonb_build_object('full_name', v_view.schema_name || '.' || v_view.view_name);
end;
$function$;

create or replace function public.entity_design_archive_view(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_view public.entity_design_views%rowtype;
begin
  v_view := entity_view_private.resolve_view(p_payload);
  if v_view.status = 'published' then
    perform entity_view_private.drop_view(v_view.schema_name, v_view.view_name);
  end if;

  update public.entity_design_views
  set status = 'archived',
      updated_by = auth.uid(),
      updated_at = pg_catalog.timezone('utc'::text, pg_catalog.now())
  where id = v_view.id
  returning * into v_view;

  return pg_catalog.to_jsonb(v_view)
    || pg_catalog.jsonb_build_object('full_name', v_view.schema_name || '.' || v_view.view_name);
end;
$function$;

create or replace function public.entity_design_delete_view(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_view public.entity_design_views%rowtype;
begin
  v_view := entity_view_private.resolve_view(p_payload);
  if v_view.status = 'published' then
    perform entity_view_private.drop_view(v_view.schema_name, v_view.view_name);
  end if;
  delete from public.entity_design_views where id = v_view.id;

  return pg_catalog.jsonb_build_object(
    'id', v_view.id,
    'code', v_view.code,
    'full_name', v_view.schema_name || '.' || v_view.view_name,
    'deleted', true
  );
end;
$function$;

revoke all on function entity_view_private.assert_manage_permission()
  from public, anon, authenticated, service_role;
revoke all on function entity_view_private.assert_identifier(text, text)
  from public, anon, authenticated, service_role;
revoke all on function entity_view_private.assert_target(text, text)
  from public, anon, authenticated, service_role;
revoke all on function entity_view_private.normalize_definition(text)
  from public, anon, authenticated, service_role;
revoke all on function entity_view_private.resolve_view(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function entity_view_private.assert_name_available(text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function entity_view_private.validate_definition(text)
  from public, anon, authenticated, service_role;
revoke all on function entity_view_private.create_or_replace_view(text, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function entity_view_private.drop_view(text, text)
  from public, anon, authenticated, service_role;

revoke all on function public.entity_design_list_views(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.entity_design_list_view_columns(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.entity_design_validate_view(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.entity_design_save_view(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.entity_design_publish_view(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.entity_design_archive_view(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.entity_design_delete_view(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.entity_design_list_views(jsonb) to authenticated;
grant execute on function public.entity_design_list_view_columns(jsonb) to authenticated;
grant execute on function public.entity_design_validate_view(jsonb) to authenticated;
grant execute on function public.entity_design_save_view(jsonb) to authenticated;
grant execute on function public.entity_design_publish_view(jsonb) to authenticated;
grant execute on function public.entity_design_archive_view(jsonb) to authenticated;
grant execute on function public.entity_design_delete_view(jsonb) to authenticated;

insert into public.admin_permissions (
  code, name, description, resource_type, resource_key, action_code, status, sort_order
) values (
  'entity.views.manage',
  'Manage Database Views',
  'Create, validate, publish, archive, and delete managed PostgreSQL views.',
  'entity',
  'entity_design_views',
  'manage',
  'active',
  56
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  resource_type = excluded.resource_type,
  resource_key = excluded.resource_key,
  action_code = excluded.action_code,
  status = excluded.status,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc'::text, now());

insert into public.admin_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.admin_roles roles
join public.admin_permissions permissions on permissions.code = 'entity.views.manage'
where roles.code in ('system_admin', 'operations_admin')
on conflict do nothing;

insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive,
  schema, version, published_at
) values (
  'entity-views',
  '/dashboard/data/views',
  U&'\89C6\56FE\7BA1\7406',
  U&'\7BA1\7406 PostgreSQL \89C6\56FE\8349\7A3F\3001\53D1\5E03\72B6\6001\4E0E\5B57\6BB5\4FE1\606F\3002',
  'list',
  'dashboard',
  'published',
  true,
  $json$
  {
    "schemaVersion": 1,
    "code": "entity-views",
    "route": "/dashboard/data/views",
    "title": "视图管理",
    "description": "管理 PostgreSQL 视图草稿、发布状态与字段信息。",
    "pageType": "list",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "dataSources": {
      "managedViews": {
        "key": "managedViews",
        "label": "数据库视图",
        "serviceName": "entityDesign",
        "serviceMethod": "listViews",
        "postData": {},
        "autoLoad": true
      },
      "selectedViewRows": {
        "key": "selectedViewRows",
        "label": "当前视图",
        "serviceName": "entityDesign",
        "serviceMethod": "listViews",
        "postData": { "filters": { "id": "__none__" } },
        "autoLoad": false
      },
      "selectedViewColumns": {
        "key": "selectedViewColumns",
        "label": "视图字段",
        "serviceName": "entityDesign",
        "serviceMethod": "listViewColumns",
        "postData": { "filters": { "id": "__none__" } },
        "autoLoad": false
      }
    },
    "blocks": [
      {
        "id": "entity-view-actions",
        "kind": "buttonGroup",
        "align": "left",
        "gap": 8,
        "actions": [
          {
            "code": "all-views",
            "label": "全部视图",
            "status": "primary",
            "icon": "ri-list-check-2",
            "directives": [
              { "type": "setSearchFilters", "sourceKey": "managedViews", "mode": "replace", "values": {} }
            ]
          },
          {
            "code": "draft-views",
            "label": "草稿",
            "icon": "ri-draft-line",
            "directives": [
              { "type": "setSearchFilters", "sourceKey": "managedViews", "mode": "replace", "values": { "status": "draft" } }
            ]
          },
          {
            "code": "published-views",
            "label": "已发布",
            "icon": "ri-checkbox-circle-line",
            "directives": [
              { "type": "setSearchFilters", "sourceKey": "managedViews", "mode": "replace", "values": { "status": "published" } }
            ]
          },
          {
            "code": "archived-views",
            "label": "已归档",
            "icon": "ri-archive-line",
            "directives": [
              { "type": "setSearchFilters", "sourceKey": "managedViews", "mode": "replace", "values": { "status": "archived" } }
            ]
          },
          {
            "code": "refresh-views",
            "label": "刷新",
            "icon": "ri-refresh-line",
            "directives": [
              { "type": "refreshDataSource", "sourceKeys": ["managedViews"] }
            ]
          },
          {
            "code": "create-view",
            "label": "新建视图",
            "status": "success",
            "icon": "ri-add-line",
            "route": "/dashboard/data/views/edit"
          }
        ]
      },
      {
        "id": "entity-view-main-grid",
        "kind": "grid",
        "sourceKey": "managedViews",
        "schema": {
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": true,
            "height": 360,
            "rowConfig": { "keyField": "id", "isCurrent": true },
            "columns": [
              { "type": "seq", "title": "序号", "width": 64, "align": "center" },
              { "field": "code", "title": "视图编码", "minWidth": 160, "fixed": "left", "sortable": true },
              { "field": "title", "title": "视图名称", "minWidth": 180, "fixed": "left", "sortable": true },
              { "field": "full_name", "title": "数据库对象", "minWidth": 210, "showOverflow": "tooltip" },
              { "field": "status", "title": "状态", "width": 96, "align": "center", "formatter": { "type": "enum", "map": { "draft": "草稿", "published": "已发布", "archived": "已归档" }, "emptyText": "-" } },
              { "field": "exists_in_database", "title": "数据库", "width": 96, "align": "center", "formatter": { "type": "enum", "map": { "true": "已创建", "false": "未创建" }, "emptyText": "未创建" } },
              { "field": "column_count", "title": "字段数", "width": 88, "align": "right", "formatter": { "type": "number", "emptyText": "0" } },
              { "field": "description", "title": "说明", "minWidth": 220, "showOverflow": "tooltip" },
              { "field": "updated_at", "title": "更新时间", "width": 180, "sortable": true, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
              { "title": "操作", "width": 110, "fixed": "right", "slots": { "default": "actions" } }
            ]
          },
          "rowActions": { "edit": true, "editLabel": "编辑", "delete": false },
          "events": {
            "rowCurrentChange": [
              { "type": "setDataSource", "sourceKey": "selectedViewRows", "value": ["{{ event.row }}"] },
              { "type": "invokeService", "serviceName": "entityDesign", "serviceMethod": "listViewColumns", "postData": { "id": "{{ event.row.id }}" }, "assignTo": "selectedViewColumns" }
            ]
          }
        }
      },
      {
        "id": "entity-view-child-tabs",
        "kind": "tabs",
        "defaultKey": "columns",
        "tabs": [
          {
            "key": "columns",
            "label": "视图字段",
            "blocks": [
              {
                "id": "entity-view-columns-grid",
                "kind": "grid",
                "sourceKey": "selectedViewColumns",
                "schema": {
                  "grid": {
                    "border": true,
                    "stripe": true,
                    "showOverflow": true,
                    "height": 240,
                    "rowConfig": { "keyField": "column_name", "isCurrent": true },
                    "columns": [
                      { "field": "ordinal_position", "title": "序号", "width": 72, "align": "right" },
                      { "field": "column_name", "title": "字段名", "minWidth": 180, "fixed": "left" },
                      { "field": "data_type", "title": "数据类型", "minWidth": 160 },
                      { "field": "udt_name", "title": "底层类型", "minWidth": 140 },
                      { "field": "is_nullable", "title": "可空", "width": 88, "align": "center", "formatter": { "type": "enum", "map": { "YES": "是", "NO": "否" }, "emptyText": "-" } }
                    ]
                  },
                  "rowActions": { "edit": false, "delete": false }
                }
              }
            ]
          },
          {
            "key": "definition",
            "label": "定义摘要",
            "blocks": [
              {
                "id": "entity-view-definition-grid",
                "kind": "grid",
                "sourceKey": "selectedViewRows",
                "schema": {
                  "grid": {
                    "border": true,
                    "stripe": true,
                    "showOverflow": "tooltip",
                    "height": 240,
                    "rowConfig": { "keyField": "id", "isCurrent": true },
                    "columns": [
                      { "field": "full_name", "title": "数据库对象", "minWidth": 210, "fixed": "left" },
                      { "field": "definition_sql_preview", "title": "SQL 摘要", "minWidth": 560, "showOverflow": "tooltip" },
                      { "field": "published_at", "title": "发布时间", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
                      { "field": "updated_by", "title": "更新人", "minWidth": 260, "showOverflow": "tooltip" }
                    ]
                  },
                  "rowActions": { "edit": false, "delete": false }
                }
              }
            ]
          }
        ]
      }
    ]
  }
  $json$::jsonb,
  1,
  timezone('utc'::text, now())
)
on conflict (code) do update set
  route = excluded.route,
  title = excluded.title,
  description = excluded.description,
  page_type = excluded.page_type,
  layout = excluded.layout,
  status = excluded.status,
  keep_alive = excluded.keep_alive,
  schema = excluded.schema,
  version = public.lowcode_pages.version + 1,
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now());

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'entity-views'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

insert into public.lowcode_pages (
  code, route, title, description, page_type, layout, status, keep_alive,
  schema, version, published_at
) values (
  'entity-views-edit',
  '/dashboard/data/views/edit',
  U&'\89C6\56FE\7F16\8F91',
  U&'\7F16\8F91\89C6\56FE\5B9A\4E49\5E76\9A8C\8BC1\3001\53D1\5E03\6216\5F52\6863\3002',
  'edit',
  'dashboard',
  'published',
  false,
  $json$
  {
    "schemaVersion": 1,
    "code": "entity-views-edit",
    "route": "/dashboard/data/views/edit",
    "title": "视图编辑",
    "description": "编辑视图定义并控制发布状态。",
    "pageType": "edit",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": false,
    "apis": {
      "analyzeViewSql": {
        "serviceName": "entityDesign",
        "serviceMethod": "validateView",
        "method": "POST",
        "resultPath": "columns"
      }
    },
    "scriptPolicy": {
      "apiNames": [],
      "capabilities": ["action.execute", "http.execute"]
    },
    "dataSources": {
      "managedView": {
        "key": "managedView",
        "label": "视图定义",
        "serviceName": "entityDesign",
        "serviceMethod": "listViews",
        "saveMethod": "saveView",
        "postData": { "filters": { "id": "{{ route.query.id }}" } },
        "autoLoad": true
      },
      "editViewColumns": {
        "key": "editViewColumns",
        "label": "视图字段",
        "serviceName": "entityDesign",
        "serviceMethod": "listViewColumns",
        "postData": { "filters": { "id": "{{ route.query.id }}" } },
        "autoLoad": true
      }
    },
    "blocks": [
      {
        "id": "entity-view-edit-actions",
        "kind": "buttonGroup",
        "align": "left",
        "gap": 8,
        "actions": [
          { "code": "back", "label": "返回列表", "icon": "ri-arrow-left-line", "route": "/dashboard/data/views" },
          {
            "code": "refresh",
            "label": "重新载入",
            "icon": "ri-refresh-line"
          },
          {
            "code": "save-view",
            "label": "保存",
            "icon": "ri-save-3-line",
            "directives": [
              { "type": "invokeService", "serviceName": "entityDesign", "serviceMethod": "saveView", "postData": { "id": "{{ forms.entity-view-edit-form.id }}", "code": "{{ forms.entity-view-edit-form.code }}", "schemaName": "{{ forms.entity-view-edit-form.schema_name }}", "viewName": "{{ forms.entity-view-edit-form.view_name }}", "title": "{{ forms.entity-view-edit-form.title }}", "description": "{{ forms.entity-view-edit-form.description }}", "definitionSql": "{{ forms.entity-view-edit-form.definition_sql }}", "metadata": { "columns": "{{ data.editViewColumns }}" } }, "assignTo": "managedView" },
              { "type": "setFormValues", "blockId": "entity-view-edit-form", "mode": "merge", "values": { "id": "{{ data.managedView.id }}", "status": "{{ data.managedView.status }}" } },
              { "type": "navigate", "route": "/dashboard/data/views/edit?id={{ forms.entity-view-edit-form.id }}" },
              { "type": "showMessage", "status": "success", "message": "视图已保存。" }
            ]
          },
          {
            "code": "create-view-from-sql",
            "label": "新增",
            "status": "primary",
            "icon": "ri-add-line",
            "script": "async function main() {\n  const formData = await this.executeAction({\n    node: 'sql-dialog',\n    method: 'open'\n  });\n  if (!formData) return;\n\n  const columns = await this.executeHttp({\n    api: 'analyzeViewSql',\n    method: 'POST',\n    body: { sql: formData.sql }\n  });\n\n  await this.executeAction({\n    node: 'entity-view-edit-form',\n    method: 'setData',\n    data: { definition_sql: formData.sql }\n  });\n\n  await this.executeAction({\n    node: 'entity-view-edit-columns-grid',\n    method: 'reloadData',\n    data: columns\n  });\n}"
          },
          {
            "code": "more",
            "label": "更多",
            "showDropdownIcon": true,
            "children": [
              {
                "code": "validate",
                "label": "验证 SQL",
                "icon": "ri-check-double-line",
                "directives": [
                  { "type": "invokeService", "serviceName": "entityDesign", "serviceMethod": "validateView", "postData": { "definitionSql": "{{ forms.entity-view-edit-form.definition_sql }}" }, "assignTo": "viewValidation" },
                  { "type": "showMessage", "status": "success", "message": "SQL 验证通过。" }
                ]
              },
              {
                "code": "publish",
                "label": "发布视图",
                "icon": "ri-rocket-line",
                "directives": [
                  { "type": "invokeService", "serviceName": "entityDesign", "serviceMethod": "saveView", "postData": { "id": "{{ forms.entity-view-edit-form.id }}", "code": "{{ forms.entity-view-edit-form.code }}", "schemaName": "{{ forms.entity-view-edit-form.schema_name }}", "viewName": "{{ forms.entity-view-edit-form.view_name }}", "title": "{{ forms.entity-view-edit-form.title }}", "description": "{{ forms.entity-view-edit-form.description }}", "definitionSql": "{{ forms.entity-view-edit-form.definition_sql }}", "metadata": { "columns": "{{ data.editViewColumns }}" } }, "assignTo": "managedView" },
                  { "type": "setFormValues", "blockId": "entity-view-edit-form", "mode": "merge", "values": { "id": "{{ data.managedView.id }}", "status": "{{ data.managedView.status }}" } },
                  { "type": "invokeService", "serviceName": "entityDesign", "serviceMethod": "publishView", "postData": { "id": "{{ forms.entity-view-edit-form.id }}" }, "assignTo": "managedView" },
                  { "type": "setFormField", "blockId": "entity-view-edit-form", "field": "status", "value": "published" },
                  { "type": "navigate", "route": "/dashboard/data/views/edit?id={{ forms.entity-view-edit-form.id }}" },
                  { "type": "showMessage", "status": "success", "message": "视图已发布。" }
                ]
              },
              {
                "code": "archive",
                "label": "归档",
                "icon": "ri-archive-line",
                "directives": [
                  { "type": "invokeService", "serviceName": "entityDesign", "serviceMethod": "archiveView", "postData": { "id": "{{ forms.entity-view-edit-form.id }}" }, "assignTo": "managedView" },
                  { "type": "setFormField", "blockId": "entity-view-edit-form", "field": "status", "value": "archived" },
                  { "type": "showMessage", "status": "success", "message": "视图已归档，数据库对象已移除。" }
                ]
              },
              {
                "code": "delete",
                "label": "删除",
                "icon": "ri-delete-bin-line",
                "directives": [
                  {
                    "type": "openGlobalDialog",
                    "config": {
                      "title": "删除视图",
                      "width": 460,
                      "showFooter": true,
                      "content": { "type": "container", "tag": "p", "props": { "textContent": "删除后会同时移除数据库视图和元数据，且不能恢复。" } },
                      "actions": [
                        { "code": "cancel", "label": "取消", "role": "cancel" },
                        { "code": "confirm", "label": "确认删除", "role": "confirm", "status": "danger" }
                      ]
                    },
                    "confirmDirectives": [
                      { "type": "invokeService", "serviceName": "entityDesign", "serviceMethod": "deleteView", "postData": { "id": "{{ forms.entity-view-edit-form.id }}" } },
                      { "type": "navigate", "route": "/dashboard/data/views" }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "id": "entity-view-edit-tabs",
        "kind": "tabs",
        "defaultKey": "basic",
        "tabs": [
          {
            "key": "basic",
            "label": "基础信息",
            "blocks": [
              {
                "id": "entity-view-edit-form",
                "kind": "form",
                "title": "视图信息",
                "sourceKey": "managedView",
                "submitSourceKey": "managedView",
                "initialValues": {
                  "id": "",
                  "code": "",
                  "schema_name": "public",
                  "view_name": "",
                  "title": "",
                  "description": "",
                  "definition_sql": "",
                  "status": "draft"
                },
                "schema": {
                  "columns": 4,
                  "fields": [
                    { "field": "title", "label": "视图名称", "component": "vxe-input", "span": 1, "props": { "maxlength": 120, "clearable": true, "placeholder": "请输入视图名称" }, "rules": [{ "required": true, "message": "请输入视图名称" }] },
                    { "field": "code", "label": "视图编码", "component": "vxe-input", "span": 1, "props": { "maxlength": 63, "clearable": true, "placeholder": "例如 sales_order_summary" }, "rules": [{ "required": true, "message": "请输入视图编码" }] },
                    { "field": "status", "label": "状态", "component": "vxe-select", "span": 1, "props": { "disabled": true }, "options": [{ "label": "草稿", "value": "draft" }, { "label": "已发布", "value": "published" }, { "label": "已归档", "value": "archived" }] },
                    { "field": "schema_name", "label": "Schema", "component": "vxe-input", "props": { "disabled": true } },
                    { "field": "view_name", "label": "数据库视图名", "component": "vxe-input", "span": 2, "props": { "maxlength": 63, "clearable": true, "placeholder": "仅允许字母、数字和下划线" }, "rules": [{ "required": true, "message": "请输入数据库视图名" }] },
                    { "field": "definition_sql", "label": "SELECT 定义", "component": "lc-monaco-editor", "span": 2, "help": "只允许单条 SELECT 或 WITH 查询；发布时使用 security_invoker=true 创建视图。", "props": { "dialog": true, "language": "sql", "dialogTitle": "编辑 SELECT 定义", "editorHeight": "min(480px, calc(100vh - 250px))", "placeholder": "select ..." }, "rules": [{ "required": true, "message": "请输入 SELECT 定义" }] },
                    { "field": "description", "label": "说明", "component": "vxe-input", "span": 4, "props": { "maxlength": 500, "clearable": true, "placeholder": "说明该视图的业务用途" } }
                  ],
                  "layout": [
                    {
                      "kind": "row",
                      "columns": [
                        { "span": 6, "blocks": [{ "kind": "field", "field": "title" }] },
                        { "span": 6, "blocks": [{ "kind": "field", "field": "code" }] },
                        { "span": 6, "blocks": [{ "kind": "field", "field": "status" }] },
                        { "span": 6, "blocks": [{ "kind": "field", "field": "schema_name" }] }
                      ]
                    },
                    {
                      "kind": "row",
                      "columns": [
                        { "span": 12, "blocks": [{ "kind": "field", "field": "view_name" }] },
                        { "span": 12, "blocks": [{ "kind": "field", "field": "definition_sql" }] }
                      ]
                    },
                    { "kind": "field", "field": "description" }
                  ],
                  "actions": []
                }
              }
            ]
          }
        ]
      },
      {
        "id": "entity-view-columns-tabs",
        "kind": "tabs",
        "defaultKey": "columns",
        "tabs": [
          {
            "key": "columns",
            "label": "视图字段",
            "blocks": [
              {
                "id": "entity-view-edit-columns-grid",
                "kind": "grid",
                "title": "视图字段",
                "sourceKey": "editViewColumns",
                "schema": {
                  "grid": {
                    "border": true,
                    "stripe": true,
                    "showOverflow": "tooltip",
                    "height": "360px",
                    "rowConfig": { "keyField": "column_name", "isCurrent": true },
                    "columns": [
                      { "field": "ordinal_position", "title": "序号", "width": 72, "align": "right" },
                      { "field": "column_name", "title": "字段名", "minWidth": 220, "fixed": "left" },
                      { "field": "data_type", "title": "数据类型", "minWidth": 180 },
                      { "field": "udt_name", "title": "底层类型", "minWidth": 160 },
                      { "field": "is_nullable", "title": "可空", "width": 96, "align": "center", "formatter": { "type": "enum", "map": { "YES": "是", "NO": "否" }, "emptyText": "-" } }
                    ]
                  },
                  "rowActions": { "edit": false, "delete": false }
                }
              }
            ]
          }
        ]
      }
    ],
    "overlays": [
      {
        "id": "sql-dialog",
        "kind": "modal",
        "title": "新增视图",
        "width": 860,
        "open": false,
        "resultNode": "sql-dialog-form",
        "confirmLabel": "分析 SQL",
        "cancelLabel": "取消",
        "blocks": [
          {
            "id": "sql-dialog-form",
            "kind": "form",
            "initialValues": { "sql": "select 1::integer as id" },
            "schema": {
              "columns": 1,
              "fields": [
                {
                  "field": "sql",
                  "label": "SELECT SQL",
                  "component": "lc-monaco-editor",
                  "span": 1,
                  "props": {
                    "language": "sql",
                    "height": "360px",
                    "minHeight": "260px",
                    "placeholder": "select ..."
                  },
                  "rules": [
                    { "required": true, "message": "请输入 SELECT SQL" }
                  ]
                }
              ],
              "actions": []
            }
          }
        ],
        "overlays": []
      }
    ]
  }
  $json$::jsonb,
  1,
  timezone('utc'::text, now())
)
on conflict (code) do update set
  route = excluded.route,
  title = excluded.title,
  description = excluded.description,
  page_type = excluded.page_type,
  layout = excluded.layout,
  status = excluded.status,
  keep_alive = excluded.keep_alive,
  schema = excluded.schema,
  version = public.lowcode_pages.version + 1,
  published_at = timezone('utc'::text, now()),
  updated_at = timezone('utc'::text, now());

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'entity-views-edit'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

update public.lowcode_pages list_page
set edit_page_id = edit_page.id,
    updated_at = timezone('utc'::text, now())
from public.lowcode_pages edit_page
where list_page.code = 'entity-views'
  and edit_page.code = 'entity-views-edit'
  and list_page.edit_page_id is distinct from edit_page.id;

insert into public.admin_entities (
  code, title, table_name, route_path, page_code, icon, description,
  primary_key, status, sort_order, schema
) values (
  'entity_design_views',
  U&'\89C6\56FE\7BA1\7406',
  'public.entity_design_views',
  '/dashboard/data/views',
  'entity-views',
  'ri-eye-2-line',
  'Managed PostgreSQL view definitions.',
  'id',
  'active',
  56,
  '{"readPermissions":["entity.views.manage"]}'::jsonb
)
on conflict (code) do update set
  title = excluded.title,
  table_name = excluded.table_name,
  route_path = excluded.route_path,
  page_code = excluded.page_code,
  icon = excluded.icon,
  description = excluded.description,
  primary_key = excluded.primary_key,
  status = excluded.status,
  sort_order = excluded.sort_order,
  schema = excluded.schema,
  updated_at = timezone('utc'::text, now());

insert into public.admin_routes (
  code, title, path, parent_id, route_type, icon, page_code, permission_code,
  visible, keep_alive, layout, status, sort_order, metadata
)
select
  'entity-views',
  U&'\89C6\56FE\7BA1\7406',
  '/dashboard/data/views',
  business_root.id,
  'page',
  'ri-eye-2-line',
  'entity-views',
  'entity.views.manage',
  true,
  true,
  'dashboard',
  'active',
  24,
  '{"group":"data-management","navigation":"sidebar"}'::jsonb
from public.admin_routes business_root
where business_root.code = 'business-root'
on conflict (code) do update set
  title = excluded.title,
  path = excluded.path,
  parent_id = excluded.parent_id,
  route_type = excluded.route_type,
  icon = excluded.icon,
  page_code = excluded.page_code,
  permission_code = excluded.permission_code,
  visible = excluded.visible,
  keep_alive = excluded.keep_alive,
  layout = excluded.layout,
  status = excluded.status,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = timezone('utc'::text, now());

select pg_notify('pgrst', 'reload schema');
