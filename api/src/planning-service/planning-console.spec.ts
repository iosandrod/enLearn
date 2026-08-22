import assert from 'node:assert/strict';

import {
  buildPlanningBomTree,
  buildPlanningFlowData,
  intervalHours,
  loadPlanningConsoleDataset,
  loadPlanningConsoleSummary,
  parsePlanningConsoleRequest
} from './planning-console';
import {
  PLANNING_CONSOLE_PAGE_CODE,
  PLANNING_CONSOLE_PAGE_SCHEMA,
  PLANNING_CONSOLE_GRID_TABLES,
  PLANNING_CONSOLE_ROUTE,
  PLANNING_CONSOLE_SOURCE_KEYS
} from './planning-console.schema';
import {
  assertValidLowCodePageSchema,
  normalizeLowCodePageSchema
} from '../lowcode-service/lowcode.schema';

const request = parsePlanningConsoleRequest({
  dataset: 'operationPlans',
  filters: {
    plan_version_id: '11111111-1111-4111-8111-111111111111',
    itemId: '22222222-2222-4222-8222-222222222222'
  }
});
assert.equal(request.dataset, 'operationPlans');
assert.equal(request.filters.planVersionId, '11111111-1111-4111-8111-111111111111');
assert.equal(request.filters.itemId, '22222222-2222-4222-8222-222222222222');
assert.throws(
  () => parsePlanningConsoleRequest({ dataset: 'unknown' }),
  /Unsupported planning console dataset/
);
assert.equal(intervalHours('2 days 03:30:00'), 51.5);
assert.equal(intervalHours('5400 seconds'), 1.5);
assert.equal(intervalHours(-7200), -2);
assert.equal(intervalHours(null), 0);

const operations = [
  { id: 'cut', name: '下料', type: 'fixed_time', item_id: 'semi' },
  { id: 'assemble', name: '装配', type: 'fixed_time', item_id: 'finished' },
  { id: 'inspect', name: '检验', type: 'fixed_time', item_id: 'finished' }
];
const flow = buildPlanningFlowData(
  operations,
  [
    { id: 'dependency-1', operation_id: 'assemble', blockedby_id: 'cut' },
    { id: 'dependency-2', operation_id: 'inspect', blockedby_id: 'assemble' }
  ],
  [],
  [{ id: 'material-1', operation_id: 'assemble', item_id: 'semi', item_name: '半成品', quantity: -1 }],
  [{ id: 'resource-1', operation_id: 'assemble', resource_id: 'line-1', resource_name: '装配线' }]
);
assert.equal(flow.nodes.length, 3);
assert.equal(flow.edges.length, 2);
assert.deepEqual(flow.edges.map((edge) => [edge.source, edge.target]), [
  ['cut', 'assemble'],
  ['assemble', 'inspect']
]);
assert.ok(
  Number((flow.nodes.find((node) => node.id === 'assemble')?.position as { x: number }).x) >
    Number((flow.nodes.find((node) => node.id === 'cut')?.position as { x: number }).x)
);
assert.equal(
  Number((flow.nodes.find((node) => node.id === 'assemble')?.position as { x: number }).x) -
    Number((flow.nodes.find((node) => node.id === 'cut')?.position as { x: number }).x),
  360
);
assert.equal(flow.nodes.find((node) => node.id === 'assemble')?.resourceSummary, '装配线');
assert.equal(flow.lanes.length, 1);
assert.deepEqual(flow.lanes[0].nodeIds, ['cut', 'assemble', 'inspect']);
assert.deepEqual(
  flow.nodes.map((node) => node.sequence),
  [1, 2, 3]
);

const routeLaneFlow = buildPlanningFlowData(
  [
    { id: 'route-a', name: '产品 A 路线', category: '成品路线', type: 'routing', item_name: '产品 A', priority: 10 },
    { id: 'route-a-20', name: '装配', type: 'time_per', owner_id: 'route-a', priority: 20 },
    { id: 'route-a-10', name: '备料', type: 'time_per', owner_id: 'route-a', priority: 10 },
    { id: 'route-b', name: '部件 B 路线', category: '部件路线', type: 'routing', item_name: '部件 B', priority: 20 },
    { id: 'route-b-10', name: '加工', type: 'time_per', owner_id: 'route-b', priority: 10 }
  ],
  [{ id: 'cross-route', operation_id: 'route-a-20', blockedby_id: 'route-b-10' }],
  [
    { id: 'route-a-step-2', operation_id: 'route-a', suboperation_id: 'route-a-20', priority: 20 },
    { id: 'route-a-step-1', operation_id: 'route-a', suboperation_id: 'route-a-10', priority: 10 },
    { id: 'route-b-step-1', operation_id: 'route-b', suboperation_id: 'route-b-10', priority: 10 }
  ]
);
assert.equal(routeLaneFlow.lanes.length, 2);
assert.deepEqual(routeLaneFlow.lanes[0].nodeIds, ['route-a', 'route-a-10', 'route-a-20']);
assert.deepEqual(routeLaneFlow.lanes[1].nodeIds, ['route-b', 'route-b-10']);
assert.equal(routeLaneFlow.nodes.find((node) => node.id === 'route-a')?.sequence, 'RT');
assert.equal(routeLaneFlow.nodes.find((node) => node.id === 'route-a-10')?.sequence, 1);
assert.equal(routeLaneFlow.nodes.find((node) => node.id === 'route-a-20')?.sequence, 2);
assert.equal(routeLaneFlow.nodes.find((node) => node.id === 'route-a-20')?.laneId, 'lane:route-a');
assert.equal(
  (routeLaneFlow.nodes.find((node) => node.id === 'route-a-20')?.position as { y: number }).y,
  (routeLaneFlow.nodes.find((node) => node.id === 'route-a-10')?.position as { y: number }).y
);
assert.ok(
  Number((routeLaneFlow.nodes.find((node) => node.id === 'route-b')?.position as { y: number }).y) >
    Number((routeLaneFlow.nodes.find((node) => node.id === 'route-a')?.position as { y: number }).y)
);

const bom = buildPlanningBomTree(
  [
    { id: 'finished', name: '成品 A', uom: '件' },
    { id: 'semi', name: '半成品 B', uom: '件' },
    { id: 'raw', name: '原料 C', uom: 'kg' }
  ],
  [
    { id: 'op-finished', name: '总装', type: 'fixed_time', item_id: 'finished' },
    { id: 'op-semi', name: '预制', type: 'fixed_time', item_id: 'semi' }
  ],
  [
    { id: 'mat-1', operation_id: 'op-finished', item_id: 'semi', quantity: -2 },
    { id: 'mat-2', operation_id: 'op-semi', item_id: 'raw', quantity: -3 }
  ],
  'finished'
);
assert.equal(bom.length, 1);
assert.equal(bom[0].title, '成品 A');
const finishedOperation = (bom[0].children as Record<string, unknown>[])[0];
assert.equal(finishedOperation.title, '总装');
const semiItem = (finishedOperation.children as Record<string, unknown>[])[0];
assert.equal(semiItem.title, '半成品 B');
assert.equal(semiItem.quantity, 2);
const semiOperation = (semiItem.children as Record<string, unknown>[])[0];
const rawItem = (semiOperation.children as Record<string, unknown>[])[0];
assert.equal(rawItem.title, '原料 C');
assert.equal(rawItem.quantity, 3);

const namedBom = buildPlanningBomTree(
  [{
    id: 'named-item',
    name: 'ITEM-001',
    display_name: '独立物料名称',
    description: '独立描述'
  }],
  [{ id: 'named-operation', name: '制造工序', item_id: 'named-item' }],
  [],
  'named-item'
);
assert.equal(namedBom[0].title, '独立物料名称');
assert.equal(namedBom[0].subtitle, 'ITEM-001 · 独立描述');

const routingBom = buildPlanningBomTree(
  [
    { id: 'routed-finished', name: '路线成品' },
    { id: 'routed-component', name: '路线组件' }
  ],
  [
    { id: 'route', name: '成品路线', type: 'routing', item_id: 'routed-finished' },
    { id: 'route-step', name: '装配工序', type: 'time_per', owner_id: 'route' }
  ],
  [{ id: 'route-input', operation_id: 'route-step', item_id: 'routed-component', quantity: -1 }],
  'routed-finished',
  [{ id: 'route-relation', operation_id: 'route', suboperation_id: 'route-step', priority: 10 }]
);
const routedOperation = (routingBom[0].children as Record<string, unknown>[])[0];
assert.equal(routedOperation.type, 'routing');
assert.equal(routedOperation.entityType, 'operation');
const routedComponent = (routedOperation.children as Record<string, unknown>[])[0];
assert.equal(routedComponent.title, '路线组件');
assert.equal(routedComponent.entityType, 'item');

function flattenBomNodes(nodes: Record<string, unknown>[]): Record<string, unknown>[] {
  return nodes.flatMap((node) => [
    node,
    ...(Array.isArray(node.children)
      ? flattenBomNodes(node.children as Record<string, unknown>[])
      : [])
  ]);
}

const rootBoundaryItems = Array.from({ length: 45 }, (_, index) => ({
  id: `root-${index}`,
  name: `Root ${index}`
}));
const rootBoundaryBom = buildPlanningBomTree(
  rootBoundaryItems,
  rootBoundaryItems.map((item, index) => ({
    id: `root-operation-${index}`,
    name: `Root operation ${index}`,
    item_id: item.id
  })),
  []
);
assert.equal(rootBoundaryBom.length, 40, 'The BOM console must cap unfiltered roots at 40.');

const deepItems = Array.from({ length: 9 }, (_, index) => ({ id: `deep-${index}`, name: `Deep ${index}` }));
const deepBom = buildPlanningBomTree(
  deepItems,
  deepItems.map((item, index) => ({ id: `deep-operation-${index}`, name: `Deep operation ${index}`, item_id: item.id })),
  deepItems.slice(0, -1).map((item, index) => ({
    id: `deep-material-${index}`,
    operation_id: `deep-operation-${index}`,
    item_id: `deep-${index + 1}`,
    quantity: -1
  })),
  'deep-0'
);
const deepNodes = flattenBomNodes(deepBom);
assert.ok(deepNodes.some((node) => node.entityId === 'deep-7'));
assert.ok(!deepNodes.some((node) => node.entityId === 'deep-8'), 'The BOM must stop recursion after seven component levels.');

const cyclicBom = buildPlanningBomTree(
  [{ id: 'cycle-a', name: 'Cycle A' }, { id: 'cycle-b', name: 'Cycle B' }],
  [
    { id: 'cycle-operation-a', name: 'Cycle operation A', item_id: 'cycle-a' },
    { id: 'cycle-operation-b', name: 'Cycle operation B', item_id: 'cycle-b' }
  ],
  [
    { id: 'cycle-material-a', operation_id: 'cycle-operation-a', item_id: 'cycle-b', quantity: -1 },
    { id: 'cycle-material-b', operation_id: 'cycle-operation-b', item_id: 'cycle-a', quantity: -1 }
  ],
  'cycle-a'
);
const cycleNodes = flattenBomNodes(cyclicBom);
assert.equal(cycleNodes.filter((node) => node.cycle === true).length, 1);
assert.equal(cycleNodes.find((node) => node.cycle === true)?.subtitle, '循环引用');

type FakeRow = Record<string, unknown>;
type FakeQueryOperation =
  | { type: 'eq' | 'lt' | 'gte' | 'lte'; field: string; value: unknown }
  | { type: 'in'; field: string; value: unknown[] };

function createSummaryClient(tables: Record<string, FakeRow[]>) {
  return {
    from(table: string) {
      return {
        select(_columns: string, options?: { count?: string; head?: boolean }) {
          const operations: FakeQueryOperation[] = [];
          let range: [number, number] | undefined;
          let limit: number | undefined;
          const query = {
            eq(field: string, value: unknown) {
              operations.push({ type: 'eq', field, value });
              return query;
            },
            lt(field: string, value: unknown) {
              operations.push({ type: 'lt', field, value });
              return query;
            },
            gte(field: string, value: unknown) {
              operations.push({ type: 'gte', field, value });
              return query;
            },
            lte(field: string, value: unknown) {
              operations.push({ type: 'lte', field, value });
              return query;
            },
            in(field: string, value: unknown[]) {
              operations.push({ type: 'in', field, value });
              return query;
            },
            is(field: string, value: unknown) {
              operations.push({ type: 'eq', field, value });
              return query;
            },
            order(field: string, orderOptions?: { ascending?: boolean }) {
              const rows = tables[table] ?? [];
              rows.sort((left, right) => {
                const leftValue = String(left[field] ?? '');
                const rightValue = String(right[field] ?? '');
                const result = leftValue.localeCompare(rightValue);
                return orderOptions?.ascending === false ? -result : result;
              });
              return query;
            },
            range(from: number, to: number) {
              range = [from, to];
              return query;
            },
            limit(value: number) {
              limit = value;
              return query;
            },
            then(resolve: (value: unknown) => unknown) {
              const matches = (tables[table] ?? []).filter((row) => operations.every((operation) => {
                const cell = row[operation.field];
                if (operation.type === 'eq') return cell === operation.value;
                if (operation.type === 'in') return operation.value.includes(cell);
                if (operation.type === 'lt') return Number(cell) < Number(operation.value);
                const cellTime = new Date(String(cell)).getTime();
                const valueTime = new Date(String(operation.value)).getTime();
                return operation.type === 'gte' ? cellTime >= valueTime : cellTime <= valueTime;
              }));
              if (options?.head) return resolve({ data: null, count: matches.length, error: null });
              const selected = range
                ? matches.slice(range[0], range[1] + 1)
                : typeof limit === 'number'
                  ? matches.slice(0, limit)
                  : matches;
              return resolve({ data: selected, count: null, error: null });
            }
          };
          return query;
        }
      };
    }
  };
}

function createRunsClient(tables: Record<string, FakeRow[]>) {
  return {
    from(table: string) {
      return {
        select() {
          const operations: FakeQueryOperation[] = [];
          let limit: number | undefined;
          let descendingField = '';
          const query = {
            eq(field: string, value: unknown) {
              operations.push({ type: 'eq', field, value });
              return query;
            },
            gte(field: string, value: unknown) {
              operations.push({ type: 'gte', field, value });
              return query;
            },
            lte(field: string, value: unknown) {
              operations.push({ type: 'lte', field, value });
              return query;
            },
            in(field: string, value: unknown[]) {
              operations.push({ type: 'in', field, value });
              return query;
            },
            order(field: string, options?: { ascending?: boolean }) {
              if (options?.ascending === false) descendingField = field;
              return query;
            },
            limit(value: number) {
              limit = value;
              return query;
            },
            then(resolve: (value: unknown) => unknown) {
              let matches = (tables[table] ?? []).filter((row) => operations.every((operation) => {
                const cell = row[operation.field];
                if (operation.type === 'eq') return cell === operation.value;
                if (operation.type === 'in') return operation.value.includes(cell);
                const cellTime = new Date(String(cell)).getTime();
                const valueTime = new Date(String(operation.value)).getTime();
                return operation.type === 'gte' ? cellTime >= valueTime : cellTime <= valueTime;
              }));
              if (descendingField) {
                matches = [...matches].sort((left, right) =>
                  String(right[descendingField] ?? '').localeCompare(String(left[descendingField] ?? ''))
                );
              }
              return resolve({
                data: typeof limit === 'number' ? matches.slice(0, limit) : matches,
                error: null
              });
            }
          };
          return query;
        }
      };
    }
  };
}

const largeDemandRows = Array.from({ length: 1205 }, (_, index) => ({
  id: `demand-${index}`,
  account_id: 'account-1',
  due: '2026-08-10T00:00:00.000Z'
}));
async function testLargeSummary() {
  const largeSummary = await loadPlanningConsoleSummary(
    createSummaryClient({
    planning_operationplan: largeDemandRows.map((row, index) => ({
      id: `plan-${index}`,
      account_id: 'account-1',
      plan_version_id: 'version-1',
      demand_id: row.id,
      enddate: index < 1103 ? '2026-08-11T00:00:00.000Z' : '2026-08-09T00:00:00.000Z'
    })),
    planning_demand: largeDemandRows,
    planning_problem: Array.from({ length: 1007 }, (_, index) => ({
      id: `problem-${index}`, account_id: 'account-1', plan_version_id: 'version-1'
    })),
    planning_constraint: Array.from({ length: 1003 }, (_, index) => ({
      id: `constraint-${index}`, account_id: 'account-1', plan_version_id: 'version-1'
    })),
    planning_resourceplan: Array.from({ length: 1011 }, (_, index) => ({
      id: `resource-plan-${index}`,
      account_id: 'account-1',
      plan_version_id: 'version-1',
      resource_id: `resource-${index}`,
      free: -1
    })),
    planning_run: [
      { id: 'run-new', account_id: 'account-1', status: 'running', submitted: '2026-08-11T00:00:00.000Z' },
      { id: 'run-old', account_id: 'account-1', status: 'queued', submitted: '2026-08-10T00:00:00.000Z' }
    ]
    }) as never,
    'account-1',
    {},
    { id: 'version-1', code: 'V1', name: 'Version 1' }
  );
  assert.equal(largeSummary.operationPlanCount, 1205);
  assert.equal(largeSummary.demandCount, 1205);
  assert.equal(largeSummary.lateDemandCount, 1103);
  assert.equal(largeSummary.problemCount, 1007);
  assert.equal(largeSummary.constraintCount, 1003);
  assert.equal(largeSummary.overloadedResourceCount, 1011);
  assert.equal(largeSummary.activeRunCount, 2);
  assert.equal(largeSummary.latestRunId, 'run-new');
}

async function testRunBoundary() {
  const runRows = Array.from({ length: 305 }, (_, index) => ({
    id: `run-${String(index).padStart(3, '0')}`,
    account_id: 'account-1',
    scenario_id: 'scenario-1',
    submitted: new Date(Date.UTC(2026, 7, 1, 0, index)).toISOString(),
    status: 'succeeded'
  }));
  const result = await loadPlanningConsoleDataset(
    createRunsClient({
      planning_plan_version: runRows.map((row, index) => ({
        id: `version-${index}`,
        account_id: 'account-1',
        run_id: row.id,
        code: `V${index}`,
        status: 'completed'
      })),
      planning_run: runRows,
      planning_scenario: [{ id: 'scenario-1', account_id: 'account-1', name: 'Scenario 1' }]
    }) as never,
    'account-1',
    'runs',
    {}
  );
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 300, 'The runs dataset must cap results at 300 rows.');
  const resultRows = result as Record<string, unknown>[];
  assert.equal(resultRows[0]?.id, 'run-304');
  assert.equal(resultRows.at(-1)?.id, 'run-005');
}

async function testResourcePlanPagination() {
  const resourcePlanRows = Array.from({ length: 1440 }, (_, index) => ({
    id: `resource-plan-${String(index).padStart(4, '0')}`,
    account_id: 'account-1',
    plan_version_id: 'version-1',
    resource_id: 'resource-1',
    startdate: new Date(Date.UTC(2026, 7, 22, 0, index)).toISOString(),
    available: 8,
    load: 4,
    free: 4
  }));
  const result = await loadPlanningConsoleDataset(
    createSummaryClient({
      planning_plan_version: [{
        id: 'version-1',
        account_id: 'account-1',
        code: 'V1',
        name: 'Version 1'
      }],
      planning_resourceplan: resourcePlanRows,
      planning_resource: [{
        id: 'resource-1',
        account_id: 'account-1',
        name: 'Resource 1',
        type: 'default',
        maximum: 1
      }]
    }) as never,
    'account-1',
    'resourcePlans',
    { planVersionId: 'version-1' }
  );
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 1440, 'The resource plan dataset must return every paginated bucket.');
  const resultRows = result as Record<string, unknown>[];
  assert.equal(resultRows[0]?.id, 'resource-plan-0000');
  assert.equal(resultRows.at(-1)?.id, 'resource-plan-1439');
  assert.equal(resultRows[1000]?.resource_name, 'Resource 1');
  assert.equal(resultRows[1000]?.utilization_percent, 50);
}

const normalizedSchema = normalizeLowCodePageSchema(PLANNING_CONSOLE_PAGE_SCHEMA);
const schemaIssues = assertValidLowCodePageSchema(normalizedSchema);
assert.equal(schemaIssues.filter((issue) => issue.level === 'error').length, 0);
assert.equal(normalizedSchema.code, PLANNING_CONSOLE_PAGE_CODE);
assert.equal(normalizedSchema.route, PLANNING_CONSOLE_ROUTE);
assert.equal(normalizedSchema.pageType, 'custom');
assert.ok(PLANNING_CONSOLE_SOURCE_KEYS.every((key) => normalizedSchema.dataSources?.[key]));
assert.equal(normalizedSchema.dataSources?.summary?.sourceType, 'custom');
assert.equal(normalizedSchema.dataSources?.summary?.serviceMethod, 'getPlanningConsoleData');
assert.equal(normalizedSchema.dataSources?.scenarioOptions?.serviceMethod, 'getPlanningConsoleOptions');

const blocks = normalizedSchema.blocks as Array<Record<string, unknown>>;
const filter = blocks.find((block) => block.id === 'planning_console_filter');
assert.equal(filter?.kind, 'form');
assert.equal(filter?.formType, 'default');
assert.equal(filter?.title, '排程参数设置');
assert.deepEqual(filter?.initialValues, {
  scenarioId: '',
  runName: '控制台排产运行',
  currentDate: 'now',
  solver: 'heuristic',
  constraints: 52,
  iterationMax: 0,
  resourceIterationMax: 500,
  rotateResources: true,
  individualPoolResources: false
});
const filterSchema = filter?.schema as Record<string, unknown> | undefined;
const filterFields = Array.isArray(filterSchema?.fields)
  ? filterSchema.fields as Array<Record<string, unknown>>
  : [];
assert.deepEqual(filterFields.map((field) => field.field), [
  'scenarioId', 'runName', 'currentDate', 'solver', 'constraints', 'iterationMax',
  'resourceIterationMax', 'rotateResources', 'individualPoolResources'
]);
const scenarioField = filterFields.find((field) => field.field === 'scenarioId');
const scenarioEvents = scenarioField?.events as Record<string, unknown> | undefined;
const scenarioChange = Array.isArray(scenarioEvents?.change)
  ? scenarioEvents.change as Array<Record<string, unknown>>
  : [];
assert.ok(scenarioChange.some((directive) =>
  directive.type === 'setFormField' &&
  directive.blockId === 'planning_console_result_filter' &&
  directive.field === 'planVersionId' &&
  directive.value === ''
));
assert.ok(scenarioChange.some((directive) =>
  directive.type === 'refreshDataSources' &&
  Array.isArray(directive.sourceKeys) &&
  directive.sourceKeys.includes('versionOptions') &&
  directive.sourceKeys.includes('operationPlans')
));
const resultFilter = blocks.find((block) => block.id === 'planning_console_result_filter');
assert.equal(resultFilter?.kind, 'searchForm');
assert.equal(resultFilter?.title, '结果筛选');
assert.deepEqual(resultFilter?.targetSourceKeys, PLANNING_CONSOLE_SOURCE_KEYS);
const resultFilterSchema = resultFilter?.schema as Record<string, unknown> | undefined;
const resultFilterFields = Array.isArray(resultFilterSchema?.fields)
  ? resultFilterSchema.fields as Array<Record<string, unknown>>
  : [];
assert.deepEqual(resultFilterFields.map((field) => field.field), [
  'planVersionId', 'itemId', 'resourceId', 'operationId',
  'operationStatus', 'demandStatus', 'from', 'to'
]);
assert.deepEqual(normalizedSchema.scriptPolicy?.context?.formBlockIds, [
  'planning_console_filter', 'planning_console_result_filter'
]);
const actionBlock = blocks.find((block) => block.id === 'planning_console_actions');
const actions = Array.isArray(actionBlock?.actions) ? actionBlock.actions : [];
for (const code of ['preflight', 'run', 'cancel', 'publish']) {
  const action = actions.find((candidate: Record<string, unknown>) => candidate.code === code);
  assert.equal(action?.permissionCode, 'planning.models.manage');
  assert.equal(typeof action?.script, 'string');
}
const preflightActionScript = String(actions.find((action: Record<string, unknown>) => action.code === 'preflight')?.script);
const runActionScript = String(actions.find((action: Record<string, unknown>) => action.code === 'run')?.script);
for (const script of [preflightActionScript, runActionScript]) {
  assert.match(script, /overrides/);
  for (const parameter of [
    'currentdate', 'plan.solver', 'constraints', 'plan.iterationmax',
    'plan.resourceiterationmax', 'plan.rotateResources', 'plan.individualPoolResources'
  ]) {
    assert.ok(script.includes(parameter), `Planning action script must map ${parameter}.`);
  }
}
assert.match(runActionScript, /scenarioId[\s\S]*engine\.available[\s\S]*trigger\.configured[\s\S]*worker\.online/);
assert.match(runActionScript, /filter\.runName/);
assert.match(runActionScript, /\$form\.patch\("planning_console_result_filter"[\s\S]*planVersionId/);
assert.match(String(actions.find((action: Record<string, unknown>) => action.code === 'cancel')?.script), /currentRow[\s\S]*queued[\s\S]*running/);
assert.match(String(actions.find((action: Record<string, unknown>) => action.code === 'publish')?.script), /planning_console_result_filter[\s\S]*versionOptions[\s\S]*is_current[\s\S]*versionStatus[\s\S]*completed/);
assert.deepEqual(normalizedSchema.scriptPolicy?.capabilities, [
  'http.execute',
  'form.patch',
  'source.refresh',
  'source.set',
  'message.error',
  'message.success',
  'message.warning'
]);
for (const api of ['planningPreflight', 'planningRun', 'planningCancel', 'planningPublish']) {
  assert.equal(normalizedSchema.apis?.[api]?.serviceName, 'planning');
}
const runtimeStatus = blocks.find((block) => block.id === 'planning_console_runtime_status');
assert.equal(runtimeStatus?.kind, 'statCard');
assert.equal(runtimeStatus?.sourceKey, 'runtimeCapabilities');
const tabsBlock = blocks.find((block) => block.id === 'planning_console_tabs');
const tabs = Array.isArray(tabsBlock?.tabs) ? tabsBlock.tabs as Array<Record<string, unknown>> : [];
assert.deepEqual(tabs.map((tab: Record<string, unknown>) => tab.key), [
  'overview', 'gantt', 'flow', 'bom', 'orders', 'supply', 'issues', 'runs'
]);
function firstTabBlock(key: string) {
  const tab = tabs.find((candidate) => candidate.key === key);
  return Array.isArray(tab?.blocks) ? tab.blocks[0] as Record<string, unknown> | undefined : undefined;
}
assert.equal(firstTabBlock('gantt')?.kind, 'planningGantt');
assert.deepEqual(firstTabBlock('gantt')?.includedTypes, ['MO', 'WO', 'PO', 'DO', 'DLVR']);
assert.equal(firstTabBlock('flow')?.kind, 'planningFlow');
assert.equal(firstTabBlock('bom')?.kind, 'planningBom');
const ordersTabs = firstTabBlock('orders');
assert.equal(ordersTabs?.id, 'planning_console_orders_tabs');
assert.equal(ordersTabs?.kind, 'tabs');
assert.equal(ordersTabs?.defaultKey, 'demands');
assert.deepEqual(
  Array.isArray(ordersTabs?.tabs)
    ? (ordersTabs.tabs as Array<Record<string, unknown>>).map((tab) => tab.key)
    : [],
  ['demands', 'operation-plans']
);
const supplyTabs = firstTabBlock('supply');
assert.equal(supplyTabs?.id, 'planning_console_supply_tabs');
assert.equal(supplyTabs?.kind, 'tabs');
assert.equal(supplyTabs?.defaultKey, 'materials');
assert.deepEqual(
  Array.isArray(supplyTabs?.tabs)
    ? (supplyTabs.tabs as Array<Record<string, unknown>>).map((tab) => tab.key)
    : [],
  ['materials', 'plan-resources', 'resource-plans']
);
const issuesTabs = firstTabBlock('issues');
assert.equal(issuesTabs?.id, 'planning_console_issues_tabs');
assert.equal(issuesTabs?.kind, 'tabs');
assert.equal(issuesTabs?.defaultKey, 'problems');
assert.deepEqual(
  Array.isArray(issuesTabs?.tabs)
    ? (issuesTabs.tabs as Array<Record<string, unknown>>).map((tab) => tab.key)
    : [],
  ['problems', 'constraints']
);
const visitBlocks = (values: unknown[]): Record<string, unknown>[] => values.flatMap((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const block = value as Record<string, unknown>;
  const nested = Array.isArray(block.blocks) ? visitBlocks(block.blocks) : [];
  const tabBlocks = Array.isArray(block.tabs)
    ? (block.tabs as Record<string, unknown>[]).flatMap((tab) =>
        Array.isArray(tab.blocks) ? visitBlocks(tab.blocks) : []
      )
    : [];
  return [block, ...nested, ...tabBlocks];
});
const allBlocks = visitBlocks(blocks);
for (const block of allBlocks.filter((candidate) => candidate.kind === 'grid')) {
  assert.equal(block.clientFilter, false);
}
for (const [gridId, tableName] of Object.entries(PLANNING_CONSOLE_GRID_TABLES)) {
  const block = allBlocks.find((candidate) => candidate.id === gridId);
  assert.equal(block?.sourceType, 'custom', `${gridId} must retain its aggregate data source.`);
  assert.equal(block?.tableName, tableName, `${gridId} must link to ${tableName}.`);

  const sourceKey = String(block?.sourceKey ?? '');
  const linkedSource = normalizedSchema.dataSources?.[sourceKey] as Record<string, unknown> | undefined;
  assert.equal(linkedSource?.sourceType, 'custom');
  assert.equal(linkedSource?.serviceName, 'planning');
  assert.equal(linkedSource?.serviceMethod, 'getPlanningConsoleData');
  assert.equal(linkedSource?.tableName, undefined, `${gridId} must not query its linked table directly.`);
}

void Promise.all([testLargeSummary(), testRunBoundary(), testResourcePlanPagination()]).then(() => {
  console.log('planning console helpers tests passed');
});
