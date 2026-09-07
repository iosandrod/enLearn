-- Keep the planning console focused on the version that was just submitted.
-- Older installations default to the current published version, which can make
-- a fresh run appear to keep showing stale Gantt dates.

begin;

with desired as (
  select $run_script$async function main() {
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
  const versionId = result && result.version && result.version.id ? String(result.version.id) : "";
  if (versionId) {
    await this.$form.patch("planning_console_result_filter", { planVersionId: versionId });
    await this.$source.refresh("summary");
    await this.$source.refresh("demands");
    await this.$source.refresh("operationPlans");
    await this.$source.refresh("materials");
    await this.$source.refresh("planResources");
    await this.$source.refresh("resourcePlans");
    await this.$source.refresh("problems");
    await this.$source.refresh("constraints");
    await this.$source.refresh("flow");
    await this.$source.refresh("bom");
  }
  await this.$message.success("排产任务已提交。");
  return result;
}$run_script$::text as run_script
),
pages as (
  select page.id, page.schema
  from public.lowcode_pages page
  where page.code = 'planning_console'
),
block_rows as (
  select
    page.id,
    page.schema,
    block.value as block,
    block.ordinality as block_ordinality
  from pages page
  cross join lateral jsonb_array_elements(coalesce(page.schema->'blocks', '[]'::jsonb))
    with ordinality as block(value, ordinality)
),
actions_by_block as (
  select
    block_rows.id,
    block_rows.block_ordinality,
    jsonb_agg(
      case
        when action.value->>'code' = 'run'
        then jsonb_set(action.value, '{script}', to_jsonb(desired.run_script), true)
        else action.value
      end
      order by action.ordinality
    ) as actions
  from block_rows
  cross join desired
  cross join lateral jsonb_array_elements(coalesce(block_rows.block->'actions', '[]'::jsonb))
    with ordinality as action(value, ordinality)
  where block_rows.block->>'id' = 'planning_console_actions'
  group by block_rows.id, block_rows.block_ordinality
),
blocks_by_page as (
  select
    block_rows.id,
    jsonb_agg(
      case
        when block_rows.block->>'id' = 'planning_console_actions'
          and actions_by_block.actions is not null
        then jsonb_set(block_rows.block, '{actions}', actions_by_block.actions, true)
        else block_rows.block
      end
      order by block_rows.block_ordinality
    ) as blocks
  from block_rows
  left join actions_by_block
    on actions_by_block.id = block_rows.id
   and actions_by_block.block_ordinality = block_rows.block_ordinality
  group by block_rows.id
),
capability_rows as (
  select
    page.id,
    capability.value#>>'{}' as capability,
    capability.ordinality::numeric as sort_order
  from pages page
  cross join lateral jsonb_array_elements(coalesce(page.schema#>'{scriptPolicy,capabilities}', '[]'::jsonb))
    with ordinality as capability(value, ordinality)
  union all
  select id, 'form.patch', 1.5
  from pages
),
capabilities_by_page as (
  select
    id,
    jsonb_agg(to_jsonb(capability) order by sort_order, capability) as capabilities
  from (
    select id, capability, min(sort_order) as sort_order
    from capability_rows
    where capability <> ''
    group by id, capability
  ) deduped
  group by id
),
patched as (
  select
    page.id,
    jsonb_set(
      jsonb_set(
        page.schema,
        '{blocks}',
        coalesce(blocks_by_page.blocks, page.schema->'blocks', '[]'::jsonb),
        true
      ),
      '{scriptPolicy,capabilities}',
      coalesce(capabilities_by_page.capabilities, '["form.patch"]'::jsonb),
      true
    ) as schema
  from pages page
  left join blocks_by_page on blocks_by_page.id = page.id
  left join capabilities_by_page on capabilities_by_page.id = page.id
)
update public.lowcode_pages page
set schema = patched.schema,
    version = case
      when page.schema is distinct from patched.schema
      then page.version + 1
      else page.version
    end,
    published_at = case
      when page.schema is distinct from patched.schema
      then timezone('utc'::text, now())
      else page.published_at
    end,
    updated_at = case
      when page.schema is distinct from patched.schema
      then timezone('utc'::text, now())
      else page.updated_at
    end
from patched
where page.id = patched.id;

insert into public.lowcode_page_versions (page_id, version, schema, published_at)
select id, version, schema, published_at
from public.lowcode_pages
where code = 'planning_console'
on conflict (page_id, version) do update set
  schema = excluded.schema,
  published_at = excluded.published_at;

commit;
