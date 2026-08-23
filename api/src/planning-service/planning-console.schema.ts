import type { LowCodePageSchema } from '../lowcode-service/lowcode.schema';

export const PLANNING_CONSOLE_PAGE_CODE = 'planning_console';
export const PLANNING_CONSOLE_ROUTE = '/dashboard/advanced/planning-console';
export const PLANNING_CONSOLE_SOURCE_KEYS = [
  'summary',
  'demands',
  'operationPlans',
  'materials',
  'planResources',
  'resourcePlans',
  'problems',
  'constraints',
  'runs',
  'flow',
  'bom'
] as const;
const PLANNING_CONSOLE_GANTT_SOURCE_KEY = 'operationPlanTimeline';

export const PLANNING_CONSOLE_GRID_TABLES = {
  planning_console_demands_grid: 'planning_demand',
  planning_console_operation_plans_grid: 'planning_operationplan',
  planning_console_materials_grid: 'planning_operationplanmaterial',
  planning_console_plan_resources_grid: 'planning_operationplanresource',
  planning_console_resource_plans_grid: 'planning_resourceplan',
  planning_console_problems_grid: 'planning_problem',
  planning_console_constraints_grid: 'planning_constraint',
  planning_console_runs_grid: 'planning_run'
} as const;

export const PLANNING_CONSOLE_GRID_SOURCE_TABLES = {
  demands: 'planning_demand',
  operationPlans: 'planning_operationplan',
  materials: 'planning_operationplanmaterial',
  planResources: 'planning_operationplanresource',
  resourcePlans: 'planning_resourceplan',
  problems: 'planning_problem',
  constraints: 'planning_constraint',
  runs: 'planning_run'
} as const;

type Row = Record<string, unknown>;

export type PlanningConsoleInnerTabs = {
  orders: Row;
  supply: Row;
  issues: Row;
};

const empty = { type: 'text', emptyText: '-' };
const number = { type: 'number', locale: 'zh-CN', emptyText: '0' };
const datetime = { type: 'datetime', locale: 'zh-CN', emptyText: '-' };

function column(
  field: string,
  title: string,
  options: Row = {}
) {
  return {
    field,
    title,
    minWidth: 120,
    showOverflow: 'tooltip',
    formatter: empty,
    ...options
  };
}

function grid(
  id: string,
  title: string,
  sourceKey: string,
  columns: Row[],
  options: { height?: number; current?: boolean; rowActions?: Row; tableName?: string } = {}
) {
  return {
    id,
    kind: 'grid',
    title,
    sourceKey,
    ...(options.tableName ? { tableName: options.tableName } : {}),
    clientFilter: false,
    schema: {
      grid: {
        border: true,
        stripe: true,
        showOverflow: 'tooltip',
        height: options.height ?? 432,
        rowConfig: { keyField: 'id', isCurrent: options.current === true },
        columnConfig: { resizable: true },
        columns: [
          { type: 'seq', title: '序号', width: 56, align: 'center' },
          ...columns
        ]
      },
      rowActions: options.rowActions ?? { edit: false, delete: false, actions: [] }
    }
  };
}

function consoleSource(
  dataset: typeof PLANNING_CONSOLE_SOURCE_KEYS[number],
  key: string = dataset
) {
  return {
    key,
    label: `排产控制台·${key}`,
    sourceType: 'custom' as const,
    serviceName: 'planning',
    serviceMethod: 'getPlanningConsoleData',
    postData: { dataset, filters: consoleFilterExpressions() },
    autoLoad: true
  };
}

function consoleGridSource(
  key: keyof typeof PLANNING_CONSOLE_GRID_SOURCE_TABLES,
  options: { filters?: Row; requiredFilters?: string[]; sorts?: Row[]; limit?: number } = {}
) {
  const tableName = PLANNING_CONSOLE_GRID_SOURCE_TABLES[key];
  const postData: Row = {
    resource: tableName,
    tableName,
    filters: options.filters ?? {},
    ...(options.requiredFilters?.length ? { requiredFilters: options.requiredFilters } : {}),
    ...(options.sorts?.length ? { sorts: options.sorts } : {}),
    limit: options.limit ?? 1000
  };
  return {
    key,
    label: `排产控制台·${key}`,
    sourceType: 'custom' as const,
    serviceName: 'planning',
    serviceMethod: 'listItems',
    postData,
    autoLoad: true
  };
}

export function selectPlanningConsoleInnerTabs(schema: LowCodePageSchema): PlanningConsoleInnerTabs {
  const tabsBlock = schema.blocks.find((block) => block.id === 'planning_console_tabs');
  const tabs = Array.isArray(tabsBlock?.tabs) ? tabsBlock.tabs : [];
  const selectInnerTabs = (key: keyof PlanningConsoleInnerTabs) => {
    const tab = tabs.find((candidate) => candidate && candidate.key === key);
    const innerTabs = Array.isArray(tab?.blocks) ? tab.blocks[0] : undefined;
    if (!innerTabs || typeof innerTabs !== 'object' || Array.isArray(innerTabs)) {
      throw new Error(`Planning console ${key} inner tabs are missing.`);
    }
    return innerTabs as Row;
  };

  return {
    orders: selectInnerTabs('orders'),
    supply: selectInnerTabs('supply'),
    issues: selectInnerTabs('issues')
  };
}

function consoleFilterExpressions() {
  return {
    scenarioId: '{{ forms.planning_console_filter.scenarioId }}',
    planVersionId: '{{ forms.planning_console_result_filter.planVersionId }}',
    itemId: '{{ forms.planning_console_result_filter.itemId }}',
    resourceId: '{{ forms.planning_console_result_filter.resourceId }}',
    operationId: '{{ forms.planning_console_result_filter.operationId }}',
    operationStatus: '{{ forms.planning_console_result_filter.operationStatus }}',
    demandStatus: '{{ forms.planning_console_result_filter.demandStatus }}',
    from: '{{ forms.planning_console_result_filter.from }}',
    to: '{{ forms.planning_console_result_filter.to }}'
  };
}

const refreshSources = [...PLANNING_CONSOLE_SOURCE_KEYS, PLANNING_CONSOLE_GANTT_SOURCE_KEY, 'versionOptions'];
const filteredSources = [...PLANNING_CONSOLE_SOURCE_KEYS, PLANNING_CONSOLE_GANTT_SOURCE_KEY];

const preflightScript = `async function main() {
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
}`;

const runScript = `async function main() {
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
}`;

const cancelScript = `async function main() {
  const grid = this.grids.planning_console_runs_grid || {};
  const run = grid.currentRow || null;
  if (!run || !run.id) {
    await this.$message.warning("请先在运行记录中选择一条任务。");
    return false;
  }
  if (!["queued", "running"].includes(String(run.status || ""))) {
    await this.$message.warning("仅排队中或运行中的任务可以取消。");
    return false;
  }

  const result = await this.executeHttp({
    api: "planningCancel",
    method: "POST",
    body: { runId: run.id },
  });
  await this.$source.set("planningRunCanceled", result);
  await this.$source.refresh("summary");
  await this.$source.refresh("runs");
  await this.$source.refresh("versionOptions");
  await this.$message.success("取消请求已提交。");
  return result;
}`;

const publishScript = `async function main() {
  const filter = this.forms.planning_console_result_filter || {};
  const options = Array.isArray(this.data.versionOptions) ? this.data.versionOptions : [];
  const versionId = String(
    filter.planVersionId || options.find((option) => option && option.is_current)?.id || ""
  ).trim();
  if (!versionId) {
    await this.$message.warning("当前没有可发布的计划版本。");
    return false;
  }

  const selected = options.find((option) => option && option.id === versionId);
  const versionStatus = String((selected && selected.status) || "");
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
}`;

export function buildPlanningConsolePageSchema(): LowCodePageSchema {
  return {
    schemaVersion: 1,
    code: PLANNING_CONSOLE_PAGE_CODE,
    route: PLANNING_CONSOLE_ROUTE,
    title: '排产控制台',
    description: '集中查看需求、计划、资源、物料、约束和 frePPLe 运行结果。',
    pageType: 'custom',
    layout: 'dashboard',
    status: 'published',
    keepAlive: true,
    apis: {
      planningPreflight: {
        serviceName: 'planning', serviceMethod: 'preflightSupplyPlanIssues', method: 'POST'
      },
      planningRun: {
        serviceName: 'planning', serviceMethod: 'runSupplyPlan', method: 'POST'
      },
      planningCancel: {
        serviceName: 'planning', serviceMethod: 'cancelPlanningRun', method: 'POST'
      },
      planningPublish: {
        serviceName: 'planning', serviceMethod: 'publishPlanVersion', method: 'POST'
      }
    },
    scriptPolicy: {
      context: {
        dataSourceKeys: ['runtimeCapabilities', 'versionOptions'],
        formBlockIds: ['planning_console_filter', 'planning_console_result_filter'],
        searchSourceKeys: [],
        gridBlockIds: ['planning_console_runs_grid']
      },
      capabilities: [
        'http.execute',
        'form.patch',
        'source.refresh',
        'source.set',
        'message.error',
        'message.success',
        'message.warning'
      ]
    },
    dataSources: {
      summary: consoleSource('summary'),
      demands: consoleGridSource('demands', {
        filters: {
          item_id: '{{ forms.planning_console_result_filter.itemId }}',
          status: '{{ forms.planning_console_result_filter.demandStatus }}',
          due: { op: 'gte', value: '{{ forms.planning_console_result_filter.from }}' }
        },
        sorts: [{ field: 'due', direction: 'asc' }]
      }),
      operationPlans: consoleGridSource('operationPlans', {
        filters: {
          plan_version_id: '{{ forms.planning_console_result_filter.planVersionId }}',
          item_id: '{{ forms.planning_console_result_filter.itemId }}',
          operation_id: '{{ forms.planning_console_result_filter.operationId }}',
          status: '{{ forms.planning_console_result_filter.operationStatus }}',
          startdate: { op: 'gte', value: '{{ forms.planning_console_result_filter.from }}' },
          enddate: { op: 'lte', value: '{{ forms.planning_console_result_filter.to }}' }
        },
        requiredFilters: ['plan_version_id'],
        sorts: [{ field: 'startdate', direction: 'asc' }]
      }),
      materials: consoleGridSource('materials', {
        filters: {
          plan_version_id: '{{ forms.planning_console_result_filter.planVersionId }}',
          item_id: '{{ forms.planning_console_result_filter.itemId }}',
          flowdate: { op: 'gte', value: '{{ forms.planning_console_result_filter.from }}' }
        },
        requiredFilters: ['plan_version_id'],
        sorts: [{ field: 'flowdate', direction: 'asc' }]
      }),
      planResources: consoleGridSource('planResources', {
        filters: {
          plan_version_id: '{{ forms.planning_console_result_filter.planVersionId }}',
          resource_id: '{{ forms.planning_console_result_filter.resourceId }}'
        },
        requiredFilters: ['plan_version_id'],
        sorts: [{ field: 'created_at', direction: 'asc' }]
      }),
      resourcePlans: consoleGridSource('resourcePlans', {
        filters: {
          plan_version_id: '{{ forms.planning_console_result_filter.planVersionId }}',
          resource_id: '{{ forms.planning_console_result_filter.resourceId }}',
          startdate: { op: 'gte', value: '{{ forms.planning_console_result_filter.from }}' }
        },
        requiredFilters: ['plan_version_id'],
        sorts: [{ field: 'startdate', direction: 'asc' }]
      }),
      problems: consoleGridSource('problems', {
        filters: {
          plan_version_id: '{{ forms.planning_console_result_filter.planVersionId }}',
          startdate: { op: 'gte', value: '{{ forms.planning_console_result_filter.from }}' }
        },
        requiredFilters: ['plan_version_id'],
        sorts: [{ field: 'startdate', direction: 'asc' }]
      }),
      constraints: consoleGridSource('constraints', {
        filters: {
          plan_version_id: '{{ forms.planning_console_result_filter.planVersionId }}',
          item_id: '{{ forms.planning_console_result_filter.itemId }}',
          startdate: { op: 'gte', value: '{{ forms.planning_console_result_filter.from }}' }
        },
        requiredFilters: ['plan_version_id'],
        sorts: [{ field: 'startdate', direction: 'asc' }]
      }),
      runs: consoleGridSource('runs', {
        filters: {
          scenario_id: '{{ forms.planning_console_filter.scenarioId }}',
          submitted: { op: 'gte', value: '{{ forms.planning_console_result_filter.from }}' }
        },
        sorts: [{ field: 'submitted', direction: 'desc' }],
        limit: 300
      }),
      [PLANNING_CONSOLE_GANTT_SOURCE_KEY]: consoleSource('operationPlans', PLANNING_CONSOLE_GANTT_SOURCE_KEY),
      flow: consoleSource('flow'),
      bom: consoleSource('bom'),
      preflightIssues: {
        key: 'preflightIssues',
        label: '数据完整性预检',
        sourceType: 'custom',
        serviceName: 'planning',
        serviceMethod: 'preflightSupplyPlanIssues',
        postData: { jobType: 'supply_plan' },
        autoLoad: false
      },
      scenarioOptions: {
        key: 'scenarioOptions',
        label: '计划场景选项',
        sourceType: 'custom',
        serviceName: 'planning',
        serviceMethod: 'getPlanningConsoleOptions',
        postData: { optionType: 'scenario' },
        autoLoad: true
      },
      versionOptions: {
        key: 'versionOptions',
        label: '计划版本选项',
        sourceType: 'custom',
        serviceName: 'planning',
        serviceMethod: 'listPlanningConsoleVersions',
        postData: { scenarioId: '{{ forms.planning_console_filter.scenarioId }}' },
        autoLoad: true
      },
      itemOptions: {
        key: 'itemOptions',
        label: '物料选项',
        sourceType: 'custom',
        serviceName: 'planning',
        serviceMethod: 'getPlanningConsoleOptions',
        postData: { optionType: 'item' },
        autoLoad: true
      },
      resourceOptions: {
        key: 'resourceOptions',
        label: '资源选项',
        sourceType: 'custom',
        serviceName: 'planning',
        serviceMethod: 'getPlanningConsoleOptions',
        postData: { optionType: 'resource' },
        autoLoad: true
      },
      operationOptions: {
        key: 'operationOptions',
        label: '工序选项',
        sourceType: 'custom',
        serviceName: 'planning',
        serviceMethod: 'getPlanningConsoleOptions',
        postData: { optionType: 'operation' },
        autoLoad: true
      },
      planningRunStarted: {
        key: 'planningRunStarted',
        label: '新建排产运行',
        sourceType: 'custom',
        serviceName: 'planning',
        serviceMethod: 'runSupplyPlan',
        postData: {},
        autoLoad: false
      },
      planningRunCanceled: {
        key: 'planningRunCanceled',
        label: '取消排产运行',
        sourceType: 'custom',
        serviceName: 'planning',
        serviceMethod: 'cancelPlanningRun',
        postData: {},
        autoLoad: false
      },
      planningVersionPublished: {
        key: 'planningVersionPublished',
        label: '发布计划版本',
        sourceType: 'custom',
        serviceName: 'planning',
        serviceMethod: 'publishPlanVersion',
        postData: {},
        autoLoad: false
      },
      runtimeCapabilities: {
        key: 'runtimeCapabilities',
        label: '排产运行能力',
        sourceType: 'custom',
        serviceName: 'planning',
        serviceMethod: 'getRuntimeCapabilities',
        postData: {},
        autoLoad: true
      }
    },
    blocks: [
      {
        id: 'planning_console_filter',
        kind: 'form',
        formType: 'default',
        title: '排程参数设置',
        initialValues: {
          scenarioId: '', runName: '控制台排产运行', currentDate: 'now', solver: 'heuristic',
          constraints: 52, iterationMax: 0, resourceIterationMax: 500,
          rotateResources: true, individualPoolResources: false
        },
        schema: {
          columns: 4,
          fields: [
            {
              field: 'scenarioId', label: '排产场景', component: 'vxe-select', required: true,
              optionsSourceKey: 'scenarioOptions', optionProps: { label: 'label', value: 'id' },
              props: { clearable: true, filterable: true, placeholder: '选择排产场景' },
              events: { change: [
                { type: 'setFormField', blockId: 'planning_console_result_filter', field: 'planVersionId', value: '' },
                { type: 'refreshDataSources', sourceKeys: refreshSources }
              ] }
            },
            { field: 'runName', label: '运行名称', component: 'vxe-input', props: { clearable: true, placeholder: '控制台排产运行' } },
            { field: 'currentDate', label: '计划当前时间', component: 'vxe-input', props: { clearable: true, placeholder: 'now 或 ISO 时间' } },
            {
              field: 'solver', label: '求解器', component: 'vxe-select', props: { clearable: false },
              options: [
                { label: '启发式（标准）', value: 'heuristic' },
                { label: '启发式（备选）', value: 'heuristic_2' }
              ]
            },
            { field: 'constraints', label: '约束级别', component: 'lc-number-input', props: { min: 0, step: 1 } },
            { field: 'iterationMax', label: '计划迭代上限', component: 'lc-number-input', props: { min: 0, step: 1 } },
            { field: 'resourceIterationMax', label: '资源迭代上限', component: 'lc-number-input', props: { min: 0, step: 1 } },
            { field: 'rotateResources', label: '轮换资源', component: 'vxe-switch' },
            { field: 'individualPoolResources', label: '资源池独立排产', component: 'vxe-switch' }
          ],
          actions: []
        }
      },
      {
        id: 'planning_console_result_filter',
        kind: 'searchForm',
        title: '结果筛选',
        targetSourceKey: 'summary',
        targetSourceKeys: filteredSources,
        initialValues: {
          planVersionId: '', itemId: '', resourceId: '', operationId: '',
          operationStatus: '', demandStatus: '', from: '', to: ''
        },
        schema: {
          columns: 4,
          fields: [
            {
              field: 'planVersionId', label: '计划版本', component: 'vxe-select', optionsSourceKey: 'versionOptions',
              optionProps: { label: 'label', value: 'id' }, props: { clearable: true, filterable: true, placeholder: '自动选择当前版本' }
            },
            {
              field: 'itemId', label: '物料', component: 'vxe-select', optionsSourceKey: 'itemOptions',
              optionProps: { label: 'label', value: 'id' }, props: { clearable: true, filterable: true, placeholder: '全部物料' }
            },
            {
              field: 'resourceId', label: '资源', component: 'vxe-select', optionsSourceKey: 'resourceOptions',
              optionProps: { label: 'label', value: 'id' }, props: { clearable: true, filterable: true, placeholder: '全部资源' }
            },
            {
              field: 'operationId', label: '工序', component: 'vxe-select', optionsSourceKey: 'operationOptions',
              optionProps: { label: 'label', value: 'id' }, props: { clearable: true, filterable: true, placeholder: '全部工序' }
            },
            {
              field: 'operationStatus', label: '计划单状态', component: 'vxe-select', props: { clearable: true },
              options: ['proposed', 'approved', 'confirmed', 'completed', 'closed'].map((value) => ({ label: value, value }))
            },
            {
              field: 'demandStatus', label: '需求状态', component: 'vxe-select', props: { clearable: true },
              options: ['inquiry', 'quote', 'open', 'closed', 'canceled'].map((value) => ({ label: value, value }))
            },
            { field: 'from', label: '开始时间', component: 'vxe-input', props: { clearable: true, type: 'datetime-local' } },
            { field: 'to', label: '结束时间', component: 'vxe-input', props: { clearable: true, type: 'datetime-local' } }
          ],
          actions: [
            { code: 'submit', label: '应用筛选', type: 'submit', status: 'primary' },
            { code: 'reset', label: '重置', type: 'reset' }
          ]
        }
      },
      {
        id: 'planning_console_actions',
        kind: 'buttonGroup',
        align: 'left',
        gap: 6,
        actions: [
          {
            code: 'preflight', label: '数据预检', type: 'button', mode: 'button', icon: 'ri-shield-check-line',
            permissionCode: 'planning.models.manage', script: preflightScript
          },
          {
            code: 'run', label: '开始排产', type: 'button', mode: 'button', status: 'primary', icon: 'ri-play-circle-line',
            permissionCode: 'planning.models.manage', script: runScript
          },
          {
            code: 'cancel', label: '取消运行', type: 'button', mode: 'button', status: 'danger', icon: 'ri-stop-circle-line',
            permissionCode: 'planning.models.manage', script: cancelScript
          },
          {
            code: 'publish', label: '发布版本', type: 'button', mode: 'button', icon: 'ri-send-plane-line',
            permissionCode: 'planning.models.manage', script: publishScript
          },
          {
            code: 'refresh', label: '刷新', type: 'button', mode: 'button', icon: 'ri-refresh-line',
            directives: [{ type: 'refreshDataSources', sourceKeys: [...refreshSources, 'runtimeCapabilities'] }]
          }
        ]
      },
      {
        id: 'planning_console_runtime_status',
        kind: 'statCard',
        sourceKey: 'runtimeCapabilities',
        items: [
          { label: '控制权限', field: 'accessLabel' },
          { label: '排产引擎', field: 'engineLabel' },
          { label: '后台任务', field: 'triggerLabel' }
        ]
      },
      {
        id: 'planning_console_tabs',
        kind: 'tabs',
        defaultKey: 'overview',
        tabs: [
          {
            key: 'overview', label: '排产总览', blocks: [
              {
                id: 'planning_console_stats', kind: 'statCard', sourceKey: 'summary', items: [
                  { label: '计划单', field: 'operationPlanCount', suffix: '单', formatter: number },
                  { label: '需求', field: 'demandCount', suffix: '条', formatter: number },
                  { label: '延期需求', field: 'lateDemandCount', suffix: '条', formatter: number },
                  { label: '计划问题', field: 'problemCount', suffix: '项', formatter: number },
                  { label: '超载资源', field: 'overloadedResourceCount', suffix: '个', formatter: number },
                  { label: '运行中', field: 'activeRunCount', suffix: '个', formatter: number }
                ]
              },
              grid('planning_console_preflight_grid', '数据完整性预检', 'preflightIssues', [
                column('severity', '级别', { width: 90 }), column('code', '规则', { minWidth: 190 }),
                column('table', '数据表', { minWidth: 190 }), column('recordId', '记录', { minWidth: 190 }),
                column('path', '字段', { minWidth: 150 }), column('message', '说明', { minWidth: 360 })
              ], { height: 310 })
            ]
          },
          {
            key: 'gantt', label: '排产甘特', blocks: [{
              id: 'planning_console_gantt', kind: 'planningGantt', sourceKey: PLANNING_CONSOLE_GANTT_SOURCE_KEY, height: 520,
              title: '排产甘特图', description: '按资源或交付对象查看计划单时间占用、状态和延期情况。',
              rowLabelField: 'resource_name', startField: 'startdate', endField: 'enddate', labelField: 'reference', statusField: 'status',
              includedTypes: ['MO', 'WO', 'PO', 'DO', 'DLVR']
            }]
          },
          {
            key: 'flow', label: '工艺路线', blocks: [{
              id: 'planning_console_flow', kind: 'planningFlow', sourceKey: 'flow', height: 520,
              title: '工艺路线', description: '展示工序顺序、依赖关系、投入物料和资源。', fitViewOnInit: true
            }]
          },
          {
            key: 'bom', label: '工艺 BOM', blocks: [{
              id: 'planning_console_bom', kind: 'planningBom', sourceKey: 'bom', height: 520,
              title: '工艺 BOM', description: '按产成品、工序和组件递归展开。',
              keyField: 'id', titleField: 'title', childrenField: 'children'
            }]
          },
          {
            key: 'orders', label: '需求与计划单', blocks: [
              {
                id: 'planning_console_orders_tabs',
                kind: 'tabs',
                defaultKey: 'demands',
                className: 'planning-console-inner-tabs planning-console-orders-tabs',
                tabs: [
                  {
                    key: 'demands', label: '需求', blocks: [
                      grid('planning_console_demands_grid', '需求', 'demands', [
                        column('name', '需求编号', { minWidth: 150 }), column('item_id_label', '物料', { minWidth: 160 }),
                        column('customer_id_label', '客户', { minWidth: 140 }), column('location_id_label', '地点', { minWidth: 130 }),
                        column('due', '交期', { minWidth: 170, formatter: datetime }), column('quantity', '需求量', { align: 'right', formatter: number }),
                        column('plannedquantity', '已计划', { align: 'right', formatter: number }),
                        column('deliverydate', '计划交付', { minWidth: 170, formatter: datetime }),
                        column('delay', '延期', { align: 'right' }), column('status', '状态')
                      ], { tableName: PLANNING_CONSOLE_GRID_TABLES.planning_console_demands_grid })
                    ]
                  },
                  {
                    key: 'operation-plans', label: '计划单', blocks: [
                      grid('planning_console_operation_plans_grid', '计划单', 'operationPlans', [
                        column('reference', '计划单号', { minWidth: 160 }), column('type', '类型', { width: 90 }),
                        column('operation_id_label', '工序', { minWidth: 160 }), column('item_id_label', '物料', { minWidth: 160 }),
                        column('location_id_label', '地点', { minWidth: 140 }), column('quantity', '数量', { align: 'right', formatter: number }),
                        column('startdate', '开始', { minWidth: 170, formatter: datetime }), column('enddate', '结束', { minWidth: 170, formatter: datetime }),
                        column('delay', '延期', { align: 'right' }), column('status', '状态'),
                        column('demand_id_label', '需求', { minWidth: 150 }), column('plan_version_id_label', '版本', { minWidth: 130 })
                      ], { tableName: PLANNING_CONSOLE_GRID_TABLES.planning_console_operation_plans_grid })
                    ]
                  }
                ]
              }
            ]
          },
          {
            key: 'supply', label: '物料与资源', blocks: [
              {
                id: 'planning_console_supply_tabs',
                kind: 'tabs',
                defaultKey: 'materials',
                className: 'planning-console-inner-tabs planning-console-supply-tabs',
                tabs: [
                  {
                    key: 'materials', label: '计划物料流', blocks: [
                      grid('planning_console_materials_grid', '计划物料流', 'materials', [
                        column('flowdate', '流动时间', { minWidth: 170, formatter: datetime }),
                        column('operationplan_id_label', '计划单', { minWidth: 160 }), column('item_id_label', '物料', { minWidth: 160 }),
                        column('location_id_label', '地点', { minWidth: 140 }),
                        column('quantity', '数量', { align: 'right', formatter: number }), column('onhand', '结余库存', { align: 'right', formatter: number }),
                        column('minimum', '最低库存', { align: 'right', formatter: number }), column('status', '状态')
                      ], { tableName: PLANNING_CONSOLE_GRID_TABLES.planning_console_materials_grid })
                    ]
                  },
                  {
                    key: 'plan-resources', label: '计划资源分配', blocks: [
                      grid('planning_console_plan_resources_grid', '计划资源分配', 'planResources', [
                        column('resource_id_label', '资源', { minWidth: 170 }), column('operationplan_id_label', '计划单', { minWidth: 160 }),
                        column('quantity', '负荷', { align: 'right', formatter: number }), column('setup', '换型'),
                        column('plan_version_id_label', '版本', { minWidth: 130 }), column('status', '状态')
                      ], { tableName: PLANNING_CONSOLE_GRID_TABLES.planning_console_plan_resources_grid })
                    ]
                  },
                  {
                    key: 'resource-plans', label: '资源负荷', blocks: [
                      grid('planning_console_resource_plans_grid', '资源负荷', 'resourcePlans', [
                        column('resource_id_label', '资源', { minWidth: 170 }), column('startdate', '时间桶', { minWidth: 170, formatter: datetime }),
                        column('available', '可用', { align: 'right', formatter: number }), column('load', '负荷', { align: 'right', formatter: number }),
                        column('setup', '换型', { align: 'right', formatter: number }), column('free', '空闲', { align: 'right', formatter: number }),
                        column('load_confirmed', '确认负荷', { align: 'right', formatter: number }), column('plan_version_id_label', '版本', { minWidth: 130 })
                      ], { tableName: PLANNING_CONSOLE_GRID_TABLES.planning_console_resource_plans_grid })
                    ]
                  }
                ]
              }
            ]
          },
          {
            key: 'issues', label: '问题与约束', blocks: [
              {
                id: 'planning_console_issues_tabs',
                kind: 'tabs',
                defaultKey: 'problems',
                className: 'planning-console-inner-tabs planning-console-issues-tabs',
                tabs: [
                  {
                    key: 'problems', label: '计划问题', blocks: [
                      grid('planning_console_problems_grid', '计划问题', 'problems', [
                        column('entity', '实体', { minWidth: 130 }), column('owner', '对象', { minWidth: 170 }),
                        column('name', '问题类型', { minWidth: 150 }), column('description', '问题说明', { minWidth: 360 }),
                        column('startdate', '开始', { minWidth: 170, formatter: datetime }), column('enddate', '结束', { minWidth: 170, formatter: datetime })
                      ], { tableName: PLANNING_CONSOLE_GRID_TABLES.planning_console_problems_grid })
                    ]
                  },
                  {
                    key: 'constraints', label: '需求约束', blocks: [
                      grid('planning_console_constraints_grid', '需求约束', 'constraints', [
                        column('demand_id_label', '需求', { minWidth: 150 }), column('item_id_label', '物料', { minWidth: 150 }),
                        column('name', '约束类型', { minWidth: 150 }), column('description', '约束说明', { minWidth: 360 }),
                        column('startdate', '开始', { minWidth: 170, formatter: datetime }), column('enddate', '结束', { minWidth: 170, formatter: datetime })
                      ], { tableName: PLANNING_CONSOLE_GRID_TABLES.planning_console_constraints_grid })
                    ]
                  }
                ]
              }
            ]
          },
          {
            key: 'runs', label: '运行记录', blocks: [
              grid('planning_console_runs_grid', '排产运行', 'runs', [
                column('name', '任务名称', { minWidth: 180 }), column('scenario_id_label', '场景', { minWidth: 140 }),
                column('status', '状态', { width: 100 }),
                column('progress', '进度', { width: 90, align: 'right', formatter: number }), column('attempt', '尝试', { width: 80, align: 'right', formatter: number }),
                column('submitted', '提交时间', { minWidth: 170, formatter: datetime }), column('started', '开始时间', { minWidth: 170, formatter: datetime }),
                column('finished', '完成时间', { minWidth: 170, formatter: datetime }), column('message', '运行消息', { minWidth: 300 })
              ], {
                height: 510,
                current: true,
                tableName: PLANNING_CONSOLE_GRID_TABLES.planning_console_runs_grid
              })
            ]
          }
        ]
      }
    ] as LowCodePageSchema['blocks']
  };
}

export const PLANNING_CONSOLE_PAGE_SCHEMA = buildPlanningConsolePageSchema();
