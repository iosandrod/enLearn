-- Move entity designer SQL behind authenticated Supabase RPC functions.
-- Metadata functions are security invoker so their reads and writes remain subject to RLS.
-- Only the narrowly-scoped DDL helpers are security definer functions.

drop policy if exists "Admin users can manage entity design tables"
  on public.entity_design_tables;
drop policy if exists "Admin users can manage entity design columns"
  on public.entity_design_columns;
drop policy if exists "Admin users can manage entity design relations"
  on public.entity_design_relations;
drop policy if exists "Entity design managers can manage entity design tables"
  on public.entity_design_tables;
drop policy if exists "Entity design managers can manage entity design columns"
  on public.entity_design_columns;
drop policy if exists "Entity design managers can manage entity design relations"
  on public.entity_design_relations;

create policy "Entity design managers can manage entity design tables"
on public.entity_design_tables
for all
to authenticated
using (
  public.has_app_permission('entity.design.manage')
  or public.has_app_permission('admin.entities.manage')
)
with check (
  public.has_app_permission('entity.design.manage')
  or public.has_app_permission('admin.entities.manage')
);

create policy "Entity design managers can manage entity design columns"
on public.entity_design_columns
for all
to authenticated
using (
  public.has_app_permission('entity.design.manage')
  or public.has_app_permission('admin.entities.manage')
)
with check (
  public.has_app_permission('entity.design.manage')
  or public.has_app_permission('admin.entities.manage')
);

create policy "Entity design managers can manage entity design relations"
on public.entity_design_relations
for all
to authenticated
using (
  public.has_app_permission('entity.design.manage')
  or public.has_app_permission('admin.entities.manage')
)
with check (
  public.has_app_permission('entity.design.manage')
  or public.has_app_permission('admin.entities.manage')
);

grant select, insert, update, delete on public.entity_design_tables to authenticated;
grant select, insert, update, delete on public.entity_design_columns to authenticated;
grant select, insert, update, delete on public.entity_design_relations to authenticated;

create schema if not exists entity_design_private;
revoke all on schema entity_design_private from public;
revoke usage on schema entity_design_private from anon, authenticated, service_role;
grant usage on schema entity_design_private to authenticated;

create or replace function entity_design_private.assert_manage_permission()
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

  if not (
    public.has_app_permission('entity.design.manage')
    or public.has_app_permission('admin.entities.manage')
  ) then
    raise exception 'Entity design permission required.' using errcode = '42501';
  end if;
end;
$function$;

create or replace function entity_design_private.assert_identifier(
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

create or replace function entity_design_private.assert_relation(
  p_schema_name text,
  p_table_name text
)
returns void
language plpgsql
security invoker
immutable
set search_path = pg_catalog
as $function$
begin
  perform entity_design_private.assert_identifier(p_schema_name, 'schemaName');
  perform entity_design_private.assert_identifier(p_table_name, 'tableName');

  if p_schema_name <> 'public' then
    raise exception 'Only tables in the public schema can be managed.'
      using errcode = '22023';
  end if;

  if p_table_name in (
    'entity_design_tables',
    'entity_design_columns',
    'entity_design_relations',
    'schema_migrations'
  ) then
    raise exception 'Table public.% is protected from entity designer DDL.', p_table_name
      using errcode = '42501';
  end if;
end;
$function$;

create or replace function entity_design_private.normalize_default_expression(
  p_default_value text,
  p_data_type text
)
returns text
language plpgsql
security invoker
immutable
set search_path = pg_catalog
as $function$
declare
  v_value text := pg_catalog.btrim(p_default_value);
  v_literal text;
  v_json jsonb;
begin
  if v_value is null or v_value = '' then
    return null;
  end if;

  if pg_catalog.lower(v_value) = 'null' then
    return 'null';
  end if;

  if p_data_type in ('text', 'varchar') then
    if v_value !~ $re$^'(?:[^']|'')*'$$re$ then
      raise exception 'Text defaults must be single-quoted literals.'
        using errcode = '22023';
    end if;
    v_literal := pg_catalog.replace(
      pg_catalog.substr(v_value, 2, pg_catalog.length(v_value) - 2),
      '''''',
      ''''
    );
    return pg_catalog.format('%L', v_literal);
  end if;

  if p_data_type = 'uuid' then
    if pg_catalog.lower(v_value) = 'gen_random_uuid()' then
      return 'gen_random_uuid()';
    end if;
    if v_value ~ $re$^'(?:[^']|'')*'$$re$ then
      v_literal := pg_catalog.replace(
        pg_catalog.substr(v_value, 2, pg_catalog.length(v_value) - 2),
        '''''',
        ''''
      );
    else
      v_literal := v_value;
    end if;
    begin
      perform v_literal::uuid;
    exception when others then
      raise exception 'UUID default must be gen_random_uuid() or a UUID literal.'
        using errcode = '22023';
    end;
    return pg_catalog.format('%L::uuid', v_literal);
  end if;

  if p_data_type in ('integer', 'bigint', 'numeric') then
    if v_value !~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$' then
      raise exception 'Numeric defaults must be numeric literals.'
        using errcode = '22023';
    end if;
    return v_value;
  end if;

  if p_data_type = 'boolean' then
    if pg_catalog.lower(v_value) not in ('true', 'false') then
      raise exception 'Boolean defaults must be true or false.'
        using errcode = '22023';
    end if;
    return pg_catalog.lower(v_value);
  end if;

  if p_data_type = 'date' then
    if pg_catalog.lower(v_value) = 'current_date' then
      return 'current_date';
    end if;
    if v_value !~ $re$^'(?:[^']|'')*'$$re$ then
      raise exception 'Date defaults must be current_date or a single-quoted date.'
        using errcode = '22023';
    end if;
    v_literal := pg_catalog.replace(
      pg_catalog.substr(v_value, 2, pg_catalog.length(v_value) - 2),
      '''''',
      ''''
    );
    begin
      perform v_literal::date;
    exception when others then
      raise exception 'Date default is invalid.' using errcode = '22023';
    end;
    return pg_catalog.format('%L::date', v_literal);
  end if;

  if p_data_type = 'timestamptz' then
    if pg_catalog.lower(v_value) in ('now()', 'transaction_timestamp()') then
      return 'now()';
    end if;
    if pg_catalog.lower(v_value) = 'current_timestamp' then
      return 'current_timestamp';
    end if;
    if pg_catalog.lower(v_value) = 'timezone(''utc''::text, now())' then
      return 'timezone(''utc''::text, now())';
    end if;
    if v_value !~ $re$^'(?:[^']|'')*'$$re$ then
      raise exception 'Timestamp defaults must be a supported time function or a single-quoted timestamp.'
        using errcode = '22023';
    end if;
    v_literal := pg_catalog.replace(
      pg_catalog.substr(v_value, 2, pg_catalog.length(v_value) - 2),
      '''''',
      ''''
    );
    begin
      perform v_literal::timestamp with time zone;
    exception when others then
      raise exception 'Timestamp default is invalid.' using errcode = '22023';
    end;
    return pg_catalog.format('%L::timestamptz', v_literal);
  end if;

  if p_data_type = 'jsonb' then
    if v_value ~* $re$^'(?:[^']|'')*'::jsonb$$re$ then
      v_literal := pg_catalog.replace(
        pg_catalog.substr(v_value, 2, pg_catalog.length(v_value) - 9),
        '''''',
        ''''
      );
    else
      v_literal := v_value;
    end if;
    begin
      v_json := v_literal::jsonb;
    exception when others then
      raise exception 'JSONB default must be valid JSON.' using errcode = '22023';
    end;
    return pg_catalog.format('%L::jsonb', v_json::text);
  end if;

  raise exception 'Unsupported data type: %.', p_data_type using errcode = '22023';
end;
$function$;

create or replace function entity_design_private.resolve_table(p_payload jsonb)
returns public.entity_design_tables
language plpgsql
security invoker
stable
set search_path = pg_catalog
as $function$
declare
  v_table public.entity_design_tables%rowtype;
  v_schema_name text;
  v_table_name text;
begin
  perform entity_design_private.assert_manage_permission();

  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'A table selector is required.' using errcode = '22023';
  end if;

  if nullif(p_payload->>'table_id', '') is not null then
    select *
      into v_table
      from public.entity_design_tables
     where id = (p_payload->>'table_id')::uuid;
  elsif nullif(p_payload->>'table_code', '') is not null then
    select *
      into v_table
      from public.entity_design_tables
     where code = p_payload->>'table_code';
  elsif nullif(p_payload->>'table_name', '') is not null then
    v_schema_name := coalesce(
      nullif(p_payload->>'schema_name', ''),
      'public'
    );
    v_table_name := p_payload->>'table_name';
    perform entity_design_private.assert_relation(v_schema_name, v_table_name);
    select *
      into v_table
      from public.entity_design_tables
     where schema_name = v_schema_name
       and table_name = v_table_name;
  else
    raise exception 'tableId, tableCode, or tableName is required.'
      using errcode = '22023';
  end if;

  if not found then
    raise exception 'Entity design table not found.' using errcode = 'P0002';
  end if;

  perform entity_design_private.assert_relation(v_table.schema_name, v_table.table_name);
  return v_table;
end;
$function$;

create or replace function entity_design_private.create_table(
  p_schema_name text,
  p_table_name text,
  p_primary_key text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, extensions
as $function$
begin
  perform entity_design_private.assert_manage_permission();
  perform entity_design_private.assert_relation(p_schema_name, p_table_name);
  perform entity_design_private.assert_identifier(p_primary_key, 'primaryKey');

  execute pg_catalog.format(
    'create table if not exists %I.%I (
       %I uuid primary key default gen_random_uuid(),
       created_at timestamp with time zone not null default timezone(''utc''::text, now()),
       updated_at timestamp with time zone not null default timezone(''utc''::text, now())
     )',
    p_schema_name,
    p_table_name,
    p_primary_key
  );
end;
$function$;

create or replace function entity_design_private.add_column(
  p_schema_name text,
  p_table_name text,
  p_column_name text,
  p_data_type text,
  p_default_value text,
  p_is_required boolean,
  p_is_primary_key boolean,
  p_is_unique boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, extensions
as $function$
declare
  v_type_sql text;
  v_default_sql text;
  v_sql text;
begin
  perform entity_design_private.assert_manage_permission();
  perform entity_design_private.assert_relation(p_schema_name, p_table_name);
  perform entity_design_private.assert_identifier(p_column_name, 'columnName');

  v_type_sql := case p_data_type
    when 'uuid' then 'uuid'
    when 'text' then 'text'
    when 'varchar' then 'varchar(255)'
    when 'integer' then 'integer'
    when 'bigint' then 'bigint'
    when 'numeric' then 'numeric'
    when 'boolean' then 'boolean'
    when 'date' then 'date'
    when 'timestamptz' then 'timestamp with time zone'
    when 'jsonb' then 'jsonb'
    else null
  end;
  if v_type_sql is null then
    raise exception 'Unsupported data type: %.', p_data_type using errcode = '22023';
  end if;

  if pg_catalog.to_regclass(pg_catalog.format('%I.%I', p_schema_name, p_table_name)) is null then
    raise exception 'Physical table %.% was not found.', p_schema_name, p_table_name
      using errcode = 'P0002';
  end if;

  v_default_sql := entity_design_private.normalize_default_expression(
    p_default_value,
    p_data_type
  );
  v_sql := pg_catalog.format(
    'alter table %I.%I add column if not exists %I %s',
    p_schema_name,
    p_table_name,
    p_column_name,
    v_type_sql
  );
  if v_default_sql is not null then
    v_sql := v_sql || ' default ' || v_default_sql;
  end if;
  if coalesce(p_is_required, false)
     or coalesce(p_is_primary_key, false) then
    v_sql := v_sql || ' not null';
  end if;
  if coalesce(p_is_unique, false)
     and not coalesce(p_is_primary_key, false) then
    v_sql := v_sql || ' unique';
  end if;

  execute v_sql;
end;
$function$;

create or replace function entity_design_private.drop_table(
  p_schema_name text,
  p_table_name text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform entity_design_private.assert_manage_permission();
  perform entity_design_private.assert_relation(p_schema_name, p_table_name);
  execute pg_catalog.format(
    'drop table if exists %I.%I cascade',
    p_schema_name,
    p_table_name
  );
end;
$function$;

create or replace function entity_design_private.drop_column(
  p_schema_name text,
  p_table_name text,
  p_column_name text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform entity_design_private.assert_manage_permission();
  perform entity_design_private.assert_relation(p_schema_name, p_table_name);
  perform entity_design_private.assert_identifier(p_column_name, 'columnName');

  if pg_catalog.to_regclass(pg_catalog.format('%I.%I', p_schema_name, p_table_name)) is null then
    raise exception 'Physical table %.% was not found.', p_schema_name, p_table_name
      using errcode = 'P0002';
  end if;

  execute pg_catalog.format(
    'alter table %I.%I drop column if exists %I cascade',
    p_schema_name,
    p_table_name,
    p_column_name
  );
end;
$function$;

create or replace function entity_design_private.add_foreign_key(
  p_source_schema text,
  p_source_table text,
  p_source_column text,
  p_target_schema text,
  p_target_table text,
  p_target_column text,
  p_constraint_name text,
  p_on_delete text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_on_delete_sql text;
begin
  perform entity_design_private.assert_manage_permission();
  perform entity_design_private.assert_relation(p_source_schema, p_source_table);
  perform entity_design_private.assert_relation(p_target_schema, p_target_table);
  perform entity_design_private.assert_identifier(p_source_column, 'sourceColumnName');
  perform entity_design_private.assert_identifier(p_target_column, 'targetColumnName');
  perform entity_design_private.assert_identifier(p_constraint_name, 'constraintName');

  v_on_delete_sql := case pg_catalog.lower(p_on_delete)
    when 'no action' then 'no action'
    when 'restrict' then 'restrict'
    when 'cascade' then 'cascade'
    when 'set null' then 'set null'
    else null
  end;
  if v_on_delete_sql is null then
    raise exception 'Unsupported ON DELETE action: %.', p_on_delete
      using errcode = '22023';
  end if;

  if pg_catalog.to_regclass(pg_catalog.format('%I.%I', p_source_schema, p_source_table)) is null
     or pg_catalog.to_regclass(pg_catalog.format('%I.%I', p_target_schema, p_target_table)) is null then
    raise exception 'A physical relation table was not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint constraints
      join pg_catalog.pg_class tables
        on tables.oid = constraints.conrelid
      join pg_catalog.pg_namespace namespaces
        on namespaces.oid = tables.relnamespace
     where namespaces.nspname = p_source_schema
       and tables.relname = p_source_table
       and constraints.conname = p_constraint_name
  ) then
    execute pg_catalog.format(
      'alter table %I.%I
         add constraint %I
         foreign key (%I)
         references %I.%I (%I)
         on delete %s',
      p_source_schema,
      p_source_table,
      p_constraint_name,
      p_source_column,
      p_target_schema,
      p_target_table,
      p_target_column,
      v_on_delete_sql
    );
  end if;
end;
$function$;

create or replace function public.entity_design_list()
returns jsonb
language plpgsql
security invoker
stable
set search_path = pg_catalog
as $function$
declare
  v_result jsonb;
begin
  perform entity_design_private.assert_manage_permission();

  select pg_catalog.jsonb_build_object(
    'tables',
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(design_table)
        || pg_catalog.jsonb_build_object(
          'full_name', design_table.schema_name || '.' || design_table.table_name,
          'columns', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.to_jsonb(design_column)
              order by design_column.sort_order, design_column.created_at
            )
              from public.entity_design_columns design_column
             where design_column.table_id = design_table.id
          ), '[]'::jsonb),
          'physical_columns', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'table_schema', physical_column.table_schema,
                'table_name', physical_column.table_name,
                'column_name', physical_column.column_name,
                'data_type', physical_column.data_type,
                'is_nullable', physical_column.is_nullable,
                'column_default', physical_column.column_default,
                'ordinal_position', physical_column.ordinal_position
              )
              order by physical_column.ordinal_position
            )
              from information_schema.columns physical_column
             where physical_column.table_schema = design_table.schema_name
               and physical_column.table_name = design_table.table_name
          ), '[]'::jsonb)
        )
        order by design_table.position_y, design_table.position_x, design_table.created_at
      )
        from public.entity_design_tables design_table
    ), '[]'::jsonb),
    'relations',
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(design_relation)
        order by design_relation.created_at
      )
        from public.entity_design_relations design_relation
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

create or replace function public.entity_design_list_physical_tables()
returns jsonb
language plpgsql
security invoker
stable
set search_path = pg_catalog
as $function$
declare
  v_result jsonb;
begin
  perform entity_design_private.assert_manage_permission();

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'schemaName', physical_table.table_schema,
        'tableName', physical_table.table_name,
        'fullName', physical_table.table_schema || '.' || physical_table.table_name,
        'title', coalesce(
          nullif(metadata.title, ''),
          pg_catalog.initcap(pg_catalog.replace(physical_table.table_name, '_', ' '))
        ),
        'existsInMetadata', metadata.id is not null,
        'tableId', metadata.id,
        'columnCount', coalesce(column_counts.column_count, 0)
      )
      order by physical_table.table_schema, physical_table.table_name
    ),
    '[]'::jsonb
  ) into v_result
  from information_schema.tables physical_table
  left join (
    select table_schema, table_name, pg_catalog.count(*)::integer as column_count
      from information_schema.columns
     where table_schema = 'public'
     group by table_schema, table_name
  ) column_counts
    on column_counts.table_schema = physical_table.table_schema
   and column_counts.table_name = physical_table.table_name
  left join public.entity_design_tables metadata
    on metadata.schema_name = physical_table.table_schema
   and metadata.table_name = physical_table.table_name
  where physical_table.table_schema = 'public'
    and physical_table.table_type = 'BASE TABLE'
    and physical_table.table_name not in (
      'entity_design_tables',
      'entity_design_columns',
      'entity_design_relations',
      'schema_migrations'
    );

  return v_result;
end;
$function$;

create or replace function public.entity_design_sync_physical_columns(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_table public.entity_design_tables%rowtype;
  v_column record;
  v_columns jsonb;
  v_data_type text;
  v_default_value text;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_affected integer;
begin
  perform entity_design_private.assert_manage_permission();
  v_table := entity_design_private.resolve_table(p_payload);

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'table_schema', physical_column.table_schema,
        'table_name', physical_column.table_name,
        'column_name', physical_column.column_name,
        'data_type', physical_column.data_type,
        'udt_name', physical_column.udt_name,
        'is_nullable', physical_column.is_nullable,
        'column_default', physical_column.column_default,
        'ordinal_position', physical_column.ordinal_position
      )
      order by physical_column.ordinal_position
    ),
    '[]'::jsonb
  ) into v_columns
  from information_schema.columns physical_column
  where physical_column.table_schema = v_table.schema_name
    and physical_column.table_name = v_table.table_name;

  if pg_catalog.jsonb_array_length(v_columns) = 0 then
    raise exception 'Physical table %.% was not found.', v_table.schema_name, v_table.table_name
      using errcode = 'P0002';
  end if;

  for v_column in
    select
      physical_column.column_name,
      physical_column.data_type,
      physical_column.udt_name,
      physical_column.is_nullable,
      physical_column.column_default,
      physical_column.ordinal_position
    from information_schema.columns physical_column
    where physical_column.table_schema = v_table.schema_name
      and physical_column.table_name = v_table.table_name
    order by physical_column.ordinal_position
  loop
    v_data_type := case
      when pg_catalog.lower(v_column.data_type) = 'uuid'
        or pg_catalog.lower(v_column.udt_name) = 'uuid' then 'uuid'
      when pg_catalog.lower(v_column.data_type) in ('character varying', 'varchar') then 'varchar'
      when pg_catalog.lower(v_column.data_type) in ('integer', 'int4')
        or pg_catalog.lower(v_column.udt_name) = 'int4' then 'integer'
      when pg_catalog.lower(v_column.data_type) in ('bigint', 'int8')
        or pg_catalog.lower(v_column.udt_name) = 'int8' then 'bigint'
      when pg_catalog.lower(v_column.data_type) in (
        'numeric', 'decimal', 'double precision', 'real'
      ) then 'numeric'
      when pg_catalog.lower(v_column.data_type) = 'boolean'
        or pg_catalog.lower(v_column.udt_name) = 'bool' then 'boolean'
      when pg_catalog.lower(v_column.data_type) = 'date' then 'date'
      when pg_catalog.lower(v_column.data_type) like 'timestamp%' then 'timestamptz'
      when pg_catalog.lower(v_column.data_type) in ('json', 'jsonb')
        or pg_catalog.lower(v_column.udt_name) = 'jsonb' then 'jsonb'
      else 'text'
    end;
    v_default_value := case
      when v_column.column_default is null then null
      when v_column.column_default ~ ';'
        or v_column.column_default ~ '--|/\*' then null
      else v_column.column_default
    end;

    insert into public.entity_design_columns (
      table_id,
      column_name,
      label,
      data_type,
      storage_kind,
      expression,
      is_required,
      is_primary_key,
      is_unique,
      default_value,
      sort_order,
      status,
      metadata,
      created_by,
      updated_by
    ) values (
      v_table.id,
      v_column.column_name,
      v_column.column_name,
      v_data_type,
      'physical',
      null,
      v_column.is_nullable = 'NO',
      v_column.column_name = v_table.primary_key,
      false,
      v_default_value,
      v_column.ordinal_position * 10,
      'active',
      '{}'::jsonb,
      auth.uid(),
      auth.uid()
    )
    on conflict (table_id, column_name) do nothing;

    get diagnostics v_affected = row_count;
    if v_affected > 0 then
      v_inserted := v_inserted + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'tableId', v_table.id,
    'tableName', v_table.schema_name || '.' || v_table.table_name,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'columns', v_columns
  );
end;
$function$;

create or replace function public.entity_design_sync_physical_tables(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_entry record;
  v_table public.entity_design_tables%rowtype;
  v_schema_name text;
  v_table_name text;
  v_primary_key text;
  v_created boolean;
  v_sync jsonb;
  v_loaded jsonb := '[]'::jsonb;
  v_imported integer := 0;
  v_existing integer := 0;
begin
  perform entity_design_private.assert_manage_permission();
  if p_payload is null
     or pg_catalog.jsonb_typeof(p_payload->'tables') <> 'array'
     or pg_catalog.jsonb_array_length(p_payload->'tables') = 0 then
    raise exception 'tables is required.' using errcode = '22023';
  end if;

  for v_entry in
    select item.value, item.ordinality
      from pg_catalog.jsonb_array_elements(p_payload->'tables')
        with ordinality as item(value, ordinality)
  loop
    if pg_catalog.jsonb_typeof(v_entry.value) <> 'object' then
      raise exception 'Each tables item must be an object.' using errcode = '22023';
    end if;
    v_schema_name := coalesce(
      nullif(v_entry.value->>'schema_name', ''),
      'public'
    );
    v_table_name := nullif(v_entry.value->>'table_name', '');
    perform entity_design_private.assert_relation(v_schema_name, v_table_name);

    if not exists (
      select 1
        from information_schema.columns physical_column
       where physical_column.table_schema = v_schema_name
         and physical_column.table_name = v_table_name
    ) then
      raise exception 'Physical table %.% was not found.', v_schema_name, v_table_name
        using errcode = 'P0002';
    end if;

    select *
      into v_table
      from public.entity_design_tables design_table
     where design_table.schema_name = v_schema_name
       and design_table.table_name = v_table_name;
    v_created := not found;

    select key_usage.column_name
      into v_primary_key
      from information_schema.table_constraints constraints
      join information_schema.key_column_usage key_usage
        on key_usage.constraint_schema = constraints.constraint_schema
       and key_usage.constraint_name = constraints.constraint_name
       and key_usage.table_schema = constraints.table_schema
       and key_usage.table_name = constraints.table_name
     where constraints.table_schema = v_schema_name
       and constraints.table_name = v_table_name
       and constraints.constraint_type = 'PRIMARY KEY'
     order by key_usage.ordinal_position
     limit 1;
    v_primary_key := coalesce(
      nullif(v_primary_key, ''),
      'id'
    );
    perform entity_design_private.assert_identifier(v_primary_key, 'primaryKey');

    insert into public.entity_design_tables (
      code,
      schema_name,
      table_name,
      title,
      primary_key,
      status,
      position_x,
      position_y,
      metadata,
      created_by,
      updated_by
    ) values (
      v_table_name,
      v_schema_name,
      v_table_name,
      pg_catalog.initcap(pg_catalog.replace(v_table_name, '_', ' ')),
      v_primary_key,
      'active',
      100 + (v_entry.ordinality - 1) * 340,
      120 + (v_entry.ordinality - 1) * 40,
      '{}'::jsonb,
      auth.uid(),
      auth.uid()
    )
    on conflict (schema_name, table_name) do update set
      title = coalesce(
        nullif(public.entity_design_tables.title, ''),
        excluded.title
      ),
      primary_key = coalesce(
        nullif(public.entity_design_tables.primary_key, ''),
        excluded.primary_key
      ),
      updated_by = excluded.updated_by,
      updated_at = pg_catalog.timezone('utc'::text, pg_catalog.now())
    returning * into v_table;

    if v_created then
      v_imported := v_imported + 1;
    else
      v_existing := v_existing + 1;
    end if;

    v_sync := public.entity_design_sync_physical_columns(
      pg_catalog.jsonb_build_object('table_id', v_table.id)
    );
    v_loaded := v_loaded || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'tableId', v_table.id,
        'schemaName', v_table.schema_name,
        'tableName', v_table.table_name,
        'fullName', v_table.schema_name || '.' || v_table.table_name,
        'created', v_created,
        'insertedColumns', (v_sync->>'inserted')::integer,
        'skippedColumns', (v_sync->>'skipped')::integer
      )
    );
  end loop;

  return pg_catalog.jsonb_build_object(
    'imported', v_imported,
    'existing', v_existing,
    'tables', v_loaded
  );
end;
$function$;

create or replace function public.entity_design_save_table(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_table public.entity_design_tables%rowtype;
  v_code text;
  v_schema_name text;
  v_table_name text;
  v_title text;
  v_primary_key text;
  v_status text;
  v_metadata jsonb;
  v_create_physical boolean;
begin
  perform entity_design_private.assert_manage_permission();
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Table payload is required.' using errcode = '22023';
  end if;

  v_code := nullif(p_payload->>'code', '');
  v_schema_name := coalesce(
    nullif(p_payload->>'schema_name', ''),
    'public'
  );
  v_table_name := nullif(p_payload->>'table_name', '');
  v_title := coalesce(
    nullif(p_payload->>'title', ''),
    v_table_name
  );
  v_primary_key := coalesce(
    nullif(p_payload->>'primary_key', ''),
    'id'
  );
  v_status := coalesce(
    nullif(p_payload->>'status', ''),
    'active'
  );
  v_metadata := coalesce(p_payload->'metadata', '{}'::jsonb);
  v_create_physical := coalesce(
    (p_payload->>'create_physical')::boolean,
    true
  );

  perform entity_design_private.assert_identifier(v_code, 'code');
  perform entity_design_private.assert_relation(v_schema_name, v_table_name);
  perform entity_design_private.assert_identifier(v_primary_key, 'primaryKey');
  if v_status not in ('active', 'inactive', 'draft', 'archived') then
    raise exception 'Unsupported table status: %.', v_status using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'metadata must be a JSON object.' using errcode = '22023';
  end if;

  if exists (
    select 1
      from public.entity_design_tables design_table
     where design_table.code = v_code
       and (
         design_table.schema_name <> v_schema_name
         or design_table.table_name <> v_table_name
       )
  ) then
    raise exception 'Entity design table code already exists: %.', v_code
      using errcode = '23505';
  end if;

  if v_create_physical then
    perform entity_design_private.create_table(
      v_schema_name,
      v_table_name,
      v_primary_key
    );
  end if;

  insert into public.entity_design_tables (
    code,
    schema_name,
    table_name,
    title,
    description,
    primary_key,
    status,
    position_x,
    position_y,
    metadata,
    created_by,
    updated_by
  ) values (
    v_code,
    v_schema_name,
    v_table_name,
    v_title,
    nullif(p_payload->>'description', ''),
    v_primary_key,
    v_status,
    coalesce((p_payload->>'position_x')::integer, 80),
    coalesce((p_payload->>'position_y')::integer, 80),
    v_metadata,
    auth.uid(),
    auth.uid()
  )
  on conflict (schema_name, table_name) do update set
    code = excluded.code,
    title = excluded.title,
    description = excluded.description,
    primary_key = excluded.primary_key,
    status = excluded.status,
    position_x = excluded.position_x,
    position_y = excluded.position_y,
    metadata = excluded.metadata,
    updated_by = excluded.updated_by,
    updated_at = pg_catalog.timezone('utc'::text, pg_catalog.now())
  returning * into v_table;

  if v_create_physical then
    insert into public.entity_design_columns (
      table_id,
      column_name,
      label,
      data_type,
      storage_kind,
      is_required,
      is_primary_key,
      sort_order,
      created_by,
      updated_by
    ) values (
      v_table.id,
      v_table.primary_key,
      v_table.primary_key,
      'uuid',
      'physical',
      true,
      true,
      0,
      auth.uid(),
      auth.uid()
    )
    on conflict (table_id, column_name) do update set
      is_primary_key = true,
      is_required = true,
      updated_by = excluded.updated_by,
      updated_at = pg_catalog.timezone('utc'::text, pg_catalog.now());
  end if;

  return pg_catalog.to_jsonb(v_table);
end;
$function$;

create or replace function public.entity_design_delete_table(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_table public.entity_design_tables%rowtype;
  v_drop_physical boolean;
begin
  perform entity_design_private.assert_manage_permission();
  v_table := entity_design_private.resolve_table(p_payload);
  v_drop_physical := coalesce(
    (p_payload->>'drop_physical')::boolean,
    false
  );

  if v_drop_physical then
    perform entity_design_private.drop_table(v_table.schema_name, v_table.table_name);
  end if;
  delete from public.entity_design_tables where id = v_table.id;

  return pg_catalog.jsonb_build_object('success', true);
end;
$function$;

create or replace function public.entity_design_save_column(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_table public.entity_design_tables%rowtype;
  v_column public.entity_design_columns%rowtype;
  v_column_name text;
  v_label text;
  v_data_type text;
  v_storage_kind text;
  v_status text;
  v_default_value text;
  v_data_type_config jsonb;
  v_metadata jsonb;
  v_is_required boolean;
  v_is_primary_key boolean;
  v_is_unique boolean;
begin
  perform entity_design_private.assert_manage_permission();
  v_table := entity_design_private.resolve_table(p_payload);
  v_column_name := nullif(p_payload->>'column_name', '');
  v_label := coalesce(
    nullif(p_payload->>'label', ''),
    v_column_name
  );
  v_data_type := coalesce(
    nullif(p_payload->>'data_type', ''),
    'text'
  );
  v_storage_kind := coalesce(
    nullif(p_payload->>'storage_kind', ''),
    'physical'
  );
  v_status := coalesce(
    nullif(p_payload->>'status', ''),
    'active'
  );
  v_default_value := nullif(p_payload->>'default_value', '');
  v_data_type_config := coalesce(
    p_payload->'data_type_config',
    '{}'::jsonb
  );
  v_metadata := coalesce(p_payload->'metadata', '{}'::jsonb);
  v_is_required := coalesce((p_payload->>'is_required')::boolean, false);
  v_is_primary_key := coalesce(
    (p_payload->>'is_primary_key')::boolean,
    false
  );
  v_is_unique := coalesce((p_payload->>'is_unique')::boolean, false);

  perform entity_design_private.assert_identifier(v_column_name, 'columnName');
  if v_data_type not in (
    'uuid', 'text', 'varchar', 'integer', 'bigint', 'numeric',
    'boolean', 'date', 'timestamptz', 'jsonb'
  ) then
    raise exception 'Unsupported data type: %.', v_data_type using errcode = '22023';
  end if;
  if v_storage_kind not in ('physical', 'virtual') then
    raise exception 'Unsupported storage kind: %.', v_storage_kind using errcode = '22023';
  end if;
  if v_status not in ('active', 'inactive', 'draft', 'archived') then
    raise exception 'Unsupported column status: %.', v_status using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(v_data_type_config) <> 'object'
     or pg_catalog.jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'Column configuration and metadata must be JSON objects.'
      using errcode = '22023';
  end if;

  if v_storage_kind = 'physical'
     and not exists (
       select 1
         from information_schema.columns physical_column
        where physical_column.table_schema = v_table.schema_name
          and physical_column.table_name = v_table.table_name
          and physical_column.column_name = v_column_name
     ) then
    perform entity_design_private.add_column(
      v_table.schema_name,
      v_table.table_name,
      v_column_name,
      v_data_type,
      v_default_value,
      v_is_required,
      v_is_primary_key,
      v_is_unique
    );
  end if;

  insert into public.entity_design_columns (
    table_id,
    column_name,
    label,
    data_type,
    data_type_config,
    storage_kind,
    expression,
    is_required,
    is_primary_key,
    is_unique,
    default_value,
    sort_order,
    status,
    metadata,
    created_by,
    updated_by
  ) values (
    v_table.id,
    v_column_name,
    v_label,
    v_data_type,
    v_data_type_config,
    v_storage_kind,
    nullif(p_payload->>'expression', ''),
    v_is_required,
    v_is_primary_key,
    v_is_unique,
    v_default_value,
    coalesce((p_payload->>'sort_order')::integer, 0),
    v_status,
    v_metadata,
    auth.uid(),
    auth.uid()
  )
  on conflict (table_id, column_name) do update set
    label = excluded.label,
    data_type = excluded.data_type,
    data_type_config = excluded.data_type_config,
    storage_kind = excluded.storage_kind,
    expression = excluded.expression,
    is_required = excluded.is_required,
    is_primary_key = excluded.is_primary_key,
    is_unique = excluded.is_unique,
    default_value = excluded.default_value,
    sort_order = excluded.sort_order,
    status = excluded.status,
    metadata = excluded.metadata,
    updated_by = excluded.updated_by,
    updated_at = pg_catalog.timezone('utc'::text, pg_catalog.now())
  returning * into v_column;

  return pg_catalog.to_jsonb(v_column);
end;
$function$;

create or replace function public.entity_design_delete_column(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_table public.entity_design_tables%rowtype;
  v_column_name text;
  v_storage_kind text;
  v_drop_physical boolean;
begin
  perform entity_design_private.assert_manage_permission();
  v_table := entity_design_private.resolve_table(p_payload);
  v_column_name := nullif(p_payload->>'column_name', '');
  perform entity_design_private.assert_identifier(v_column_name, 'columnName');

  if v_column_name = v_table.primary_key then
    raise exception 'Primary key column cannot be deleted.' using errcode = '22023';
  end if;
  v_drop_physical := coalesce(
    (p_payload->>'drop_physical')::boolean,
    true
  );

  select storage_kind
    into v_storage_kind
    from public.entity_design_columns
   where table_id = v_table.id
     and column_name = v_column_name;
  if not found then
    v_storage_kind := 'physical';
  end if;

  if v_drop_physical and v_storage_kind = 'physical' then
    perform entity_design_private.drop_column(
      v_table.schema_name,
      v_table.table_name,
      v_column_name
    );
  end if;

  delete from public.entity_design_columns
   where table_id = v_table.id
     and column_name = v_column_name;
  delete from public.entity_design_relations
   where (source_table_id = v_table.id and source_column_name = v_column_name)
      or (target_table_id = v_table.id and target_column_name = v_column_name);

  return pg_catalog.jsonb_build_object('success', true);
end;
$function$;

create or replace function public.entity_design_save_relation(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  v_source_table public.entity_design_tables%rowtype;
  v_target_table public.entity_design_tables%rowtype;
  v_relation public.entity_design_relations%rowtype;
  v_source_column text;
  v_target_column text;
  v_relation_type text;
  v_on_delete text;
  v_constraint_name text;
  v_constraint_base text;
  v_is_enforced boolean;
  v_metadata jsonb;
begin
  perform entity_design_private.assert_manage_permission();
  if p_payload is null
     or pg_catalog.jsonb_typeof(p_payload->'source_table') <> 'object'
     or pg_catalog.jsonb_typeof(p_payload->'target_table') <> 'object' then
    raise exception 'Source and target table selectors are required.'
      using errcode = '22023';
  end if;

  v_source_table := entity_design_private.resolve_table(p_payload->'source_table');
  v_target_table := entity_design_private.resolve_table(p_payload->'target_table');
  v_source_column := nullif(p_payload->>'source_column_name', '');
  v_target_column := coalesce(
    nullif(p_payload->>'target_column_name', ''),
    v_target_table.primary_key
  );
  v_relation_type := coalesce(
    nullif(p_payload->>'relation_type', ''),
    'many_to_one'
  );
  v_on_delete := pg_catalog.lower(coalesce(
    nullif(p_payload->>'on_delete', ''),
    'no action'
  ));
  v_is_enforced := coalesce(
    (p_payload->>'is_enforced')::boolean,
    false
  );
  v_metadata := coalesce(p_payload->'metadata', '{}'::jsonb);

  perform entity_design_private.assert_identifier(v_source_column, 'sourceColumnName');
  perform entity_design_private.assert_identifier(v_target_column, 'targetColumnName');
  if v_relation_type not in (
    'one_to_one', 'one_to_many', 'many_to_one', 'many_to_many'
  ) then
    raise exception 'Unsupported relation type: %.', v_relation_type
      using errcode = '22023';
  end if;
  if v_on_delete not in ('no action', 'restrict', 'cascade', 'set null') then
    raise exception 'Unsupported ON DELETE action: %.', v_on_delete
      using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'metadata must be a JSON object.' using errcode = '22023';
  end if;

  v_constraint_name := nullif(p_payload->>'constraint_name', '');
  if v_constraint_name is null then
    v_constraint_base := 'fk_' || v_source_table.table_name || '_'
      || v_source_column || '_' || v_target_table.table_name;
    if pg_catalog.length(v_constraint_base) <= 63 then
      v_constraint_name := v_constraint_base;
    else
      v_constraint_name := pg_catalog.left(v_constraint_base, 54)
        || '_' || pg_catalog.substr(pg_catalog.md5(v_constraint_base), 1, 8);
    end if;
  end if;
  perform entity_design_private.assert_identifier(v_constraint_name, 'constraintName');

  if v_is_enforced then
    perform entity_design_private.add_foreign_key(
      v_source_table.schema_name,
      v_source_table.table_name,
      v_source_column,
      v_target_table.schema_name,
      v_target_table.table_name,
      v_target_column,
      v_constraint_name,
      v_on_delete
    );
  end if;

  insert into public.entity_design_relations (
    source_table_id,
    source_column_name,
    target_table_id,
    target_column_name,
    relation_type,
    is_enforced,
    constraint_name,
    on_delete,
    metadata,
    created_by,
    updated_by
  ) values (
    v_source_table.id,
    v_source_column,
    v_target_table.id,
    v_target_column,
    v_relation_type,
    v_is_enforced,
    v_constraint_name,
    v_on_delete,
    v_metadata,
    auth.uid(),
    auth.uid()
  )
  on conflict (source_table_id, source_column_name, target_table_id, target_column_name)
  do update set
    relation_type = excluded.relation_type,
    is_enforced = excluded.is_enforced,
    constraint_name = excluded.constraint_name,
    on_delete = excluded.on_delete,
    metadata = excluded.metadata,
    updated_by = excluded.updated_by,
    updated_at = pg_catalog.timezone('utc'::text, pg_catalog.now())
  returning * into v_relation;

  return pg_catalog.to_jsonb(v_relation);
end;
$function$;

revoke all on function entity_design_private.assert_manage_permission()
  from public, anon, authenticated, service_role;
revoke all on function entity_design_private.assert_identifier(text, text)
  from public, anon, authenticated, service_role;
revoke all on function entity_design_private.assert_relation(text, text)
  from public, anon, authenticated, service_role;
revoke all on function entity_design_private.normalize_default_expression(text, text)
  from public, anon, authenticated, service_role;
revoke all on function entity_design_private.resolve_table(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function entity_design_private.create_table(text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function entity_design_private.add_column(
  text, text, text, text, text, boolean, boolean, boolean
) from public, anon, authenticated, service_role;
revoke all on function entity_design_private.drop_table(text, text)
  from public, anon, authenticated, service_role;
revoke all on function entity_design_private.drop_column(text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function entity_design_private.add_foreign_key(
  text, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;

-- The private schema is not exposed by PostgREST. Authenticated callers need these
-- grants only so security-invoker RPCs can reach helpers, each of which rechecks auth.
grant execute on function entity_design_private.assert_manage_permission()
  to authenticated;
grant execute on function entity_design_private.assert_identifier(text, text)
  to authenticated;
grant execute on function entity_design_private.assert_relation(text, text)
  to authenticated;
grant execute on function entity_design_private.normalize_default_expression(text, text)
  to authenticated;
grant execute on function entity_design_private.resolve_table(jsonb)
  to authenticated;
grant execute on function entity_design_private.create_table(text, text, text)
  to authenticated;
grant execute on function entity_design_private.add_column(
  text, text, text, text, text, boolean, boolean, boolean
) to authenticated;
grant execute on function entity_design_private.drop_table(text, text)
  to authenticated;
grant execute on function entity_design_private.drop_column(text, text, text)
  to authenticated;
grant execute on function entity_design_private.add_foreign_key(
  text, text, text, text, text, text, text, text
) to authenticated;

revoke all on function public.entity_design_list()
  from public, anon, authenticated, service_role;
revoke all on function public.entity_design_list_physical_tables()
  from public, anon, authenticated, service_role;
revoke all on function public.entity_design_sync_physical_columns(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.entity_design_sync_physical_tables(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.entity_design_save_table(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.entity_design_delete_table(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.entity_design_save_column(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.entity_design_delete_column(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.entity_design_save_relation(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.entity_design_list() to authenticated;
grant execute on function public.entity_design_list_physical_tables() to authenticated;
grant execute on function public.entity_design_sync_physical_columns(jsonb) to authenticated;
grant execute on function public.entity_design_sync_physical_tables(jsonb) to authenticated;
grant execute on function public.entity_design_save_table(jsonb) to authenticated;
grant execute on function public.entity_design_delete_table(jsonb) to authenticated;
grant execute on function public.entity_design_save_column(jsonb) to authenticated;
grant execute on function public.entity_design_delete_column(jsonb) to authenticated;
grant execute on function public.entity_design_save_relation(jsonb) to authenticated;

-- Obsolete compatibility helpers from the tenant_id naming era.
drop function if exists public.account_id_from_tenant(text);
drop function if exists public.account_id_from_tenant(uuid);
