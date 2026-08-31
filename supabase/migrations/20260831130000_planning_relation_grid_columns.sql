-- Add every relation label exposed by a planning view to its list grid.

begin;

do $grid_columns$
declare
  page_record record;
  label_record record;
  v_grid_id text;
  v_extra_columns jsonb;
  v_title text;
  v_has_column boolean;
begin
  for page_record in
    select id, table_name, schema
    from public.lowcode_pages
    where code like 'planning_%-list'
      and view_name is not null
  loop
    v_grid_id := page_record.table_name || '-grid';
    v_extra_columns := '[]'::jsonb;

    for label_record in
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = page_record.table_name || '_view'
        and column_name like '%_label'
      order by ordinal_position
    loop
      select exists (
        select 1
        from jsonb_array_elements(coalesce(page_record.schema->'blocks', '[]'::jsonb)) block
        cross join lateral jsonb_array_elements(
          coalesce(block.value#>'{schema,grid,columns}', '[]'::jsonb)
        ) column_value
        where block.value->>'id' = v_grid_id
          and column_value->>'field' = label_record.column_name
      ) into v_has_column;

      if v_has_column then
        continue;
      end if;

      v_title := case replace(label_record.column_name, '_label', '')
        when 'item_id' then '物料'
        when 'location_id' then '地点'
        when 'origin_id' then '来源地点'
        when 'destination_id' then '目的地点'
        when 'supplier_id' then '供应商'
        when 'resource_id' then '资源'
        when 'skill_id' then '技能'
        when 'operation_id' then '工序'
        when 'blockedby_id' then '被阻塞工序'
        when 'owner_id' then '上级'
        when 'category_id' then '类别'
        when 'available_id' then '可用日历'
        when 'minimum_calendar_id' then '最小库存日历'
        when 'maximum_calendar_id' then '最大库存日历'
        when 'efficiency_calendar_id' then '效率日历'
        when 'setupmatrix_id' then '换型矩阵'
        when 'calendar_id' then '日历'
        when 'bucket_id' then '时间桶'
        when 'scenario_id' then '场景'
        when 'source_scenario_id' then '来源场景'
        when 'parent_version_id' then '父版本'
        when 'plan_version_id' then '计划版本'
        when 'run_id' then '运行'
        when 'demand_id' then '需求'
        when 'forecast_id' then '预测'
        when 'operationplan_id' then '计划单'
        when 'snapshot_id' then '快照'
        when 'workflow_job_id' then '工作流作业'
        else replace(label_record.column_name, '_label', '')
      end;

      v_extra_columns := v_extra_columns || jsonb_build_array(
        jsonb_build_object(
          'field', label_record.column_name,
          'title', v_title,
          'minWidth', 180,
          'showOverflow', 'tooltip',
          'formatter', jsonb_build_object('type', 'text', 'emptyText', '-')
        )
      );
    end loop;

    if jsonb_array_length(v_extra_columns) = 0 then
      continue;
    end if;

    update public.lowcode_pages page
    set schema = jsonb_set(
          page.schema,
          '{blocks}',
          (
            select coalesce(jsonb_agg(
              case when block.value->>'id' = v_grid_id then
                jsonb_set(
                  block.value,
                  '{schema,grid,columns}',
                  coalesce(block.value#>'{schema,grid,columns}', '[]'::jsonb) || v_extra_columns,
                  true
                )
              else block.value end order by block.ordinality
            ), '[]'::jsonb)
            from jsonb_array_elements(coalesce(page.schema->'blocks', '[]'::jsonb))
              with ordinality block(value, ordinality)
          ),
          true
        ),
        version = version + 1,
        published_at = case when status = 'published' then timezone('utc'::text, now()) else published_at end,
        updated_at = timezone('utc'::text, now())
    where page.id = page_record.id;
  end loop;

  insert into public.lowcode_page_versions (page_id, version, schema, published_at)
  select id, version, schema, published_at
  from public.lowcode_pages
  where code like 'planning_%-list'
  on conflict (page_id, version) do update
  set schema = excluded.schema,
      published_at = excluded.published_at;
end
$grid_columns$;

insert into supabase_migrations.schema_migrations(version, name, statements)
values ('20260831130000', 'planning_relation_grid_columns',
        array['Added relation label columns to planning grids using DIRECT_URL'])
on conflict (version) do update
set name = excluded.name,
    statements = excluded.statements;

commit;

select pg_catalog.pg_notify('pgrst', 'reload schema');
