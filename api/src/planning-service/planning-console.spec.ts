import assert from 'node:assert/strict';

import {
  buildPlanningBomTree,
  buildPlanningFlowData,
  intervalHours,
  loadPlanningConsoleSummary,
  parsePlanningConsoleRequest
} from './planning-console';
import {
  PLANNING_CONSOLE_PAGE_CODE,
  PLANNING_CONSOLE_PAGE_SCHEMA,
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
assert.equal(flow.nodes.find((node) => node.id === 'assemble')?.resourceSummary, '装配线');

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
assert.deepEqual(filter?.targetSourceKeys, [...PLANNING_CONSOLE_SOURCE_KEYS, 'versionOptions']);
const filterSchema = filter?.schema as Record<string, unknown> | undefined;
const filterFields = Array.isArray(filterSchema?.fields)
  ? filterSchema.fields as Array<Record<string, unknown>>
  : [];
const scenarioField = filterFields.find((field) => field.field === 'scenarioId');
const scenarioEvents = scenarioField?.events as Record<string, unknown> | undefined;
const scenarioChange = Array.isArray(scenarioEvents?.change)
  ? scenarioEvents.change as Array<Record<string, unknown>>
  : [];
assert.ok(scenarioChange.some((directive) =>
  directive.type === 'setFormField' &&
  directive.field === 'planVersionId' &&
  directive.value === ''
));
assert.ok(scenarioChange.some((directive) =>
  directive.type === 'refreshDataSources' &&
  Array.isArray(directive.sourceKeys) &&
  directive.sourceKeys.includes('versionOptions')
));
const actionBlock = blocks.find((block) => block.id === 'planning_console_actions');
const actions = Array.isArray(actionBlock?.actions) ? actionBlock.actions : [];
for (const code of ['preflight', 'run', 'cancel', 'publish']) {
  const action = actions.find((candidate: Record<string, unknown>) => candidate.code === code);
  assert.equal(action?.permissionCode, 'planning.models.manage');
  assert.equal(typeof action?.script, 'string');
}
assert.match(String(actions.find((action: Record<string, unknown>) => action.code === 'run')?.script), /scenarioId[\s\S]*engine\.available[\s\S]*trigger\.configured[\s\S]*worker\.online/);
assert.match(String(actions.find((action: Record<string, unknown>) => action.code === 'cancel')?.script), /currentRow[\s\S]*queued[\s\S]*running/);
assert.match(String(actions.find((action: Record<string, unknown>) => action.code === 'publish')?.script), /summary\.versionId[\s\S]*versionStatus[\s\S]*completed/);
assert.deepEqual(normalizedSchema.scriptPolicy?.capabilities, [
  'http.execute',
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
assert.equal(firstTabBlock('flow')?.kind, 'planningFlow');
assert.equal(firstTabBlock('bom')?.kind, 'planningBom');
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
for (const block of visitBlocks(blocks).filter((candidate) => candidate.kind === 'grid')) {
  assert.equal(block.clientFilter, false);
}

void testLargeSummary().then(() => {
  console.log('planning console helpers tests passed');
});
