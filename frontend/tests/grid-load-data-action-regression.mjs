import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('runtime/grid-node-actions.ts', frameworkRoot))],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const runtime = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);
const {
  createGridLoadDataPostData,
  executeGridLoadDataAction,
  executeGridLoadDataNodeAction,
} = runtime;

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
const gridBlocks = [mainBlock, detailBlock];
const baseContext = {
  options: {},
  searchFilters: {},
  grids: {},
  gridBlocks,
  resolveRequest: (_key, _source, postData) => ({
    serviceName: 'admin',
    serviceMethod: 'listItems',
    postData,
  }),
  invoke: async () => [],
  setData: () => undefined,
  setLoading: () => undefined,
};

const mainRequest = createGridLoadDataPostData({
  ...baseContext,
  block: mainBlock,
  source: {
    key: 'orders',
    postData: { tableName: 'sales_orders', filters: { status: 'draft' } },
  },
  searchFilters: { orders: { customer_code: 'CUST-001' } },
  options: { filters: { status: 'approved' } },
});
assert.equal(mainRequest.skip, false);
assert.deepEqual(mainRequest.postData.filters, {
  status: 'approved',
  customer_code: 'CUST-001',
});

const detailRequest = createGridLoadDataPostData({
  ...baseContext,
  block: detailBlock,
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
      currentCell: null,
    },
  },
});
assert.equal(detailRequest.skip, false);
assert.deepEqual(detailRequest.postData.filters, { order_id: 'order-1' });
assert.deepEqual(detailRequest.postData.requiredFilters, ['order_id']);

const editDetailRequest = createGridLoadDataPostData({
  ...baseContext,
  block: detailBlock,
  gridBlocks: [detailBlock],
  source: {
    key: 'lines',
    postData: {
      tableName: 'sales_order_lines',
      filters: { order_id: 'order-from-route' },
      requiredFilters: ['order_id'],
    },
  },
  configuredPostData: {
    filters: { order_id: '{{ route.query.id }}' },
    requiredFilters: ['order_id'],
  },
});
assert.equal(editDetailRequest.skip, false);
assert.deepEqual(editDetailRequest.postData.filters, { order_id: 'order-from-route' });

const unresolvedDetailRequest = createGridLoadDataPostData({
  ...baseContext,
  block: detailBlock,
  gridBlocks: [detailBlock],
  source: {
    key: 'lines',
    postData: {
      tableName: 'sales_order_lines',
      filters: { order_id: '__none__' },
      requiredFilters: ['order_id'],
    },
  },
});
assert.equal(unresolvedDetailRequest.skip, true);

const unresolvedRouteDetailRequest = createGridLoadDataPostData({
  ...baseContext,
  block: detailBlock,
  gridBlocks: [detailBlock],
  source: {
    key: 'lines',
    postData: {
      tableName: 'sales_order_lines',
      filters: { order_id: '{{ route.query.id }}' },
    },
  },
});
assert.equal(unresolvedRouteDetailRequest.skip, true);

const unsafeDetailRequest = createGridLoadDataPostData({
  ...baseContext,
  block: detailBlock,
  gridBlocks: [detailBlock],
  source: {
    key: 'lines',
    postData: { tableName: 'sales_order_lines' },
  },
});
assert.equal(unsafeDetailRequest.skip, true);

const unsafeDetailRequestWithMainRow = createGridLoadDataPostData({
  ...baseContext,
  block: detailBlock,
  source: {
    key: 'lines',
    postData: { tableName: 'sales_order_lines' },
  },
  grids: {
    'orders-grid': {
      rowKey: 'id',
      rows: [{ id: 'order-1' }],
      currentRow: { id: 'order-1' },
      selectedRows: [],
      contextRow: null,
      currentCell: null,
    },
  },
});
assert.equal(
  unsafeDetailRequestWithMainRow.skip,
  true,
  'A main row alone is not enough to infer a safe detail-table relation.',
);

const runtimeFilteredDetailRequest = createGridLoadDataPostData({
  ...baseContext,
  block: detailBlock,
  gridBlocks: [detailBlock],
  source: {
    key: 'lines',
    postData: { tableName: 'sales_order_lines' },
  },
  searchFilters: { lines: { order_id: 'order-from-search' } },
});
assert.equal(runtimeFilteredDetailRequest.skip, false);
assert.deepEqual(runtimeFilteredDetailRequest.postData.filters, {
  order_id: 'order-from-search',
});
assert.deepEqual(runtimeFilteredDetailRequest.postData.requiredFilters, ['order_id']);

let invoked = false;
let assigned;
let loadingTransitions = [];
const emptyRows = await executeGridLoadDataAction({
  ...baseContext,
  block: detailBlock,
  source: {
    key: 'lines',
    postData: {
      tableName: 'sales_order_lines',
      filters: { order_id: '__none__' },
      requiredFilters: ['order_id'],
    },
  },
  invoke: async () => {
    invoked = true;
    return [{ id: 'unexpected' }];
  },
  setData: (value) => {
    assigned = value;
  },
  setLoading: (value) => loadingTransitions.push(value),
});
assert.deepEqual(emptyRows, []);
assert.deepEqual(assigned, []);
assert.equal(invoked, false, 'A detail grid without a main row must not query all rows.');
assert.deepEqual(loadingTransitions, [true, false]);

const pendingRequests = [];
const assignedVersions = [];
const loadingVersions = [];
let latestVersion = 0;
const actionRuntimeContext = {
  block: detailBlock,
  options: { filters: { order_id: 'order-1' } },
  blocks: [detailBlock],
  searchFilters: {},
  grids: {},
  getDataSource: () => ({
    key: 'lines',
    serviceName: 'admin',
    serviceMethod: 'listItems',
    postData: {
      tableName: 'sales_order_lines',
      requiredFilters: ['order_id'],
    },
  }),
  resolveDataSourceRequest: (_sourceKey, source, postData) => ({
    serviceName: source.serviceName,
    serviceMethod: source.serviceMethod,
    postData,
  }),
  resolveRuntimePostData: (postData) => postData,
  invokeDataSourceRequest: () => new Promise((resolve) => pendingRequests.push(resolve)),
  setSource: (_sourceKey, value) => assignedVersions.push(value),
  syncGridStates: () => undefined,
  beginSourceRequest: () => ++latestVersion,
  isCurrentSourceRequest: (_sourceKey, version) => version === latestVersion,
  finishSourceRequest: () => undefined,
  setLoadingGrid: (_blockId, loading) => loadingVersions.push({ version: latestVersion, loading }),
};
const firstRequest = executeGridLoadDataNodeAction(actionRuntimeContext);
const secondRequest = executeGridLoadDataNodeAction({
  ...actionRuntimeContext,
  options: { filters: { order_id: 'order-2' } },
});
pendingRequests[0]([{ id: 'stale-line' }]);
await firstRequest;
assert.deepEqual(assignedVersions, []);
assert.deepEqual(loadingVersions, [
  { version: 1, loading: true },
  { version: 2, loading: true },
]);
pendingRequests[1]([{ id: 'current-line' }]);
await secondRequest;
assert.deepEqual(assignedVersions, [[{ id: 'current-line' }]]);
assert.deepEqual(loadingVersions.at(-1), { version: 2, loading: false });

const [rendererSource, registrySource, gridActionSource, salesOrderPage, migration] = await Promise.all([
  readFile(new URL('components/LowCodePageRenderer.vue', frameworkRoot), 'utf8'),
  readFile(new URL('runtime/node-action-registry.ts', frameworkRoot), 'utf8'),
  readFile(new URL('runtime/node-action/grid-action.ts', frameworkRoot), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260803093000_sales_order_lowcode_page.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260809200000_grid_load_data_action.sql', import.meta.url), 'utf8'),
]);
assert.match(gridActionSource, /method: 'loadData'[\s\S]*?execute: executeGridLoadDataNodeAction/);
assert.match(registrySource, /grid:\s*gridNodeActionDefinition/);
assert.match(rendererSource, /if \(action\.execute\)[\s\S]*?return action\.execute/);
assert.match(registrySource, /resolveLowCodeDataSourceNodeAction/);
assert.match(rendererSource, /resolveLowCodeDataSourceNodeAction\(pageBlocks, key\)/);
assert.doesNotMatch(rendererSource, /method: 'loadData'/);
assert.doesNotMatch(rendererSource, /case 'grid\.loadData'/);
assert.doesNotMatch(rendererSource, /executeGridLoadDataAction/);
assert.match(salesOrderPage, /"id": "sales-order-grid"[\s\S]*?"tableType": "main"/);
assert.match(salesOrderPage, /"id": "sales-order-lines-grid"[\s\S]*?"tableType": "detail"/);
assert.match(salesOrderPage, /"requiredFilters": \["order_id"\]/);
assert.match(migration, /where code = 'sales-orders'[\s\S]*?where code = 'sales-orders-edit'/);

console.log('Grid load-data Action regression test passed.');
