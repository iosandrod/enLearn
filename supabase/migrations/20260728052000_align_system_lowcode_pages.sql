-- Align system and notification low-code list pages with the user permission archive layout.

create or replace function pg_temp.align_admin_list_block(block jsonb, depth integer)
returns jsonb
language plpgsql
as $$
declare
  next_block jsonb := block;
  next_tabs jsonb := '[]'::jsonb;
  next_blocks jsonb;
  tab_item jsonb;
  child_item jsonb;
begin
  if next_block->>'kind' = 'buttonGroup' then
    next_block := next_block - 'title' - 'description';
  end if;

  if next_block->>'kind' = 'grid' then
    next_block := next_block - 'title' - 'description' - 'layout';
    next_block := jsonb_set(
      next_block,
      '{schema,grid,height}',
      to_jsonb(case when depth = 0 then 360 else 240 end),
      true
    );
  end if;

  if next_block->>'kind' = 'tabs' then
    next_block := next_block - 'title' - 'description' - 'layout';

    for tab_item in
      select value from jsonb_array_elements(coalesce(next_block->'tabs', '[]'::jsonb))
    loop
      next_blocks := '[]'::jsonb;

      for child_item in
        select value from jsonb_array_elements(coalesce(tab_item->'blocks', '[]'::jsonb))
      loop
        next_blocks := next_blocks || jsonb_build_array(pg_temp.align_admin_list_block(child_item, depth + 1));
      end loop;

      next_tabs := next_tabs || jsonb_build_array(jsonb_set(tab_item, '{blocks}', next_blocks, true));
    end loop;

    next_block := jsonb_set(next_block, '{tabs}', next_tabs, true);
  end if;

  return next_block;
end;
$$;

create or replace function pg_temp.align_admin_list_schema(page_schema jsonb)
returns jsonb
language plpgsql
as $$
declare
  next_blocks jsonb := '[]'::jsonb;
  block_item jsonb;
begin
  for block_item in
    select value from jsonb_array_elements(coalesce(page_schema->'blocks', '[]'::jsonb))
  loop
    next_blocks := next_blocks || jsonb_build_array(pg_temp.align_admin_list_block(block_item, 0));
  end loop;

  return jsonb_set(page_schema, '{blocks}', next_blocks, true);
end;
$$;

create or replace function pg_temp.align_execution_task_schema(page_schema jsonb)
returns jsonb
language plpgsql
as $$
declare
  next_schema jsonb := page_schema;
  original_grid jsonb;
  main_grid jsonb;
  row_config jsonb;
begin
  select value
  into original_grid
  from jsonb_array_elements(coalesce(page_schema->'blocks', '[]'::jsonb))
  where value->>'kind' = 'grid'
  limit 1;

  if original_grid is null then
    return pg_temp.align_admin_list_schema(page_schema);
  end if;

  main_grid := pg_temp.align_admin_list_block(original_grid, 0);
  main_grid := jsonb_set(main_grid, '{id}', to_jsonb('task-grid'::text), true);
  main_grid := jsonb_set(main_grid, '{sourceKey}', to_jsonb('systemExecutionTasks'::text), true);
  main_grid := main_grid #- '{schema,toolbar}';

  row_config := coalesce(main_grid#>'{schema,grid,rowConfig}', '{}'::jsonb);
  if not (row_config ? 'keyField') then
    row_config := row_config || '{"keyField":"id"}'::jsonb;
  end if;
  row_config := row_config || '{"isCurrent":true}'::jsonb;
  main_grid := jsonb_set(main_grid, '{schema,grid,rowConfig}', row_config, true);
  main_grid := jsonb_set(
    main_grid,
    '{schema,events}',
    $json$
    {
      "rowCurrentChange": [
        {
          "type": "setDataSource",
          "sourceKey": "selectedSystemExecutionTaskRows",
          "value": ["{{ event.row }}"]
        }
      ]
    }
    $json$::jsonb,
    true
  );

  next_schema := jsonb_set(
    next_schema,
    '{dataSources,selectedSystemExecutionTaskRows}',
    $json$
    {
      "key": "selectedSystemExecutionTaskRows",
      "serviceName": "admin",
      "serviceMethod": "listSystemExecutionTasks",
      "autoLoad": false
    }
    $json$::jsonb,
    true
  );

  next_schema := jsonb_set(
    next_schema,
    '{blocks}',
    jsonb_build_array(
      $json$
      {
        "id": "task-grid-actions",
        "kind": "buttonGroup",
        "align": "left",
        "gap": 8,
        "actions": [
          {
            "code": "refresh",
            "label": "刷新",
            "status": "primary",
            "icon": "ri-refresh-line",
            "directives": [
              { "type": "refreshDataSource", "sourceKeys": ["systemExecutionTasks"] }
            ]
          }
        ]
      }
      $json$::jsonb,
      main_grid,
      $json$
      {
        "id": "task-grid-child-tabs",
        "kind": "tabs",
        "defaultKey": "taskDetail",
        "tabs": [
          {
            "key": "taskDetail",
            "label": "任务明细",
            "blocks": [
              {
                "id": "task-grid-detail-grid",
                "kind": "grid",
                "sourceKey": "selectedSystemExecutionTaskRows",
                "schema": {
                  "grid": {
                    "border": true,
                    "showOverflow": "tooltip",
                    "height": 240,
                    "rowConfig": { "keyField": "id" },
                    "columns": [
                      { "field": "name", "title": "任务名称", "minWidth": 180, "showOverflow": "tooltip" },
                      { "field": "code", "title": "编码", "minWidth": 180, "showOverflow": "tooltip" },
                      { "field": "trigger_task_id", "title": "Trigger 任务", "minWidth": 220, "showOverflow": "tooltip" },
                      { "field": "schedule_rule", "title": "调度规则", "minWidth": 180, "showOverflow": "tooltip" },
                      { "field": "last_error_message", "title": "错误信息", "minWidth": 260, "showOverflow": "tooltip" }
                    ]
                  },
                  "rowActions": { "edit": false, "delete": false }
                }
              }
            ]
          }
        ]
      }
      $json$::jsonb
    ),
    true
  );

  return next_schema;
end;
$$;

update public.lowcode_pages
set
  schema = case
    when code = 'admin-system-execution-tasks' then pg_temp.align_execution_task_schema(schema)
    else pg_temp.align_admin_list_schema(schema)
  end,
  version = version + 1,
  updated_at = timezone('utc'::text, now())
where code in (
  'admin-system-roles',
  'admin-system-permissions',
  'admin-system-routes',
  'admin-system-entities',
  'admin-system-options',
  'admin-system-execution-tasks',
  'notification-message-center',
  'notification-deliveries'
);

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in (
  'admin-system-roles',
  'admin-system-permissions',
  'admin-system-routes',
  'admin-system-entities',
  'admin-system-options',
  'admin-system-execution-tasks',
  'notification-message-center',
  'notification-deliveries'
)
on conflict (page_id, version) do nothing;
