-- Group the planning-console detail grids into inner tabs.

begin;

create or replace function pg_temp.set_lowcode_tab_blocks(
  p_document jsonb,
  p_tabs_block_id text,
  p_tab_key text,
  p_blocks jsonb
)
returns jsonb
language plpgsql
as $function$
declare
  v_result jsonb;
  v_tabs jsonb;
begin
  case jsonb_typeof(p_document)
    when 'object' then
      if p_document ->> 'id' = p_tabs_block_id
        and jsonb_typeof(p_document -> 'tabs') = 'array'
      then
        select jsonb_agg(
          case
            when item.value ->> 'key' = p_tab_key
              then jsonb_set(item.value, '{blocks}', p_blocks, true)
            else item.value
          end
          order by item.ordinality
        )
        into v_tabs
        from jsonb_array_elements(p_document -> 'tabs')
          with ordinality as item(value, ordinality);

        return jsonb_set(p_document, '{tabs}', coalesce(v_tabs, '[]'::jsonb), true);
      end if;

      select jsonb_object_agg(
        entry.key,
        pg_temp.set_lowcode_tab_blocks(
          entry.value,
          p_tabs_block_id,
          p_tab_key,
          p_blocks
        )
      )
      into v_result
      from jsonb_each(p_document) as entry;
      return coalesce(v_result, '{}'::jsonb);

    when 'array' then
      select jsonb_agg(
        pg_temp.set_lowcode_tab_blocks(
          item.value,
          p_tabs_block_id,
          p_tab_key,
          p_blocks
        )
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
  v_next_schema := pg_temp.set_lowcode_tab_blocks(
    v_next_schema,
    'planning_console_tabs',
    'orders',
    jsonb_build_array('{"id":"planning_console_orders_tabs","kind":"tabs","defaultKey":"demands","className":"planning-console-inner-tabs planning-console-orders-tabs","tabs":[{"key":"demands","label":"需求","blocks":[{"id":"planning_console_demands_grid","kind":"grid","title":"需求","sourceKey":"demands","tableName":"planning_demand","clientFilter":false,"schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":432,"rowConfig":{"keyField":"id","isCurrent":false},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":56,"align":"center"},{"field":"name","title":"需求编号","minWidth":150,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"item_id_label","title":"物料","minWidth":160,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"customer_id_label","title":"客户","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"location_id_label","title":"地点","minWidth":130,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"due","title":"交期","minWidth":170,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"quantity","title":"需求量","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"plannedquantity","title":"已计划","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"deliverydate","title":"计划交付","minWidth":170,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"delay","title":"延期","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"},"align":"right"},{"field":"status","title":"状态","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}}]},"rowActions":{"edit":false,"delete":false,"actions":[]}},"materialVersion":"1.0.0"}]},{"key":"operation-plans","label":"计划单","blocks":[{"id":"planning_console_operation_plans_grid","kind":"grid","title":"计划单","sourceKey":"operationPlans","tableName":"planning_operationplan","clientFilter":false,"schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":432,"rowConfig":{"keyField":"id","isCurrent":false},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":56,"align":"center"},{"field":"reference","title":"计划单号","minWidth":160,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"type","title":"类型","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"},"width":90},{"field":"operation_id_label","title":"工序","minWidth":160,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"item_id_label","title":"物料","minWidth":160,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"location_id_label","title":"地点","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"quantity","title":"数量","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"startdate","title":"开始","minWidth":170,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"enddate","title":"结束","minWidth":170,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"delay","title":"延期","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"},"align":"right"},{"field":"status","title":"状态","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"demand_id_label","title":"需求","minWidth":150,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"plan_version_id_label","title":"版本","minWidth":130,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}}]},"rowActions":{"edit":false,"delete":false,"actions":[]}},"materialVersion":"1.0.0"}]}],"materialVersion":"1.0.0"}'::jsonb)
  );
  v_next_schema := pg_temp.set_lowcode_tab_blocks(
    v_next_schema,
    'planning_console_tabs',
    'supply',
    jsonb_build_array('{"id":"planning_console_supply_tabs","kind":"tabs","defaultKey":"materials","className":"planning-console-inner-tabs planning-console-supply-tabs","tabs":[{"key":"materials","label":"计划物料流","blocks":[{"id":"planning_console_materials_grid","kind":"grid","title":"计划物料流","sourceKey":"materials","tableName":"planning_operationplanmaterial","clientFilter":false,"schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":432,"rowConfig":{"keyField":"id","isCurrent":false},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":56,"align":"center"},{"field":"flowdate","title":"流动时间","minWidth":170,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"operationplan_id_label","title":"计划单","minWidth":160,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"item_id_label","title":"物料","minWidth":160,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"location_id_label","title":"地点","minWidth":140,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"quantity","title":"数量","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"onhand","title":"结余库存","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"minimum","title":"最低库存","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"status","title":"状态","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}}]},"rowActions":{"edit":false,"delete":false,"actions":[]}},"materialVersion":"1.0.0"}]},{"key":"plan-resources","label":"计划资源分配","blocks":[{"id":"planning_console_plan_resources_grid","kind":"grid","title":"计划资源分配","sourceKey":"planResources","tableName":"planning_operationplanresource","clientFilter":false,"schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":432,"rowConfig":{"keyField":"id","isCurrent":false},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":56,"align":"center"},{"field":"resource_id_label","title":"资源","minWidth":170,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"operationplan_id_label","title":"计划单","minWidth":160,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"quantity","title":"负荷","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"setup","title":"换型","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"plan_version_id_label","title":"版本","minWidth":130,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"status","title":"状态","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}}]},"rowActions":{"edit":false,"delete":false,"actions":[]}},"materialVersion":"1.0.0"}]},{"key":"resource-plans","label":"资源负荷","blocks":[{"id":"planning_console_resource_plans_grid","kind":"grid","title":"资源负荷","sourceKey":"resourcePlans","tableName":"planning_resourceplan","clientFilter":false,"schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":432,"rowConfig":{"keyField":"id","isCurrent":false},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":56,"align":"center"},{"field":"resource_id_label","title":"资源","minWidth":170,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"startdate","title":"时间桶","minWidth":170,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"available","title":"可用","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"load","title":"负荷","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"setup","title":"换型","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"free","title":"空闲","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"load_confirmed","title":"确认负荷","minWidth":120,"showOverflow":"tooltip","formatter":{"type":"number","locale":"zh-CN","emptyText":"0"},"align":"right"},{"field":"plan_version_id_label","title":"版本","minWidth":130,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}}]},"rowActions":{"edit":false,"delete":false,"actions":[]}},"materialVersion":"1.0.0"}]}],"materialVersion":"1.0.0"}'::jsonb)
  );
  v_next_schema := pg_temp.set_lowcode_tab_blocks(
    v_next_schema,
    'planning_console_tabs',
    'issues',
    jsonb_build_array('{"id":"planning_console_issues_tabs","kind":"tabs","defaultKey":"problems","className":"planning-console-inner-tabs planning-console-issues-tabs","tabs":[{"key":"problems","label":"计划问题","blocks":[{"id":"planning_console_problems_grid","kind":"grid","title":"计划问题","sourceKey":"problems","tableName":"planning_problem","clientFilter":false,"schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":432,"rowConfig":{"keyField":"id","isCurrent":false},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":56,"align":"center"},{"field":"entity","title":"实体","minWidth":130,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"owner","title":"对象","minWidth":170,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"name","title":"问题类型","minWidth":150,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"description","title":"问题说明","minWidth":360,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"startdate","title":"开始","minWidth":170,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"enddate","title":"结束","minWidth":170,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}}]},"rowActions":{"edit":false,"delete":false,"actions":[]}},"materialVersion":"1.0.0"}]},{"key":"constraints","label":"需求约束","blocks":[{"id":"planning_console_constraints_grid","kind":"grid","title":"需求约束","sourceKey":"constraints","tableName":"planning_constraint","clientFilter":false,"schema":{"grid":{"border":true,"stripe":true,"showOverflow":"tooltip","height":432,"rowConfig":{"keyField":"id","isCurrent":false},"columnConfig":{"resizable":true},"columns":[{"type":"seq","title":"序号","width":56,"align":"center"},{"field":"demand_id_label","title":"需求","minWidth":150,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"item_id_label","title":"物料","minWidth":150,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"name","title":"约束类型","minWidth":150,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"description","title":"约束说明","minWidth":360,"showOverflow":"tooltip","formatter":{"type":"text","emptyText":"-"}},{"field":"startdate","title":"开始","minWidth":170,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}},{"field":"enddate","title":"结束","minWidth":170,"showOverflow":"tooltip","formatter":{"type":"datetime","locale":"zh-CN","emptyText":"-"}}]},"rowActions":{"edit":false,"delete":false,"actions":[]}},"materialVersion":"1.0.0"}]}],"materialVersion":"1.0.0"}'::jsonb)
  );

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
