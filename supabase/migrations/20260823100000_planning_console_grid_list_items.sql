-- Make planning-console result grids load through planning.listItems.

begin;

create or replace function pg_temp.replace_lowcode_grid_column_fields(
  p_columns jsonb,
  p_field_map jsonb
)
returns jsonb
language plpgsql
as $function$
declare
  v_result jsonb;
begin
  if jsonb_typeof(p_columns) <> 'array' then
    return p_columns;
  end if;

  select jsonb_agg(patched.value order by patched.ordinality)
  into v_result
  from (
    select
      column_item.ordinality,
      case
        when column_item.value ? 'field'
          and p_field_map ? (column_item.value ->> 'field')
          and p_field_map -> (column_item.value ->> 'field') = 'null'::jsonb
        then null
        when column_item.value ? 'field'
          and p_field_map ? (column_item.value ->> 'field')
        then jsonb_set(
          column_item.value,
          '{field}',
          to_jsonb(p_field_map ->> (column_item.value ->> 'field')),
          true
        )
        else column_item.value
      end as value
    from jsonb_array_elements(p_columns)
      with ordinality as column_item(value, ordinality)
  ) as patched
  where patched.value is not null;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

create or replace function pg_temp.patch_planning_console_grid_block(
  p_document jsonb,
  p_grid_id text,
  p_field_map jsonb
)
returns jsonb
language plpgsql
as $function$
declare
  v_result jsonb;
  v_grid jsonb;
begin
  case jsonb_typeof(p_document)
    when 'object' then
      if p_document ->> 'id' = p_grid_id and p_document ->> 'kind' = 'grid' then
        v_grid := p_document - 'sourceType';
        if jsonb_typeof(v_grid #> '{schema,grid,columns}') = 'array' then
          v_grid := jsonb_set(
            v_grid,
            '{schema,grid,columns}',
            pg_temp.replace_lowcode_grid_column_fields(
              v_grid #> '{schema,grid,columns}',
              p_field_map
            ),
            true
          );
        end if;
        return v_grid;
      end if;

      select jsonb_object_agg(
        entry.key,
        pg_temp.patch_planning_console_grid_block(entry.value, p_grid_id, p_field_map)
      )
      into v_result
      from jsonb_each(p_document) as entry;
      return coalesce(v_result, '{}'::jsonb);

    when 'array' then
      select jsonb_agg(
        pg_temp.patch_planning_console_grid_block(item.value, p_grid_id, p_field_map)
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

create or replace function pg_temp.set_lowcode_block_field(
  p_document jsonb,
  p_block_id text,
  p_field text,
  p_value jsonb
)
returns jsonb
language plpgsql
as $function$
declare
  v_result jsonb;
begin
  case jsonb_typeof(p_document)
    when 'object' then
      if p_document ->> 'id' = p_block_id then
        return jsonb_set(p_document, array[p_field], p_value, true);
      end if;

      select jsonb_object_agg(
        entry.key,
        pg_temp.set_lowcode_block_field(entry.value, p_block_id, p_field, p_value)
      )
      into v_result
      from jsonb_each(p_document) as entry;
      return coalesce(v_result, '{}'::jsonb);

    when 'array' then
      select jsonb_agg(
        pg_temp.set_lowcode_block_field(item.value, p_block_id, p_field, p_value)
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
  v_source record;
  v_grid record;
  v_matched_source_count integer := 0;
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
  if not v_next_schema ? 'dataSources' then
    v_next_schema := jsonb_set(v_next_schema, '{dataSources}', '{}'::jsonb, true);
  end if;

  for v_source in
    select *
    from (values
      (
        'demands',
        'planning_demand',
        '{"item_id":"{{ forms.planning_console_result_filter.itemId }}","status":"{{ forms.planning_console_result_filter.demandStatus }}","due":{"op":"gte","value":"{{ forms.planning_console_result_filter.from }}"}}'::jsonb,
        null::jsonb,
        '[{"field":"due","direction":"asc"}]'::jsonb,
        1000
      ),
      (
        'operationPlans',
        'planning_operationplan',
        '{"plan_version_id":"{{ forms.planning_console_result_filter.planVersionId }}","item_id":"{{ forms.planning_console_result_filter.itemId }}","operation_id":"{{ forms.planning_console_result_filter.operationId }}","status":"{{ forms.planning_console_result_filter.operationStatus }}","startdate":{"op":"gte","value":"{{ forms.planning_console_result_filter.from }}"},"enddate":{"op":"lte","value":"{{ forms.planning_console_result_filter.to }}"}}'::jsonb,
        '["plan_version_id"]'::jsonb,
        '[{"field":"startdate","direction":"asc"}]'::jsonb,
        1000
      ),
      (
        'materials',
        'planning_operationplanmaterial',
        '{"plan_version_id":"{{ forms.planning_console_result_filter.planVersionId }}","item_id":"{{ forms.planning_console_result_filter.itemId }}","flowdate":{"op":"gte","value":"{{ forms.planning_console_result_filter.from }}"}}'::jsonb,
        '["plan_version_id"]'::jsonb,
        '[{"field":"flowdate","direction":"asc"}]'::jsonb,
        1000
      ),
      (
        'planResources',
        'planning_operationplanresource',
        '{"plan_version_id":"{{ forms.planning_console_result_filter.planVersionId }}","resource_id":"{{ forms.planning_console_result_filter.resourceId }}"}'::jsonb,
        '["plan_version_id"]'::jsonb,
        '[{"field":"created_at","direction":"asc"}]'::jsonb,
        1000
      ),
      (
        'resourcePlans',
        'planning_resourceplan',
        '{"plan_version_id":"{{ forms.planning_console_result_filter.planVersionId }}","resource_id":"{{ forms.planning_console_result_filter.resourceId }}","startdate":{"op":"gte","value":"{{ forms.planning_console_result_filter.from }}"}}'::jsonb,
        '["plan_version_id"]'::jsonb,
        '[{"field":"startdate","direction":"asc"}]'::jsonb,
        1000
      ),
      (
        'problems',
        'planning_problem',
        '{"plan_version_id":"{{ forms.planning_console_result_filter.planVersionId }}","startdate":{"op":"gte","value":"{{ forms.planning_console_result_filter.from }}"}}'::jsonb,
        '["plan_version_id"]'::jsonb,
        '[{"field":"startdate","direction":"asc"}]'::jsonb,
        1000
      ),
      (
        'constraints',
        'planning_constraint',
        '{"plan_version_id":"{{ forms.planning_console_result_filter.planVersionId }}","item_id":"{{ forms.planning_console_result_filter.itemId }}","startdate":{"op":"gte","value":"{{ forms.planning_console_result_filter.from }}"}}'::jsonb,
        '["plan_version_id"]'::jsonb,
        '[{"field":"startdate","direction":"asc"}]'::jsonb,
        1000
      ),
      (
        'runs',
        'planning_run',
        '{"scenario_id":"{{ forms.planning_console_filter.scenarioId }}","submitted":{"op":"gte","value":"{{ forms.planning_console_result_filter.from }}"}}'::jsonb,
        null::jsonb,
        '[{"field":"submitted","direction":"desc"}]'::jsonb,
        300
      )
    ) as source_config(source_key, table_name, filters, required_filters, sorts, row_limit)
  loop
    v_next_schema := jsonb_set(
      v_next_schema,
      array['dataSources', v_source.source_key],
      jsonb_build_object(
        'key', v_source.source_key,
        'label', '排产控制台·' || v_source.source_key,
        'sourceType', 'custom',
        'serviceName', 'planning',
        'serviceMethod', 'listItems',
        'postData', jsonb_strip_nulls(jsonb_build_object(
          'resource', v_source.table_name,
          'tableName', v_source.table_name,
          'filters', v_source.filters,
          'requiredFilters', v_source.required_filters,
          'sorts', v_source.sorts,
          'limit', v_source.row_limit
        )),
        'autoLoad', true
      ),
      true
    );
  end loop;

  v_next_schema := jsonb_set(
    v_next_schema,
    '{dataSources,operationPlanTimeline}',
    '{
      "key": "operationPlanTimeline",
      "label": "排产控制台·operationPlanTimeline",
      "sourceType": "custom",
      "serviceName": "planning",
      "serviceMethod": "getPlanningConsoleData",
      "postData": {
        "dataset": "operationPlans",
        "filters": {
          "scenarioId": "{{ forms.planning_console_filter.scenarioId }}",
          "planVersionId": "{{ forms.planning_console_result_filter.planVersionId }}",
          "itemId": "{{ forms.planning_console_result_filter.itemId }}",
          "resourceId": "{{ forms.planning_console_result_filter.resourceId }}",
          "operationId": "{{ forms.planning_console_result_filter.operationId }}",
          "operationStatus": "{{ forms.planning_console_result_filter.operationStatus }}",
          "demandStatus": "{{ forms.planning_console_result_filter.demandStatus }}",
          "from": "{{ forms.planning_console_result_filter.from }}",
          "to": "{{ forms.planning_console_result_filter.to }}"
        }
      },
      "autoLoad": true
    }'::jsonb,
    true
  );
  v_next_schema := pg_temp.set_lowcode_block_field(
    v_next_schema,
    'planning_console_gantt',
    'sourceKey',
    to_jsonb('operationPlanTimeline'::text)
  );

  for v_grid in
    select *
    from (values
      (
        'planning_console_demands_grid',
        '{"item_name":"item_id_label","customer_name":"customer_id_label","location_name":"location_id_label","version_planned_quantity":"plannedquantity","version_delivery_date":"deliverydate","lateness_hours":"delay","coverage_percent":null}'::jsonb
      ),
      (
        'planning_console_operation_plans_grid',
        '{"operation_name":"operation_id_label","item_name":"item_id_label","resource_name":"location_id_label","duration_hours":null,"delay_hours":"delay","demand_name":"demand_id_label","version_code":"plan_version_id_label"}'::jsonb
      ),
      (
        'planning_console_materials_grid',
        '{"operationplan_reference":"operationplan_id_label","item_name":"item_id_label","location_name":"location_id_label","movement_type":null}'::jsonb
      ),
      (
        'planning_console_plan_resources_grid',
        '{"resource_name":"resource_id_label","operationplan_reference":"operationplan_id_label","startdate":null,"enddate":null}'::jsonb
      ),
      (
        'planning_console_resource_plans_grid',
        '{"resource_name":"resource_id_label","utilization_percent":null,"overloaded":null}'::jsonb
      ),
      (
        'planning_console_problems_grid',
        '{}'::jsonb
      ),
      (
        'planning_console_constraints_grid',
        '{"demand_name":"demand_id_label","item_name":"item_id_label"}'::jsonb
      ),
      (
        'planning_console_runs_grid',
        '{"scenario_name":"scenario_id_label","version_code":null}'::jsonb
      )
    ) as grid_config(grid_id, field_map)
  loop
    v_next_schema := pg_temp.patch_planning_console_grid_block(
      v_next_schema,
      v_grid.grid_id,
      v_grid.field_map
    );
  end loop;

  select count(*)
  into v_matched_source_count
  from jsonb_each(coalesce(v_next_schema -> 'dataSources', '{}'::jsonb)) as source_entry(source_key, source_value)
  join (values
    ('demands', 'planning_demand'),
    ('operationPlans', 'planning_operationplan'),
    ('materials', 'planning_operationplanmaterial'),
    ('planResources', 'planning_operationplanresource'),
    ('resourcePlans', 'planning_resourceplan'),
    ('problems', 'planning_problem'),
    ('constraints', 'planning_constraint'),
    ('runs', 'planning_run')
  ) as expected(source_key, table_name)
    on source_entry.source_key = expected.source_key
   and source_entry.source_value ->> 'serviceName' = 'planning'
   and source_entry.source_value ->> 'serviceMethod' = 'listItems'
   and source_entry.source_value ->> 'sourceType' = 'custom'
   and source_entry.source_value #>> '{postData,resource}' = expected.table_name
   and source_entry.source_value #>> '{postData,tableName}' = expected.table_name;

  if v_matched_source_count < 8 then
    raise exception 'Expected 8 planning console listItems data sources, found %', v_matched_source_count;
  end if;

  if v_next_schema #>> '{dataSources,operationPlanTimeline,serviceMethod}' <> 'getPlanningConsoleData'
     or v_next_schema #>> '{dataSources,operationPlanTimeline,postData,dataset}' <> 'operationPlans' then
    raise exception 'Expected planning console Gantt to retain an aggregate operationPlans data source.';
  end if;

  if not exists (
    select 1
    from jsonb_path_query(v_next_schema, 'strict $.** ? (@.id == "planning_console_gantt")') as block
    where block ->> 'sourceKey' = 'operationPlanTimeline'
  ) then
    raise exception 'Expected planning_console_gantt to use operationPlanTimeline.';
  end if;

  select count(*)
  into v_matched_grid_count
  from jsonb_path_query(v_next_schema, 'strict $.** ? (@.kind == "grid")') as block
  join (values
    ('planning_console_demands_grid', 'planning_demand'),
    ('planning_console_operation_plans_grid', 'planning_operationplan'),
    ('planning_console_materials_grid', 'planning_operationplanmaterial'),
    ('planning_console_plan_resources_grid', 'planning_operationplanresource'),
    ('planning_console_resource_plans_grid', 'planning_resourceplan'),
    ('planning_console_problems_grid', 'planning_problem'),
    ('planning_console_constraints_grid', 'planning_constraint'),
    ('planning_console_runs_grid', 'planning_run')
  ) as expected(grid_id, table_name)
    on block ->> 'id' = expected.grid_id
   and block ->> 'tableName' = expected.table_name
   and not (block ? 'sourceType');

  if v_matched_grid_count < 8 then
    raise exception 'Expected 8 planning console grid blocks without sourceType, found %', v_matched_grid_count;
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
