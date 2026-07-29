-- Align workflow job low-code pages with the user permission archive layout.

create or replace function pg_temp.workflow_page_main_grid(block jsonb, key_field text)
returns jsonb
language plpgsql
as $$
declare
  next_block jsonb := block;
  row_config jsonb;
begin
  next_block := next_block - 'title' - 'description' - 'layout';
  next_block := next_block #- '{schema,toolbar}';
  next_block := jsonb_set(next_block, '{schema,rowActions}', '{"edit":false,"delete":false}'::jsonb, true);
  next_block := jsonb_set(next_block, '{schema,grid,height}', to_jsonb(360), true);
  next_block := jsonb_set(next_block, '{schema,grid,showOverflow}', to_jsonb('tooltip'::text), true);

  row_config := coalesce(next_block#>'{schema,grid,rowConfig}', '{}'::jsonb);
  row_config := row_config || jsonb_build_object('keyField', key_field, 'isCurrent', true);
  next_block := jsonb_set(next_block, '{schema,grid,rowConfig}', row_config, true);

  return next_block;
end;
$$;

do $$
declare
  page_row record;
  main_grid jsonb;
  next_schema jsonb;
begin
  select *
  into page_row
  from public.lowcode_pages
  where code = 'admin-workflow-jobs';

  if found then
    select value
    into main_grid
    from jsonb_array_elements(coalesce(page_row.schema->'blocks', '[]'::jsonb))
    where value->>'id' = 'workflow-job-grid'
       or (value->>'kind' = 'grid' and value->>'sourceKey' = 'workflowJobs')
    limit 1;

    if main_grid is not null then
      main_grid := pg_temp.workflow_page_main_grid(main_grid, 'id');
      main_grid := jsonb_set(
        main_grid,
        '{schema,events}',
        $json$
        {
          "rowCurrentChange": [
            {
              "type": "setDataSource",
              "sourceKey": "selectedWorkflowJobRows",
              "value": ["{{ event.row }}"]
            },
            {
              "type": "invokeService",
              "serviceName": "admin",
              "serviceMethod": "listWorkflowJobRuns",
              "postData": {
                "jobId": "{{ event.row.id }}",
                "limit": 200
              },
              "assignTo": "selectedWorkflowJobRunRows"
            }
          ]
        }
        $json$::jsonb,
        true
      );

      next_schema := page_row.schema;
      next_schema := jsonb_set(
        next_schema,
        '{dataSources,workflowJobs,postData}',
        '{"limit":500}'::jsonb,
        true
      );
      next_schema := jsonb_set(
        next_schema,
        '{dataSources,selectedWorkflowJobRunRows}',
        $json$
        {
          "key": "selectedWorkflowJobRunRows",
          "label": "\u9009\u4e2d Job \u8fd0\u884c\u8bb0\u5f55",
          "serviceName": "admin",
          "serviceMethod": "listWorkflowJobRuns",
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
            "id": "workflow-job-grid-actions",
            "kind": "buttonGroup",
            "align": "left",
            "gap": 8,
            "actions": [
              {
                "code": "show-all-workflow-jobs",
                "label": "\u5168\u90e8",
                "status": "primary",
                "icon": "ri-list-check-2",
                "directives": [
                  { "type": "setSearchFilters", "sourceKey": "workflowJobs", "mode": "replace", "values": {} }
                ]
              },
              {
                "code": "show-enabled-workflow-jobs",
                "label": "\u5df2\u542f\u7528",
                "icon": "ri-play-circle-line",
                "directives": [
                  { "type": "setSearchFilters", "sourceKey": "workflowJobs", "mode": "replace", "values": { "status": "enabled" } }
                ]
              },
              {
                "code": "show-disabled-workflow-jobs",
                "label": "\u5df2\u7981\u7528",
                "icon": "ri-pause-circle-line",
                "directives": [
                  { "type": "setSearchFilters", "sourceKey": "workflowJobs", "mode": "replace", "values": { "status": "disabled" } }
                ]
              },
              {
                "code": "reload-workflow-jobs",
                "label": "\u5237\u65b0",
                "icon": "ri-refresh-line",
                "directives": [
                  { "type": "refreshDataSource", "sourceKeys": ["workflowJobs"] }
                ]
              }
            ]
          }
          $json$::jsonb,
          main_grid,
          $json$
          {
            "id": "workflow-job-grid-child-tabs",
            "kind": "tabs",
            "defaultKey": "runs",
            "tabs": [
              {
                "key": "runs",
                "label": "\u8fd0\u884c\u8bb0\u5f55",
                "blocks": [
                  {
                    "id": "workflow-job-selected-runs-grid",
                    "kind": "grid",
                    "sourceKey": "selectedWorkflowJobRunRows",
                    "schema": {
                      "grid": {
                        "border": true,
                        "stripe": true,
                        "showOverflow": "tooltip",
                        "height": 240,
                        "rowConfig": { "keyField": "id", "isCurrent": true },
                        "columns": [
                          { "field": "job_name", "title": "Job \u540d\u79f0", "minWidth": 180, "showOverflow": "tooltip" },
                          { "field": "job_code", "title": "Job \u7f16\u7801", "minWidth": 190, "showOverflow": "tooltip" },
                          { "field": "status_label", "title": "\u72b6\u6001", "width": 120, "align": "center" },
                          { "field": "attempt", "title": "\u5c1d\u8bd5", "width": 90, "align": "center" },
                          { "field": "trigger_run_id", "title": "Trigger Run", "minWidth": 220, "showOverflow": "tooltip" },
                          { "field": "duration_ms", "title": "\u8017\u65f6(ms)", "width": 120, "align": "right", "formatter": { "type": "number", "locale": "zh-CN", "emptyText": "-" } },
                          { "field": "error_message", "title": "\u9519\u8bef\u4fe1\u606f", "minWidth": 240, "showOverflow": "tooltip" },
                          { "field": "started_at", "title": "\u5f00\u59cb\u65f6\u95f4", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
                          { "field": "finished_at", "title": "\u7ed3\u675f\u65f6\u95f4", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } },
                          { "field": "created_at", "title": "\u521b\u5efa\u65f6\u95f4", "width": 180, "formatter": { "type": "datetime", "locale": "zh-CN", "emptyText": "-" } }
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

      update public.lowcode_pages
      set
        schema = next_schema,
        version = version + 1,
        published_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
      where id = page_row.id;
    end if;
  end if;
end;
$$;

do $$
declare
  page_row record;
  main_grid jsonb;
  next_schema jsonb;
begin
  select *
  into page_row
  from public.lowcode_pages
  where code = 'admin-workflow-job-runs';

  if found then
    select value
    into main_grid
    from jsonb_array_elements(coalesce(page_row.schema->'blocks', '[]'::jsonb))
    where value->>'id' = 'workflow-job-run-grid'
       or (value->>'kind' = 'grid' and value->>'sourceKey' = 'workflowJobRuns')
    limit 1;

    if main_grid is not null then
      next_schema := jsonb_set(
        page_row.schema,
        '{blocks}',
        jsonb_build_array(
          $json$
          {
            "id": "workflow-job-run-grid-actions",
            "kind": "buttonGroup",
            "align": "left",
            "gap": 8,
            "actions": [
              {
                "code": "show-all-workflow-job-runs",
                "label": "\u5168\u90e8",
                "status": "primary",
                "icon": "ri-list-check-2",
                "directives": [
                  { "type": "setSearchFilters", "sourceKey": "workflowJobRuns", "mode": "replace", "values": {} }
                ]
              },
              {
                "code": "show-succeeded-workflow-job-runs",
                "label": "\u6210\u529f",
                "icon": "ri-checkbox-circle-line",
                "directives": [
                  { "type": "setSearchFilters", "sourceKey": "workflowJobRuns", "mode": "replace", "values": { "status": "succeeded" } }
                ]
              },
              {
                "code": "show-failed-workflow-job-runs",
                "label": "\u5931\u8d25",
                "icon": "ri-close-circle-line",
                "directives": [
                  { "type": "setSearchFilters", "sourceKey": "workflowJobRuns", "mode": "replace", "values": { "status": "failed" } }
                ]
              },
              {
                "code": "show-running-workflow-job-runs",
                "label": "\u6267\u884c\u4e2d",
                "icon": "ri-loader-4-line",
                "directives": [
                  { "type": "setSearchFilters", "sourceKey": "workflowJobRuns", "mode": "replace", "values": { "status": "running" } }
                ]
              },
              {
                "code": "reload-workflow-job-runs",
                "label": "\u5237\u65b0",
                "icon": "ri-refresh-line",
                "directives": [
                  { "type": "refreshDataSource", "sourceKeys": ["workflowJobRuns"] }
                ]
              }
            ]
          }
          $json$::jsonb,
          pg_temp.workflow_page_main_grid(main_grid, 'id')
        ),
        true
      );

      update public.lowcode_pages
      set
        schema = next_schema,
        version = version + 1,
        published_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
      where id = page_row.id;
    end if;
  end if;
end;
$$;

do $$
declare
  page_row record;
  main_grid jsonb;
  next_schema jsonb;
begin
  select *
  into page_row
  from public.lowcode_pages
  where code = 'admin-workflow-timer-jobs';

  if found then
    select value
    into main_grid
    from jsonb_array_elements(coalesce(page_row.schema->'blocks', '[]'::jsonb))
    where value->>'id' = 'workflow-timer-job-grid'
       or (value->>'kind' = 'grid' and value->>'sourceKey' = 'workflowTimerJobs')
    limit 1;

    if main_grid is not null then
      next_schema := jsonb_set(
        page_row.schema,
        '{blocks}',
        jsonb_build_array(
          $json$
          {
            "id": "workflow-timer-job-grid-actions",
            "kind": "buttonGroup",
            "align": "left",
            "gap": 8,
            "actions": [
              {
                "code": "show-all-workflow-timer-jobs",
                "label": "\u5168\u90e8",
                "status": "primary",
                "icon": "ri-list-check-2",
                "directives": [
                  { "type": "setSearchFilters", "sourceKey": "workflowTimerJobs", "mode": "replace", "values": {} }
                ]
              },
              {
                "code": "show-waiting-workflow-timer-jobs",
                "label": "\u7b49\u5f85\u4e2d",
                "icon": "ri-time-line",
                "directives": [
                  { "type": "setSearchFilters", "sourceKey": "workflowTimerJobs", "mode": "replace", "values": { "status": "waiting" } }
                ]
              },
              {
                "code": "show-fired-workflow-timer-jobs",
                "label": "\u5df2\u89e6\u53d1",
                "icon": "ri-flashlight-line",
                "directives": [
                  { "type": "setSearchFilters", "sourceKey": "workflowTimerJobs", "mode": "replace", "values": { "status": "fired" } }
                ]
              },
              {
                "code": "show-failed-workflow-timer-jobs",
                "label": "\u5931\u8d25",
                "icon": "ri-close-circle-line",
                "directives": [
                  { "type": "setSearchFilters", "sourceKey": "workflowTimerJobs", "mode": "replace", "values": { "status": "failed" } }
                ]
              },
              {
                "code": "reload-workflow-timer-jobs",
                "label": "\u5237\u65b0",
                "icon": "ri-refresh-line",
                "directives": [
                  { "type": "refreshDataSource", "sourceKeys": ["workflowTimerJobs"] }
                ]
              }
            ]
          }
          $json$::jsonb,
          pg_temp.workflow_page_main_grid(main_grid, 'id')
        ),
        true
      );

      update public.lowcode_pages
      set
        schema = next_schema,
        version = version + 1,
        published_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
      where id = page_row.id;
    end if;
  end if;
end;
$$;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code in (
  'admin-workflow-jobs',
  'admin-workflow-job-runs',
  'admin-workflow-timer-jobs'
)
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;
