-- Generate relation-aware read views for every planning list page whose
-- physical table references another planning table.

begin;

do $generate_views$
declare
  table_record record;
  relation_record record;
  v_view_name text;
  v_definition text;
  v_labels text := '';
  v_joins text := '';
  v_relation_fields text[] := '{}';
  v_display_fields text[] := '{}';
  v_source_table_id uuid;
  v_target_table_id uuid;
  v_source_column_id uuid;
  v_target_column_id uuid;
  v_relation_index integer;
begin
  for table_record in
    select distinct page.table_name
    from public.lowcode_pages page
    join pg_catalog.pg_class source_relation
      on source_relation.relname = page.table_name
    join pg_catalog.pg_namespace source_namespace
      on source_namespace.oid = source_relation.relnamespace
     and source_namespace.nspname = 'public'
    where page.code like 'planning_%-list'
      and page.table_name is not null
      and source_relation.relkind in ('r', 'p')
      and exists (
        select 1
        from pg_catalog.pg_constraint candidate
        join pg_catalog.pg_class target_relation
          on target_relation.oid = candidate.confrelid
        join pg_catalog.pg_namespace target_namespace
          on target_namespace.oid = target_relation.relnamespace
        where candidate.conrelid = source_relation.oid
          and candidate.contype = 'f'
          and target_namespace.nspname = 'public'
          and target_relation.relname like 'planning_%'
      )
    order by page.table_name
  loop
    v_view_name := table_record.table_name || '_view';
    v_labels := '';
    v_joins := '';
    v_relation_fields := '{}';
    v_display_fields := '{}';
    v_relation_index := 0;

    for relation_record in
      select
        candidate.oid,
        target_relation.relname as target_table,
        max(source_column.attname) filter (where source_column.attname <> 'account_id') as source_column,
        max(target_column.attname) filter (where target_column.attname <> 'account_id') as target_column,
        candidate.conname,
        case candidate.confdeltype
          when 'r' then 'restrict'
          when 'n' then 'set null'
          when 'c' then 'cascade'
          when 'd' then 'set default'
          else 'no action'
        end as on_delete
      from pg_catalog.pg_constraint candidate
      join pg_catalog.pg_class source_relation
        on source_relation.oid = candidate.conrelid
      join pg_catalog.pg_class target_relation
        on target_relation.oid = candidate.confrelid
      join pg_catalog.pg_namespace target_namespace
        on target_namespace.oid = target_relation.relnamespace
      cross join lateral unnest(candidate.conkey, candidate.confkey)
        with ordinality key_pair(source_attnum, target_attnum, ordinal)
      join pg_catalog.pg_attribute source_column
        on source_column.attrelid = source_relation.oid
       and source_column.attnum = key_pair.source_attnum
      join pg_catalog.pg_attribute target_column
        on target_column.attrelid = target_relation.oid
       and target_column.attnum = key_pair.target_attnum
      where source_relation.relname = table_record.table_name
        and candidate.contype = 'f'
        and target_namespace.nspname = 'public'
        and target_relation.relname like 'planning_%'
      group by candidate.oid, target_relation.relname, candidate.conname, candidate.confdeltype
      having count(*) filter (where source_column.attname <> 'account_id') = 1
      order by source_column, candidate.oid
    loop
      v_relation_index := v_relation_index + 1;
      v_labels := v_labels || case when v_labels = '' then '' else ', ' end ||
        format(
          'coalesce(to_jsonb(rel_%s)->>''display_name'', to_jsonb(rel_%s)->>''name'', src.%I::text) as %I',
          v_relation_index,
          v_relation_index,
          relation_record.source_column,
          relation_record.source_column || '_label'
        );
      v_joins := v_joins || ' ' || format(
        'left join public.%I rel_%s on rel_%s.account_id = src.account_id and rel_%s.%I = src.%I',
        relation_record.target_table,
        v_relation_index,
        v_relation_index,
        v_relation_index,
        relation_record.target_column,
        relation_record.source_column
      );
      v_relation_fields := array_append(v_relation_fields, relation_record.source_column);
      v_display_fields := array_append(v_display_fields, relation_record.source_column || '_label');

      insert into public.entity_design_tables
        (code, schema_name, table_name, title, description, primary_key)
      values
        (table_record.table_name, 'public', table_record.table_name, table_record.table_name, null, 'id'),
        (relation_record.target_table, 'public', relation_record.target_table, relation_record.target_table, null, 'id')
      on conflict (schema_name, table_name) do nothing;

      select id into v_source_table_id
      from public.entity_design_tables
      where schema_name = 'public' and table_name = table_record.table_name;
      select id into v_target_table_id
      from public.entity_design_tables
      where schema_name = 'public' and table_name = relation_record.target_table;

      insert into public.entity_design_columns
        (table_id, column_name, label, data_type, storage_kind,
         is_required, is_primary_key, sort_order)
      values
        (v_source_table_id, relation_record.source_column, relation_record.source_column,
         'uuid', 'physical', false, false, 500 + v_relation_index),
        (v_target_table_id, 'id', 'id', 'uuid', 'physical', false, true, 0)
      on conflict (table_id, column_name) do nothing;

      select id into v_source_column_id
      from public.entity_design_columns
      where table_id = v_source_table_id and column_name = relation_record.source_column;
      select id into v_target_column_id
      from public.entity_design_columns
      where table_id = v_target_table_id and column_name = 'id';

      insert into public.entity_design_relations
        (source_table_id, source_column_id, source_column_name,
         target_table_id, target_column_id, target_column_name,
         relation_type, is_enforced, constraint_name, on_delete, metadata)
      values
        (v_source_table_id, v_source_column_id, relation_record.source_column,
         v_target_table_id, v_target_column_id, 'id',
         'many_to_one', true, relation_record.conname,
         relation_record.on_delete, '{}'::jsonb)
      on conflict (source_table_id, source_column_name, target_table_id, target_column_name)
      do update set
        source_column_id = excluded.source_column_id,
        target_column_id = excluded.target_column_id,
        relation_type = excluded.relation_type,
        is_enforced = excluded.is_enforced,
        constraint_name = excluded.constraint_name,
        on_delete = excluded.on_delete,
        updated_at = timezone('utc'::text, now());
    end loop;

    if v_labels = '' then
      continue;
    end if;

    v_definition := format(
      'select src.*, %s from public.%I src%s',
      v_labels,
      table_record.table_name,
      v_joins
    );

    execute format('drop view if exists public.%I', v_view_name);
    execute format('create view public.%I with (security_invoker = true) as %s', v_view_name, v_definition);
    execute format('grant select on public.%I to authenticated, service_role', v_view_name);

    insert into public.entity_design_views
      (code, schema_name, view_name, title, description, definition_sql,
       status, security_invoker, published_at, metadata)
    values
      (
        v_view_name,
        'public',
        v_view_name,
        table_record.table_name || '关联视图',
        '展示关联对象名称。',
        v_definition,
        'published',
        true,
        timezone('utc'::text, now()),
        jsonb_build_object(
          'sourceTable', 'public.' || table_record.table_name,
          'relationFields', to_jsonb(v_relation_fields),
          'displayFields', to_jsonb(v_display_fields)
        )
      )
    on conflict (code) do update set
      schema_name = excluded.schema_name,
      view_name = excluded.view_name,
      title = excluded.title,
      description = excluded.description,
      definition_sql = excluded.definition_sql,
      status = excluded.status,
      security_invoker = true,
      published_at = excluded.published_at,
      metadata = excluded.metadata,
      updated_at = timezone('utc'::text, now());
  end loop;
end
$generate_views$;

do $bind_pages$
declare
  page_record record;
  source_key text;
  grid_id text;
begin
  for page_record in
    select id, code, table_name, schema
    from public.lowcode_pages
    where code like 'planning_%-list'
       or code like 'planning_%-edit'
  loop
    if page_record.table_name is null then
      continue;
    end if;

    if not exists (
      select 1 from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = page_record.table_name || '_view'
        and relation.relkind = 'v'
    ) then
      continue;
    end if;

    source_key := page_record.table_name || 'Rows';
    grid_id := page_record.table_name || '-grid';

    update public.lowcode_pages page
    set schema = jsonb_set(
          jsonb_set(
            schema,
            array['dataSources', source_key, 'sourceType'],
            '"view"'::jsonb,
            true
          ),
          array['dataSources', source_key, 'viewName'],
          to_jsonb('public.' || page_record.table_name || '_view'),
          true
        ),
        view_name = 'public.' || page_record.table_name || '_view',
        table_name = page_record.table_name,
        version = version + 1,
        published_at = case when status = 'published' then timezone('utc'::text, now()) else published_at end,
        updated_at = timezone('utc'::text, now())
    where id = page_record.id
      and (
        schema->'dataSources'->source_key->>'sourceType' is distinct from 'view'
        or schema->'dataSources'->source_key->>'viewName' is distinct from 'public.' || page_record.table_name || '_view'
        or view_name is distinct from 'public.' || page_record.table_name || '_view'
        or table_name is distinct from page_record.table_name
      );

    if page_record.code like 'planning_%-list' then
      update public.lowcode_pages page
      set schema = jsonb_set(
            schema,
            '{blocks}',
            (
              select coalesce(jsonb_agg(
                case when block.value->>'id' = grid_id then
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(block.value, '{sourceType}', '"view"'::jsonb, true),
                      '{viewName}', to_jsonb('public.' || page_record.table_name || '_view'), true
                    ),
                    '{tableName}', to_jsonb(page_record.table_name), true
                  )
                else block.value end order by block.ordinality
              ), '[]'::jsonb)
              from jsonb_array_elements(coalesce(schema->'blocks', '[]'::jsonb))
                with ordinality block(value, ordinality)
            ),
            true
          ),
          updated_at = timezone('utc'::text, now())
      where id = page_record.id;
    end if;
  end loop;

  insert into public.lowcode_page_versions (page_id, version, schema, published_at)
  select id, version, schema, published_at
  from public.lowcode_pages
  where code like 'planning_%-list'
     or code like 'planning_%-edit'
  on conflict (page_id, version) do update
  set schema = excluded.schema,
      published_at = excluded.published_at;
end
$bind_pages$;

insert into supabase_migrations.schema_migrations(version, name, statements)
values ('20260831120000', 'planning_relation_views_all_pages',
        array['Generated and bound relation views for planning pages using DIRECT_URL'])
on conflict (version) do update
set name = excluded.name,
    statements = excluded.statements;

commit;

select pg_catalog.pg_notify('pgrst', 'reload schema');
