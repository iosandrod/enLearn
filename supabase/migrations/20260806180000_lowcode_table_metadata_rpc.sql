-- Low-code table-page metadata boundary. Catalog access stays in PostgreSQL;
-- TypeScript only turns the returned metadata into a page schema.

create or replace function public.read_lowcode_table_metadata(
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_schema_name text := coalesce(nullif(btrim(v_payload->>'schema_name'), ''), 'public');
  v_table_name text := nullif(btrim(v_payload->>'table_name'), '');
  v_result jsonb;
begin
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'read_lowcode_table_metadata payload must be an object.' using errcode = '22023';
  end if;

  if not (
    auth.role() = 'service_role'
    or public.has_app_permission('lowcode.pages.manage')
    or public.has_app_permission('admin.entities.manage')
  ) then
    raise exception 'Low-code page metadata permission required.' using errcode = '42501';
  end if;

  if v_action = 'list_tables' then
    select coalesce(jsonb_agg(to_jsonb(table_rows) order by table_rows.metadata_rank, table_rows.sort_order nulls last, table_rows.table_schema, table_rows.table_name), '[]'::jsonb)
    into v_result
    from (
      select
        namespaces.nspname as table_schema,
        classes.relname as table_name,
        obj_description(classes.oid, 'pg_class') as table_comment,
        entities.code as entity_code,
        entities.title as entity_title,
        entities.route_path,
        entities.page_code,
        entities.primary_key,
        entities.sort_order,
        case when entities.sort_order is null then 1 else 0 end as metadata_rank
      from pg_class classes
      join pg_namespace namespaces on namespaces.oid = classes.relnamespace
      left join public.admin_entities entities
        on entities.table_name in (namespaces.nspname || '.' || classes.relname, classes.relname)
      where classes.relkind in ('r', 'p', 'v', 'm')
        and namespaces.nspname not in (
          'auth', 'extensions', 'graphql', 'graphql_public', 'information_schema',
          'net', 'pg_catalog', 'pgsodium', 'realtime', 'storage',
          'supabase_functions', 'vault'
        )
    ) table_rows;
    return v_result;
  end if;

  if v_schema_name !~ '^[a-zA-Z_][a-zA-Z0-9_]*$'
     or v_table_name is null
     or v_table_name !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' then
    raise exception 'schema_name and table_name must be valid identifiers.' using errcode = '22023';
  end if;

  if v_action = 'inspect_table' then
    if not exists (
      select 1
      from pg_class classes
      join pg_namespace namespaces on namespaces.oid = classes.relnamespace
      where namespaces.nspname = v_schema_name
        and classes.relname = v_table_name
        and classes.relkind in ('r', 'p', 'v', 'm')
    ) then
      raise exception 'Table "%.%" does not exist.', v_schema_name, v_table_name using errcode = 'P0002';
    end if;

    select jsonb_build_object(
      'table', jsonb_build_object(
        'schema', v_schema_name,
        'name', v_table_name,
        'fullName', v_schema_name || '.' || v_table_name
      ),
      'comment', coalesce(obj_description(classes.oid, 'pg_class'), ''),
      'entityCode', (
        select entities.code
        from public.admin_entities entities
        where entities.table_name in (v_schema_name || '.' || v_table_name, v_table_name)
        order by entities.sort_order asc, entities.created_at asc
        limit 1
      ),
      'columns', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', columns.column_name,
          'ordinalPosition', columns.ordinal_position,
          'dataType', columns.data_type,
          'udtName', columns.udt_name,
          'isNullable', columns.is_nullable = 'YES',
          'hasDefault', columns.column_default is not null,
          'comment', coalesce(col_description(classes.oid, attributes.attnum), ''),
          'isPrimaryKey', exists (
            select 1
            from information_schema.table_constraints constraints
            join information_schema.key_column_usage key_columns
              on key_columns.constraint_schema = constraints.constraint_schema
             and key_columns.constraint_name = constraints.constraint_name
             and key_columns.table_schema = constraints.table_schema
             and key_columns.table_name = constraints.table_name
            where constraints.constraint_type = 'PRIMARY KEY'
              and constraints.table_schema = columns.table_schema
              and constraints.table_name = columns.table_name
              and key_columns.column_name = columns.column_name
          )
        ) order by columns.ordinal_position)
        from information_schema.columns columns
        join pg_attribute attributes
          on attributes.attrelid = classes.oid
         and attributes.attname = columns.column_name
        where columns.table_schema = v_schema_name
          and columns.table_name = v_table_name
      ), '[]'::jsonb),
      'childRelations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'constraintName', relation_rows.constraint_name,
          'childTable', jsonb_build_object(
            'schema', relation_rows.child_schema,
            'name', relation_rows.child_table,
            'fullName', relation_rows.child_schema || '.' || relation_rows.child_table
          ),
          'childColumns', relation_rows.child_columns,
          'parentColumns', relation_rows.parent_columns,
          'columns', relation_rows.child_column_metadata,
          'title', coalesce(
            nullif(obj_description(relation_rows.child_oid, 'pg_class'), ''),
            initcap(replace(relation_rows.child_table, '_', ' '))
          )
        ) order by relation_rows.child_schema, relation_rows.child_table, relation_rows.constraint_name)
        from (
          select
            constraints.constraint_name,
            key_columns.table_schema as child_schema,
            key_columns.table_name as child_table,
            child_classes.oid as child_oid,
            array_agg(key_columns.column_name order by key_columns.ordinal_position) as child_columns,
            array_agg(parent_columns.column_name order by key_columns.ordinal_position) as parent_columns,
            (
              select coalesce(jsonb_agg(jsonb_build_object(
                'name', child_columns.column_name,
                'ordinalPosition', child_columns.ordinal_position,
                'dataType', child_columns.data_type,
                'udtName', child_columns.udt_name,
                'isNullable', child_columns.is_nullable = 'YES',
                'hasDefault', child_columns.column_default is not null,
                'comment', coalesce(col_description(child_classes.oid, child_attributes.attnum), ''),
                'isPrimaryKey', exists (
                  select 1
                  from information_schema.table_constraints child_constraints
                  join information_schema.key_column_usage child_keys
                    on child_keys.constraint_schema = child_constraints.constraint_schema
                   and child_keys.constraint_name = child_constraints.constraint_name
                   and child_keys.table_schema = child_constraints.table_schema
                   and child_keys.table_name = child_constraints.table_name
                  where child_constraints.constraint_type = 'PRIMARY KEY'
                    and child_constraints.table_schema = child_columns.table_schema
                    and child_constraints.table_name = child_columns.table_name
                    and child_keys.column_name = child_columns.column_name
                )
              ) order by child_columns.ordinal_position), '[]'::jsonb)
              from information_schema.columns child_columns
              join pg_attribute child_attributes
                on child_attributes.attrelid = child_classes.oid
               and child_attributes.attname = child_columns.column_name
              where child_columns.table_schema = key_columns.table_schema
                and child_columns.table_name = key_columns.table_name
            ) as child_column_metadata
          from information_schema.table_constraints constraints
          join information_schema.key_column_usage key_columns
            on key_columns.constraint_schema = constraints.constraint_schema
           and key_columns.constraint_name = constraints.constraint_name
           and key_columns.table_schema = constraints.table_schema
           and key_columns.table_name = constraints.table_name
          join information_schema.referential_constraints reference_constraints
            on reference_constraints.constraint_schema = constraints.constraint_schema
           and reference_constraints.constraint_name = constraints.constraint_name
          join information_schema.key_column_usage parent_columns
            on parent_columns.constraint_schema = reference_constraints.unique_constraint_schema
           and parent_columns.constraint_name = reference_constraints.unique_constraint_name
           and parent_columns.ordinal_position = key_columns.position_in_unique_constraint
          join pg_namespace child_namespaces on child_namespaces.nspname = key_columns.table_schema
          join pg_class child_classes
            on child_classes.relnamespace = child_namespaces.oid
           and child_classes.relname = key_columns.table_name
          where constraints.constraint_type = 'FOREIGN KEY'
            and parent_columns.table_schema = v_schema_name
            and parent_columns.table_name = v_table_name
          group by constraints.constraint_name, key_columns.table_schema, key_columns.table_name, child_classes.oid
        ) relation_rows
      ), '[]'::jsonb)
    )
    into v_result
    from pg_class classes
    join pg_namespace namespaces on namespaces.oid = classes.relnamespace
    where namespaces.nspname = v_schema_name
      and classes.relname = v_table_name
      and classes.relkind in ('r', 'p', 'v', 'm');
    return v_result;
  end if;

  raise exception 'Unsupported low-code metadata action: %.', coalesce(p_action, '') using errcode = '22023';
end;
$function$;

revoke all on function public.read_lowcode_table_metadata(text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.read_lowcode_table_metadata(text, jsonb)
  to authenticated, service_role;
