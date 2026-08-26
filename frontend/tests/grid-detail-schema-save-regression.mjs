import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const helperUrl = new URL('runtime/grid-detail-submission.ts', frameworkRoot);
const controllerSource = await readFile(
  new URL('runtime/page-data-controller.ts', frameworkRoot),
  'utf8',
);

const bundled = await build({
  entryPoints: [fileURLToPath(helperUrl)],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const detailModule = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);

const block = {
  id: 'sales-order-lines-grid',
  kind: 'grid',
  sourceKey: 'salesOrderLines',
  schema: {
    grid: { rowConfig: { keyField: 'id' } },
    detailConfig: {
      enabled: true,
      parentSourceKey: 'salesOrder',
      resource: 'sales_order_lines',
      foreignKey: 'order_id',
      parentKey: 'id',
      inheritFields: ['account_id'],
      updateMode: 'changes',
      defaults: { external_source: 'manual', status: 'open' },
      stripCreatedKey: true,
    },
  },
};
const source = { key: 'salesOrderLines', tableName: 'sales_order_lines' };
const createdRow = {
  id: 'local-row-id',
  _X_ROW_KEY: 'vxe-row-key',
  __rowStatus: 'created',
  account_id: 'forged-account',
  order_id: 'forged-order',
  line_no: 1,
  item_code: 'ITEM-001',
  item_name: 'Item 001',
};
const updatedRow = {
  id: 'persisted-line-id',
  __rowState: 'updated',
  account_id: 'forged-account',
  order_id: 'forged-order',
  item_name: 'Updated item',
};

const createSubmission = detailModule.buildLowCodeGridDetailSubmission({
  block,
  source,
  rows: [createdRow],
  changes: { created: [createdRow], updated: [], deleted: [] },
  creating: true,
});
assert.deepEqual(createSubmission, {
  resource: 'sales_order_lines',
  foreignKey: 'order_id',
  parentKey: 'id',
  inheritFields: ['account_id'],
  updateMode: 'changes',
  rows: [{
    external_source: 'manual',
    status: 'open',
    line_no: 1,
    item_code: 'ITEM-001',
    item_name: 'Item 001',
  }],
});

const updateSubmission = detailModule.buildLowCodeGridDetailSubmission({
  block,
  source,
  rows: [],
  changes: {
    created: [createdRow],
    updated: [updatedRow],
    deleted: [{ id: 'deleted-line-id' }],
  },
  creating: false,
});
assert.equal(updateSubmission.mode, 'changes');
assert.equal(updateSubmission.created[0].id, undefined);
assert.equal(updateSubmission.created[0].order_id, undefined);
assert.equal(updateSubmission.created[0].account_id, undefined);
assert.deepEqual(updateSubmission.updated, [{
  id: 'persisted-line-id',
  item_name: 'Updated item',
}]);
assert.deepEqual(updateSubmission.deleted, ['deleted-line-id']);

assert.match(
  controllerSource,
  /collectGridDetailSubmissionGroups[\s\S]*normalizeLowCodeGridDetailConfig[\s\S]*parentSourceKey/,
  'The generic form submission flow must group child grids by parent source.',
);
assert.match(
  controllerSource,
  /buildGridDetailSubmissions[\s\S]*getGridChanges[\s\S]*if \(details\.length\) values\.__details = details/,
  'The generic save request must include the schema-derived relation and grid changes.',
);
assert.match(
  controllerSource,
  /validateSubmissionBlocks[\s\S]*getGridController[\s\S]*controller\.validate/,
  'Child rows must be validated before the generic save request is sent.',
);

console.log('Grid detail schema save regression test passed.');
