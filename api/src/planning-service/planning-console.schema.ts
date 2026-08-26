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
//


export function buildPlanningConsolePageSchema(): LowCodePageSchema {
  return {} as any
}//

export const PLANNING_CONSOLE_PAGE_SCHEMA = buildPlanningConsolePageSchema();
