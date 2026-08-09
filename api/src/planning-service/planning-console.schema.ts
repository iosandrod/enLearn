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

type Row = Record<string, unknown>;

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
  options: { height?: number; current?: boolean; rowActions?: Row } = {}
) {
  return {
    id,
    kind: 'grid',
    title,
    sourceKey,
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

function consoleSource(dataset: typeof PLANNING_CONSOLE_SOURCE_KEYS[number]) {
  return {
    key: dataset,
    label: `排产控制台·${dataset}`,
    sourceType: 'custom' as const,
    serviceName: 'planning',
    serviceMethod: 'getPlanningConsoleData',
    postData: { dataset, filters: consoleFilterExpressions() },
    autoLoad: true
  };
}

function consoleFilterExpressions() {
  return {
    scenarioId: '{{ forms.planning_console_filter.scenarioId }}',
    planVersionId: '{{ forms.planning_console_filter.planVersionId }}',
    itemId: '{{ forms.planning_console_filter.itemId }}',
    resourceId: '{{ forms.planning_console_filter.resourceId }}',
    operationId: '{{ forms.planning_console_filter.operationId }}',
    operationStatus: '{{ forms.planning_console_filter.operationStatus }}',
    demandStatus: '{{ forms.planning_console_filter.demandStatus }}',
    from: '{{ forms.planning_console_filter.from }}',
    to: '{{ forms.planning_console_filter.to }}'
  };
}

const refreshSources = [...PLANNING_CONSOLE_SOURCE_KEYS, 'versionOptions'];
const filteredSources = [...PLANNING_CONSOLE_SOURCE_KEYS, 'versionOptions'];

const preflightScript = `async function main() {
  const filter = this.forms.planning_console_filter || {};
  const issues = await this.executeHttp({
    api: "planningPreflight",
    method: "POST",
    body: { jobType: "supply_plan", scenarioId: filter.scenarioId || "" },
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
      name: "控制台排产运行",
    },
  });
  await this.$source.set("planningRunStarted", result);
  await this.$source.refresh("summary");
  await this.$source.refresh("runs");
  await this.$source.refresh("versionOptions");
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
  const filter = this.forms.planning_console_filter || {};
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
      capabilities: [
        'http.execute',
        'source.refresh',
        'source.set',
        'message.error',
        'message.success',
        'message.warning'
      ]
    },
    dataSources: {
      ...Object.fromEntries(PLANNING_CONSOLE_SOURCE_KEYS.map((key) => [key, consoleSource(key)])),
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
        kind: 'searchForm',
        title: '排产范围',
        targetSourceKey: 'summary',
        targetSourceKeys: filteredSources,
        initialValues: {
          scenarioId: '', planVersionId: '', itemId: '', resourceId: '', operationId: '',
          operationStatus: '', demandStatus: '', from: '', to: ''
        },
        schema: {
          columns: 5,
          fields: [
            {
              field: 'scenarioId', label: '场景', component: 'vxe-select', optionsSourceKey: 'scenarioOptions',
              optionProps: { label: 'label', value: 'id' }, props: { clearable: true, filterable: true, placeholder: '全部场景' },
              events: { change: [
                { type: 'setFormField', blockId: 'planning_console_filter', field: 'planVersionId', value: '' },
                { type: 'refreshDataSources', sourceKeys: ['versionOptions'] }
              ] }
            },
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
              id: 'planning_console_gantt', kind: 'planningGantt', sourceKey: 'operationPlans', height: 520,
              title: '资源排产甘特图', description: '按资源查看计划单时间占用、状态和延期情况。',
              rowLabelField: 'resource_name', startField: 'startdate', endField: 'enddate', labelField: 'reference', statusField: 'status'
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
              grid('planning_console_demands_grid', '需求', 'demands', [
                column('name', '需求编号', { minWidth: 150 }), column('item_name', '物料', { minWidth: 160 }),
                column('customer_name', '客户', { minWidth: 140 }), column('location_name', '地点', { minWidth: 130 }),
                column('due', '交期', { minWidth: 170, formatter: datetime }), column('quantity', '需求量', { align: 'right', formatter: number }),
                column('version_planned_quantity', '已计划', { align: 'right', formatter: number }),
                column('coverage_percent', '覆盖率', { align: 'right', formatter: number }),
                column('version_delivery_date', '计划交付', { minWidth: 170, formatter: datetime }),
                column('lateness_hours', '延期小时', { align: 'right', formatter: number }), column('status', '状态')
              ]),
              grid('planning_console_operation_plans_grid', '计划单', 'operationPlans', [
                column('reference', '计划单号', { minWidth: 160 }), column('type', '类型', { width: 90 }),
                column('operation_name', '工序', { minWidth: 160 }), column('item_name', '物料', { minWidth: 160 }),
                column('resource_name', '资源', { minWidth: 180 }), column('quantity', '数量', { align: 'right', formatter: number }),
                column('startdate', '开始', { minWidth: 170, formatter: datetime }), column('enddate', '结束', { minWidth: 170, formatter: datetime }),
                column('duration_hours', '工时', { align: 'right', formatter: number }), column('delay_hours', '延期小时', { align: 'right', formatter: number }), column('status', '状态'),
                column('demand_name', '需求', { minWidth: 150 }), column('version_code', '版本', { minWidth: 130 })
              ])
            ]
          },
          {
            key: 'supply', label: '物料与资源', blocks: [
              grid('planning_console_materials_grid', '计划物料流', 'materials', [
                column('flowdate', '流动时间', { minWidth: 170, formatter: datetime }),
                column('operationplan_reference', '计划单', { minWidth: 160 }), column('item_name', '物料', { minWidth: 160 }),
                column('location_name', '地点', { minWidth: 140 }), column('movement_type', '方向', { width: 90 }),
                column('quantity', '数量', { align: 'right', formatter: number }), column('onhand', '结余库存', { align: 'right', formatter: number }),
                column('minimum', '最低库存', { align: 'right', formatter: number }), column('status', '状态')
              ]),
              grid('planning_console_plan_resources_grid', '计划资源分配', 'planResources', [
                column('resource_name', '资源', { minWidth: 170 }), column('operationplan_reference', '计划单', { minWidth: 160 }),
                column('quantity', '负荷', { align: 'right', formatter: number }), column('setup', '换型'),
                column('startdate', '开始', { minWidth: 170, formatter: datetime }), column('enddate', '结束', { minWidth: 170, formatter: datetime }),
                column('status', '状态')
              ]),
              grid('planning_console_resource_plans_grid', '资源负荷', 'resourcePlans', [
                column('resource_name', '资源', { minWidth: 170 }), column('startdate', '时间桶', { minWidth: 170, formatter: datetime }),
                column('available', '可用', { align: 'right', formatter: number }), column('load', '负荷', { align: 'right', formatter: number }),
                column('setup', '换型', { align: 'right', formatter: number }), column('free', '空闲', { align: 'right', formatter: number }),
                column('utilization_percent', '利用率', { align: 'right', formatter: number }), column('overloaded', '超载', { width: 90 })
              ])
            ]
          },
          {
            key: 'issues', label: '问题与约束', blocks: [
              grid('planning_console_problems_grid', '计划问题', 'problems', [
                column('entity', '实体', { minWidth: 130 }), column('owner', '对象', { minWidth: 170 }),
                column('name', '问题类型', { minWidth: 150 }), column('description', '问题说明', { minWidth: 360 }),
                column('startdate', '开始', { minWidth: 170, formatter: datetime }), column('enddate', '结束', { minWidth: 170, formatter: datetime })
              ]),
              grid('planning_console_constraints_grid', '需求约束', 'constraints', [
                column('demand_name', '需求', { minWidth: 150 }), column('item_name', '物料', { minWidth: 150 }),
                column('name', '约束类型', { minWidth: 150 }), column('description', '约束说明', { minWidth: 360 }),
                column('startdate', '开始', { minWidth: 170, formatter: datetime }), column('enddate', '结束', { minWidth: 170, formatter: datetime })
              ])
            ]
          },
          {
            key: 'runs', label: '运行记录', blocks: [
              grid('planning_console_runs_grid', '排产运行', 'runs', [
                column('name', '任务名称', { minWidth: 180 }), column('scenario_name', '场景', { minWidth: 140 }),
                column('version_code', '计划版本', { minWidth: 140 }), column('status', '状态', { width: 100 }),
                column('progress', '进度', { width: 90, align: 'right', formatter: number }), column('attempt', '尝试', { width: 80, align: 'right', formatter: number }),
                column('submitted', '提交时间', { minWidth: 170, formatter: datetime }), column('started', '开始时间', { minWidth: 170, formatter: datetime }),
                column('finished', '完成时间', { minWidth: 170, formatter: datetime }), column('message', '运行消息', { minWidth: 300 })
              ], { height: 510, current: true })
            ]
          }
        ]
      }
    ] as LowCodePageSchema['blocks']
  };
}

export const PLANNING_CONSOLE_PAGE_SCHEMA = buildPlanningConsolePageSchema();
