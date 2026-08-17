-- Split planning inputs from result browsing filters and pass run parameters
-- through the planning service override contract.

begin;

create or replace function pg_temp.set_planning_console_action_script(
  p_document jsonb,
  p_action_code text,
  p_script text
)
returns jsonb
language plpgsql
as $function$
declare
  v_result jsonb;
begin
  case jsonb_typeof(p_document)
    when 'object' then
      if p_document ->> 'id' = 'planning_console_actions'
         and jsonb_typeof(p_document -> 'actions') = 'array' then
        select jsonb_agg(
          case
            when action.value ->> 'code' = p_action_code
            then jsonb_set(action.value, '{script}', to_jsonb(p_script), true)
            else action.value
          end
          order by action.ordinality
        )
        into v_result
        from jsonb_array_elements(p_document -> 'actions')
          with ordinality as action(value, ordinality);
        return jsonb_set(p_document, '{actions}', coalesce(v_result, '[]'::jsonb), true);
      end if;

      select jsonb_object_agg(
        entry.key,
        pg_temp.set_planning_console_action_script(entry.value, p_action_code, p_script)
      )
      into v_result
      from jsonb_each(p_document) as entry;
      return coalesce(v_result, '{}'::jsonb);

    when 'array' then
      select jsonb_agg(
        pg_temp.set_planning_console_action_script(item.value, p_action_code, p_script)
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
  v_parameter_block jsonb := $json$
  {
    "id": "planning_console_filter",
    "kind": "form",
    "formType": "default",
    "title": "排程参数设置",
    "initialValues": {
      "scenarioId": "",
      "runName": "控制台排产运行",
      "currentDate": "now",
      "solver": "heuristic",
      "constraints": 52,
      "iterationMax": 0,
      "resourceIterationMax": 500,
      "rotateResources": true,
      "individualPoolResources": false
    },
    "schema": {
      "columns": 4,
      "fields": [
        {
          "field": "scenarioId",
          "label": "排产场景",
          "component": "vxe-select",
          "required": true,
          "optionsSourceKey": "scenarioOptions",
          "optionProps": { "label": "label", "value": "id" },
          "props": { "clearable": true, "filterable": true, "placeholder": "选择排产场景" },
          "events": {
            "change": [
              { "type": "setFormField", "blockId": "planning_console_result_filter", "field": "planVersionId", "value": "" },
              {
                "type": "refreshDataSources",
                "sourceKeys": ["summary", "demands", "operationPlans", "materials", "planResources", "resourcePlans", "problems", "constraints", "runs", "flow", "bom", "versionOptions"]
              }
            ]
          }
        },
        { "field": "runName", "label": "运行名称", "component": "vxe-input", "props": { "clearable": true, "placeholder": "控制台排产运行" } },
        { "field": "currentDate", "label": "计划当前时间", "component": "vxe-input", "props": { "clearable": true, "placeholder": "now 或 ISO 时间" } },
        {
          "field": "solver",
          "label": "求解器",
          "component": "vxe-select",
          "props": { "clearable": false },
          "options": [
            { "label": "启发式（标准）", "value": "heuristic" },
            { "label": "启发式（备选）", "value": "heuristic_2" }
          ]
        },
        { "field": "constraints", "label": "约束级别", "component": "lc-number-input", "props": { "min": 0, "step": 1 } },
        { "field": "iterationMax", "label": "计划迭代上限", "component": "lc-number-input", "props": { "min": 0, "step": 1 } },
        { "field": "resourceIterationMax", "label": "资源迭代上限", "component": "lc-number-input", "props": { "min": 0, "step": 1 } },
        { "field": "rotateResources", "label": "轮换资源", "component": "vxe-switch" },
        { "field": "individualPoolResources", "label": "资源池独立排产", "component": "vxe-switch" }
      ],
      "actions": []
    },
    "materialVersion": "1.0.0"
  }
  $json$::jsonb;
  v_result_filter_block jsonb := $json$
  {
    "id": "planning_console_result_filter",
    "kind": "searchForm",
    "title": "结果筛选",
    "targetSourceKey": "summary",
    "targetSourceKeys": ["summary", "demands", "operationPlans", "materials", "planResources", "resourcePlans", "problems", "constraints", "runs", "flow", "bom"],
    "initialValues": {
      "planVersionId": "",
      "itemId": "",
      "resourceId": "",
      "operationId": "",
      "operationStatus": "",
      "demandStatus": "",
      "from": "",
      "to": ""
    },
    "schema": {
      "columns": 4,
      "fields": [
        { "field": "planVersionId", "label": "计划版本", "component": "vxe-select", "optionsSourceKey": "versionOptions", "optionProps": { "label": "label", "value": "id" }, "props": { "clearable": true, "filterable": true, "placeholder": "自动选择当前版本" } },
        { "field": "itemId", "label": "物料", "component": "vxe-select", "optionsSourceKey": "itemOptions", "optionProps": { "label": "label", "value": "id" }, "props": { "clearable": true, "filterable": true, "placeholder": "全部物料" } },
        { "field": "resourceId", "label": "资源", "component": "vxe-select", "optionsSourceKey": "resourceOptions", "optionProps": { "label": "label", "value": "id" }, "props": { "clearable": true, "filterable": true, "placeholder": "全部资源" } },
        { "field": "operationId", "label": "工序", "component": "vxe-select", "optionsSourceKey": "operationOptions", "optionProps": { "label": "label", "value": "id" }, "props": { "clearable": true, "filterable": true, "placeholder": "全部工序" } },
        { "field": "operationStatus", "label": "计划单状态", "component": "vxe-select", "props": { "clearable": true }, "options": [{ "label": "proposed", "value": "proposed" }, { "label": "approved", "value": "approved" }, { "label": "confirmed", "value": "confirmed" }, { "label": "completed", "value": "completed" }, { "label": "closed", "value": "closed" }] },
        { "field": "demandStatus", "label": "需求状态", "component": "vxe-select", "props": { "clearable": true }, "options": [{ "label": "inquiry", "value": "inquiry" }, { "label": "quote", "value": "quote" }, { "label": "open", "value": "open" }, { "label": "closed", "value": "closed" }, { "label": "canceled", "value": "canceled" }] },
        { "field": "from", "label": "开始时间", "component": "vxe-input", "props": { "clearable": true, "type": "datetime-local" } },
        { "field": "to", "label": "结束时间", "component": "vxe-input", "props": { "clearable": true, "type": "datetime-local" } }
      ],
      "actions": [
        { "code": "submit", "label": "应用筛选", "type": "submit", "status": "primary" },
        { "code": "reset", "label": "重置", "type": "reset" }
      ]
    },
    "materialVersion": "1.0.0"
  }
  $json$::jsonb;
  v_filters jsonb := $json$
  {
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
  $json$::jsonb;
  v_required_sources jsonb := $json$
  {
    "summary": {
      "key": "summary",
      "label": "排产控制台·summary",
      "sourceType": "custom",
      "serviceName": "planning",
      "serviceMethod": "getPlanningConsoleData",
      "postData": { "dataset": "summary", "filters": {} },
      "autoLoad": true
    },
    "scenarioOptions": {
      "key": "scenarioOptions",
      "label": "计划场景选项",
      "sourceType": "custom",
      "serviceName": "planning",
      "serviceMethod": "getPlanningConsoleOptions",
      "postData": { "optionType": "scenario" },
      "autoLoad": true
    },
    "versionOptions": {
      "key": "versionOptions",
      "label": "计划版本选项",
      "sourceType": "custom",
      "serviceName": "planning",
      "serviceMethod": "listPlanningConsoleVersions",
      "postData": { "scenarioId": "{{ forms.planning_console_filter.scenarioId }}" },
      "autoLoad": true
    },
    "itemOptions": {
      "key": "itemOptions",
      "label": "物料选项",
      "sourceType": "custom",
      "serviceName": "planning",
      "serviceMethod": "getPlanningConsoleOptions",
      "postData": { "optionType": "item" },
      "autoLoad": true
    },
    "resourceOptions": {
      "key": "resourceOptions",
      "label": "资源选项",
      "sourceType": "custom",
      "serviceName": "planning",
      "serviceMethod": "getPlanningConsoleOptions",
      "postData": { "optionType": "resource" },
      "autoLoad": true
    },
    "operationOptions": {
      "key": "operationOptions",
      "label": "工序选项",
      "sourceType": "custom",
      "serviceName": "planning",
      "serviceMethod": "getPlanningConsoleOptions",
      "postData": { "optionType": "operation" },
      "autoLoad": true
    },
    "planningRunStarted": {
      "key": "planningRunStarted",
      "label": "新建排产运行",
      "sourceType": "custom",
      "serviceName": "planning",
      "serviceMethod": "runSupplyPlan",
      "postData": {},
      "autoLoad": false
    },
    "planningRunCanceled": {
      "key": "planningRunCanceled",
      "label": "取消排产运行",
      "sourceType": "custom",
      "serviceName": "planning",
      "serviceMethod": "cancelPlanningRun",
      "postData": {},
      "autoLoad": false
    },
    "planningVersionPublished": {
      "key": "planningVersionPublished",
      "label": "发布计划版本",
      "sourceType": "custom",
      "serviceName": "planning",
      "serviceMethod": "publishPlanVersion",
      "postData": {},
      "autoLoad": false
    },
    "runtimeCapabilities": {
      "key": "runtimeCapabilities",
      "label": "排产运行能力",
      "sourceType": "custom",
      "serviceName": "planning",
      "serviceMethod": "getRuntimeCapabilities",
      "postData": {},
      "autoLoad": true
    }
  }
  $json$::jsonb;
  v_preflight_script text := $script$async function main() {
  const filter = this.forms.planning_console_filter || {};
  const scenarioId = String(filter.scenarioId || "").trim();
  if (!scenarioId) {
    await this.$message.warning("请先选择排产场景。");
    return false;
  }
  const overrides = {
    currentdate: String(filter.currentDate || "now").trim() || "now",
    "plan.solver": String(filter.solver || "heuristic").trim() || "heuristic",
    constraints: Number(filter.constraints ?? 52),
    "plan.iterationmax": Number(filter.iterationMax ?? 0),
    "plan.resourceiterationmax": Number(filter.resourceIterationMax ?? 500),
    "plan.rotateResources": filter.rotateResources !== false,
    "plan.individualPoolResources": filter.individualPoolResources === true,
  };
  const issues = await this.executeHttp({
    api: "planningPreflight",
    method: "POST",
    body: { jobType: "supply_plan", scenarioId, overrides },
  });
  await this.$source.set("preflightIssues", issues);
  const rows = Array.isArray(issues) ? issues : [];
  const errorCount = rows.filter((issue) => issue && issue.severity === "error").length;
  const warningCount = rows.filter((issue) => issue && issue.severity === "warning").length;
  if (errorCount > 0) {
    await this.$message.warning("预检完成，发现 " + errorCount + " 项错误和 " + warningCount + " 项警告。");
  } else {
    await this.$message.success("数据完整性预检通过。");
  }
  return issues;
}$script$;
  v_run_script text := $script$async function main() {
  const filter = this.forms.planning_console_filter || {};
  const scenarioId = String(filter.scenarioId || "").trim();
  if (!scenarioId) {
    await this.$message.warning("请先选择排产场景。");
    return false;
  }
  const overrides = {
    currentdate: String(filter.currentDate || "now").trim() || "now",
    "plan.solver": String(filter.solver || "heuristic").trim() || "heuristic",
    constraints: Number(filter.constraints ?? 52),
    "plan.iterationmax": Number(filter.iterationMax ?? 0),
    "plan.resourceiterationmax": Number(filter.resourceIterationMax ?? 500),
    "plan.rotateResources": filter.rotateResources !== false,
    "plan.individualPoolResources": filter.individualPoolResources === true,
  };

  const capabilities = this.data.runtimeCapabilities || {};
  const engine = capabilities.engine || {};
  const trigger = capabilities.trigger || {};
  const worker = capabilities.worker || {};
  if (capabilities.canManage !== true) {
    await this.$message.error("当前用户没有启动排产的权限。");
    return false;
  }
  if (engine.available !== true) {
    await this.$message.warning("排产引擎当前不可用，请检查 frePPLe 运行配置。");
    return false;
  }
  if (trigger.configured !== true) {
    await this.$message.warning("后台任务服务当前不可用，请先完成运行配置。");
    return false;
  }
  if (worker.online !== true) {
    await this.$message.warning(worker.online === false
      ? "Trigger.dev Worker 当前离线，请先启动排产后台任务。"
      : "无法确认 Trigger.dev Worker 在线状态，请检查后台任务服务。");
    return false;
  }

  const result = await this.executeHttp({
    api: "planningRun",
    method: "POST",
    body: {
      jobType: "supply_plan",
      scenarioId,
      name: String(filter.runName || "").trim() || "控制台排产运行",
      overrides,
    },
  });
  await this.$source.set("planningRunStarted", result);
  await this.$source.refresh("summary");
  await this.$source.refresh("runs");
  await this.$source.refresh("versionOptions");
  await this.$message.success("排产任务已提交。");
  return result;
}$script$;
  v_publish_script text := $script$async function main() {
  const filter = this.forms.planning_console_result_filter || {};
  const summary = this.data.summary || {};
  const versionId = String(filter.planVersionId || summary.versionId || "").trim();
  if (!versionId) {
    await this.$message.warning("当前没有可发布的计划版本。");
    return false;
  }

  const options = Array.isArray(this.data.versionOptions) ? this.data.versionOptions : [];
  const selected = options.find((option) => option && option.id === versionId);
  const versionStatus = String((selected && selected.status) || summary.versionStatus || "");
  if (versionStatus !== "completed") {
    await this.$message.warning("仅已完成的计划版本可以发布。");
    return false;
  }

  const result = await this.executeHttp({
    api: "planningPublish",
    method: "POST",
    body: { id: versionId },
  });
  await this.$source.set("planningVersionPublished", result);
  await this.$source.refresh("summary");
  await this.$source.refresh("demands");
  await this.$source.refresh("operationPlans");
  await this.$source.refresh("materials");
  await this.$source.refresh("planResources");
  await this.$source.refresh("resourcePlans");
  await this.$source.refresh("problems");
  await this.$source.refresh("constraints");
  await this.$source.refresh("runs");
  await this.$source.refresh("flow");
  await this.$source.refresh("bom");
  await this.$source.refresh("versionOptions");
  await this.$message.success("计划版本已发布。");
  return result;
}$script$;
  v_source_key text;
  v_parameter_ordinality bigint;
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

  select block.ordinality
  into v_parameter_ordinality
  from jsonb_array_elements(v_current_schema -> 'blocks')
    with ordinality as block(value, ordinality)
  where block.value ->> 'id' = 'planning_console_filter'
  limit 1;

  if v_parameter_ordinality is null then
    raise exception 'Planning console parameter block is missing.';
  end if;

  select jsonb_set(
    v_current_schema,
    '{blocks}',
    (
      select jsonb_agg(candidate.value order by candidate.ordinality, candidate.position)
      from (
        select
          case when block.value ->> 'id' = 'planning_console_filter'
            then v_parameter_block else block.value end as value,
          block.ordinality,
          0 as position
        from jsonb_array_elements(v_current_schema -> 'blocks')
          with ordinality as block(value, ordinality)
        where block.value ->> 'id' <> 'planning_console_result_filter'

        union all

        select v_result_filter_block, v_parameter_ordinality, 1
      ) as candidate
    ),
    false
  )
  into v_next_schema;

  v_next_schema := jsonb_set(
    v_next_schema,
    '{dataSources}',
    coalesce(v_next_schema -> 'dataSources', '{}'::jsonb) || v_required_sources,
    true
  );
  v_next_schema := jsonb_set(
    v_next_schema,
    '{scriptPolicy,context,dataSourceKeys}',
    '["runtimeCapabilities", "summary", "versionOptions"]'::jsonb,
    true
  );
  v_next_schema := jsonb_set(
    v_next_schema,
    '{scriptPolicy,context,searchSourceKeys}',
    '[]'::jsonb,
    true
  );
  v_next_schema := jsonb_set(
    v_next_schema,
    '{scriptPolicy,context,gridBlockIds}',
    '["planning_console_runs_grid"]'::jsonb,
    true
  );
  v_next_schema := jsonb_set(
    v_next_schema,
    '{scriptPolicy,capabilities}',
    '["http.execute", "source.refresh", "source.set", "message.error", "message.success", "message.warning"]'::jsonb,
    true
  );
  v_next_schema := jsonb_set(
    v_next_schema,
    '{apis,planningPreflight}',
    '{"serviceName":"planning","serviceMethod":"preflightSupplyPlanIssues","method":"POST"}'::jsonb,
    true
  );
  v_next_schema := jsonb_set(
    v_next_schema,
    '{apis,planningRun}',
    '{"serviceName":"planning","serviceMethod":"runSupplyPlan","method":"POST"}'::jsonb,
    true
  );
  v_next_schema := jsonb_set(
    v_next_schema,
    '{apis,planningCancel}',
    '{"serviceName":"planning","serviceMethod":"cancelPlanningRun","method":"POST"}'::jsonb,
    true
  );
  v_next_schema := jsonb_set(
    v_next_schema,
    '{apis,planningPublish}',
    '{"serviceName":"planning","serviceMethod":"publishPlanVersion","method":"POST"}'::jsonb,
    true
  );

  foreach v_source_key in array array[
    'summary', 'demands', 'operationPlans', 'materials', 'planResources',
    'resourcePlans', 'problems', 'constraints', 'runs', 'flow', 'bom'
  ]
  loop
    if v_next_schema #> array['dataSources', v_source_key] is null then
      raise exception 'Planning console data source % is missing.', v_source_key;
    end if;
    v_next_schema := jsonb_set(
      v_next_schema,
      array['dataSources', v_source_key, 'postData', 'filters'],
      v_filters,
      true
    );
  end loop;

  v_next_schema := jsonb_set(
    v_next_schema,
    '{dataSources,versionOptions,postData,scenarioId}',
    to_jsonb('{{ forms.planning_console_filter.scenarioId }}'::text),
    true
  );
  v_next_schema := jsonb_set(
    v_next_schema,
    '{scriptPolicy,context,formBlockIds}',
    '["planning_console_filter", "planning_console_result_filter"]'::jsonb,
    true
  );
  v_next_schema := pg_temp.set_planning_console_action_script(v_next_schema, 'preflight', v_preflight_script);
  v_next_schema := pg_temp.set_planning_console_action_script(v_next_schema, 'run', v_run_script);
  v_next_schema := pg_temp.set_planning_console_action_script(v_next_schema, 'publish', v_publish_script);

  if jsonb_path_query_first(v_next_schema, 'strict $.blocks[*] ? (@.id == "planning_console_filter" && @.kind == "form")') is null
     or jsonb_path_query_first(v_next_schema, 'strict $.blocks[*] ? (@.id == "planning_console_result_filter" && @.kind == "searchForm")') is null then
    raise exception 'Planning console form split validation failed.';
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

commit;
