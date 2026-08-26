import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const migration = await readFile(
  new URL('../../supabase/migrations/20260826220000_database_node_actions.sql', import.meta.url),
  'utf8',
);

function extractActionSource(anchor) {
  const anchorIndex = migration.indexOf(anchor);
  assert.notEqual(anchorIndex, -1, `Missing action seed anchor: ${anchor}`);
  const sourceStart = migration.indexOf('$action$', anchorIndex);
  const sourceEnd = migration.indexOf('$action$', sourceStart + '$action$'.length);
  assert.ok(sourceStart > anchorIndex && sourceEnd > sourceStart);
  return migration.slice(sourceStart + '$action$'.length, sourceEnd).trim();
}

const gridLoadDataMain = new Function(
  `${extractActionSource("'grid', '表格', 'ri-table-2', 'loadData'")}\nreturn main;`,
)();

async function runGridLoadData({
  block,
  source,
  options = {},
  blocks = [block],
  searches = {},
  grids = {},
  invokeValue = [],
}) {
  const invocations = [];
  const assigned = [];
  const loading = [];
  const commands = [];
  let latestVersion = 0;
  const value = await gridLoadDataMain.call({
    event: {
      payload: {
        nodeAction: {
          block,
          options,
          blocks,
          dataSources: { [block.sourceKey]: source },
        },
      },
    },
    searches,
    grids,
    $node: {
      call: async (command, payload = {}) => {
        commands.push(command);
        switch (command) {
          case 'runtime.resolve':
            return structuredClone(payload.value);
          case 'source.begin':
            latestVersion += 1;
            return latestVersion;
          case 'source.invoke':
            invocations.push(structuredClone(payload));
            return structuredClone(invokeValue);
          case 'source.isCurrent':
            return payload.version === latestVersion;
          case 'source.set':
            assigned.push(structuredClone(payload.value));
            return true;
          case 'source.finish':
            return true;
          case 'loading.grid':
            loading.push(payload.loading);
            return true;
          default:
            assert.fail(`Unexpected node runtime command: ${command}`);
        }
      },
    },
  });
  return { value, invocations, assigned, loading, commands };
}

const mainBlock = {
  id: 'orders-grid',
  kind: 'grid',
  tableType: 'main',
  sourceKey: 'orders',
  schema: { grid: { columns: [] } },
};
const detailBlock = {
  id: 'lines-grid',
  kind: 'grid',
  tableType: 'detail',
  sourceKey: 'lines',
  schema: { grid: { columns: [] } },
};

const mainResult = await runGridLoadData({
  block: mainBlock,
  source: {
    key: 'orders',
    postData: { tableName: 'sales_orders', filters: { status: 'draft' } },
  },
  searches: { orders: { customer_code: 'CUST-001' } },
  options: { filters: { status: 'approved' } },
  invokeValue: [{ id: 'order-1' }],
});
assert.deepEqual(mainResult.invocations[0].postData.filters, {
  status: 'approved',
  customer_code: 'CUST-001',
});
assert.deepEqual(mainResult.value, [{ id: 'order-1' }]);
assert.deepEqual(mainResult.assigned, [[{ id: 'order-1' }]]);
assert.deepEqual(mainResult.loading, [true, false]);

const detailResult = await runGridLoadData({
  block: detailBlock,
  blocks: [mainBlock, detailBlock],
  source: {
    key: 'lines',
    postData: {
      tableName: 'sales_order_lines',
      filters: { order_id: '__none__' },
      requiredFilters: ['order_id'],
    },
  },
  grids: {
    'orders-grid': {
      rowKey: 'id',
      rows: [{ id: 'order-1' }],
      currentRow: { id: 'order-1' },
      selectedRows: [],
      contextRow: null,
    },
  },
  invokeValue: [{ id: 'line-1', order_id: 'order-1' }],
});
assert.deepEqual(detailResult.invocations[0].postData.filters, {
  order_id: 'order-1',
});
assert.deepEqual(detailResult.invocations[0].postData.requiredFilters, ['order_id']);

const unresolvedDetail = await runGridLoadData({
  block: detailBlock,
  blocks: [detailBlock],
  source: {
    key: 'lines',
    postData: {
      tableName: 'sales_order_lines',
      filters: { order_id: '__none__' },
      requiredFilters: ['order_id'],
    },
  },
});
assert.deepEqual(unresolvedDetail.value, []);
assert.deepEqual(unresolvedDetail.invocations, []);
assert.deepEqual(unresolvedDetail.assigned, [[]]);
assert.ok(unresolvedDetail.commands.includes('source.begin'));

const runtimeFilteredDetail = await runGridLoadData({
  block: detailBlock,
  blocks: [detailBlock],
  source: { key: 'lines', postData: { tableName: 'sales_order_lines' } },
  searches: { lines: { order_id: 'order-from-search' } },
  invokeValue: [{ id: 'line-2' }],
});
assert.deepEqual(runtimeFilteredDetail.invocations[0].postData.filters, {
  order_id: 'order-from-search',
});
assert.deepEqual(runtimeFilteredDetail.invocations[0].postData.requiredFilters, ['order_id']);

const [runtimeSource, registrySource, pageDataControllerSource] = await Promise.all([
  readFile(new URL('runtime/lowcode-page-script-runtime.ts', frameworkRoot), 'utf8'),
  readFile(new URL('runtime/node-action-registry.ts', frameworkRoot), 'utf8'),
  readFile(new URL('runtime/page-data-controller.ts', frameworkRoot), 'utf8'),
]);
assert.match(runtimeSource, /executeDatabaseNodeAction[\s\S]*?action\.source_code/);
assert.match(runtimeSource, /request\.name === 'node\.runtime'[\s\S]*?handleNodeRuntimeCommand/);
assert.doesNotMatch(runtimeSource, /executeGridLoadDataAction|executeGridLoadDataNodeAction/);
assert.match(registrySource, /resolveLowCodeDataSourceNodeAction/);
assert.match(
  pageDataControllerSource,
  /resolveLowCodeDataSourceNodeAction\([\s\S]*?props\.page\.node_actions/,
);
assert.match(migration, /'grid', '表格', 'ri-table-2', 'loadData'/);
await assert.rejects(access(new URL('runtime/grid-node-actions.ts', frameworkRoot)), {
  code: 'ENOENT',
});

console.log('Database grid load-data Action regression test passed.');
