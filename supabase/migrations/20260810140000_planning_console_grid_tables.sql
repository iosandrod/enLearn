-- Link planning-console aggregate grids to their physical source tables.

begin;

create or replace function pg_temp.set_lowcode_grid_table(
  p_document jsonb,
  p_grid_id text,
  p_table_name text
)
returns jsonb
language plpgsql
as $function$
declare
  v_result jsonb;
begin
  case jsonb_typeof(p_document)
    when 'object' then
      if p_document ->> 'id' = p_grid_id and p_document ->> 'kind' = 'grid' then
        return jsonb_set(
          jsonb_set(p_document, '{sourceType}', '"custom"'::jsonb, true),
          '{tableName}',
          to_jsonb(p_table_name),
          true
        );
      end if;

      select jsonb_object_agg(
        entry.key,
        pg_temp.set_lowcode_grid_table(entry.value, p_grid_id, p_table_name)
      )
      into v_result
      from jsonb_each(p_document) as entry;
      return coalesce(v_result, '{}'::jsonb);

    when 'array' then
      select jsonb_agg(
        pg_temp.set_lowcode_grid_table(item.value, p_grid_id, p_table_name)
        order by item.ordinality
      )
      into v_result
      from jsonb_array_elements(p_document)
        with ordinality as item(value, ordinality);
      return coalesce(v_result, '[]'::jsonb);

    else
      return p_document;
  end case;
end;
$function$;

do $$
declare
  v_page_id uuid;
  v_current_version integer;
  v_current_schema jsonb;
  v_next_schema jsonb;
  v_next_version integer;
  v_published_at timestamptz;
  v_mapping record;
  v_matched_grid_count integer := 0;
begin
  select id, version, schema
  into v_page_id, v_current_version, v_current_schema
  from public.lowcode_pages
  where code = 'planning_console'
  for update;

  if v_page_id is null then
    return;
  end if;

  v_next_schema := v_current_schema;
  for v_mapping in
    select *
    from (values
      ('planning_console_demands_grid', 'planning_demand'),
      ('planning_console_operation_plans_grid', 'planning_operationplan'),
      ('planning_console_materials_grid', 'planning_operationplanmaterial'),
      ('planning_console_plan_resources_grid', 'planning_operationplanresource'),
      ('planning_console_resource_plans_grid', 'planning_resourceplan'),
      ('planning_console_problems_grid', 'planning_problem'),
      ('planning_console_constraints_grid', 'planning_constraint'),
      ('planning_console_runs_grid', 'planning_run')
    ) as mapping(grid_id, table_name)
  loop
    v_next_schema := pg_temp.set_lowcode_grid_table(
      v_next_schema,
      v_mapping.grid_id,
      v_mapping.table_name
    );
  end loop;

  select count(*)
  into v_matched_grid_count
  from jsonb_path_query(
    v_next_schema,
    'strict $.** ? (@.kind == "grid" && exists(@.tableName))'
  ) as block
  join (values
    ('planning_console_demands_grid', 'planning_demand'),
      ('planning_console_operation_plans_grid', 'planning_operationplan'),
      ('planning_console_materials_grid', 'planning_operationplanmaterial'),
      ('planning_console_plan_resources_grid', 'planning_operationplanresource'),
      ('planning_console_resource_plans_grid', 'planning_resourceplan'),
      ('planning_console_problems_grid', 'planning_problem'),
      ('planning_console_constraints_grid', 'planning_constraint'),
      ('planning_console_runs_grid', 'planning_run')
  ) as mapping(grid_id, table_name)
    on block->>'id' = mapping.grid_id
   and block->>'tableName' = mapping.table_name
   and block->>'sourceType' = 'custom';

  if v_matched_grid_count < 8 then
    raise exception 'Expected at least 8 planning console grids, found %', v_matched_grid_count;
  end if;

  if v_current_schema = v_next_schema then
    return;
  end if;

  v_next_version := v_current_version + 1;
  v_published_at := timezone('utc'::text, now());

  update public.lowcode_pages
  set schema = v_next_schema,
      version = v_next_version,
      published_at = v_published_at,
      updated_at = v_published_at
  where id = v_page_id;

  insert into public.lowcode_page_versions (page_id, version, schema, published_at)
  values (v_page_id, v_next_version, v_next_schema, v_published_at)
  on conflict (page_id, version) do update set
    schema = excluded.schema,
    published_at = excluded.published_at;
end $$;

notify pgrst, 'reload schema';

commit;
