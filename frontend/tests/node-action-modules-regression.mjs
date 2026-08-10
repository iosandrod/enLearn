import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('runtime/node-action/index.ts', frameworkRoot))],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const runtime = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);
const {
  buttonGroupNodeActionDefinition,
  executeFormGetDataNodeAction,
  executeFormRefreshOptionsNodeAction,
  executeFormResetDataNodeAction,
  executeFormSetDataNodeAction,
  executeFormValidateNodeAction,
  executeGridAddRowNodeAction,
  executeGridDeleteCurrentRowNodeAction,
  executeGridReloadDataNodeAction,
  executeGridValidateNodeAction,
  formNodeActionDefinition,
  gridNodeActionDefinition,
  searchFormNodeActionDefinition,
} = runtime;

assert.deepEqual(Object.keys(buttonGroupNodeActionDefinition.methods), []);
const formMethods = ['setData', 'validate', 'getData', 'refreshOptions', 'resetData'];
assert.deepEqual(Object.keys(formNodeActionDefinition.methods), formMethods);
assert.deepEqual(Object.keys(searchFormNodeActionDefinition.methods), formMethods);
assert.deepEqual(Object.keys(gridNodeActionDefinition.methods), [
  'loadData',
  'reloadData',
  'validate',
  'addRow',
  'deleteCurrentRow',
]);

const forms = {
  'record-form': {
    id: 'record-1',
    name: 'Before',
    tags: ['old'],
  },
};
const createFormContext = (options) => ({
  block: { id: 'record-form', kind: 'form' },
  options,
  getFormValues: (blockId) => forms[blockId] ?? {},
  getFormBaseline: () => ({ id: 'baseline-1', name: 'Baseline' }),
  patchFormValues: (blockId, values) => {
    forms[blockId] = { ...forms[blockId], ...values };
  },
  replaceFormValues: (blockId, values) => {
    forms[blockId] = values;
  },
  validateForm: async () => true,
  clearFormValidation: () => undefined,
  refreshFormOptions: async (_blockId, refreshOptions) => refreshOptions,
});

const mergeInput = { name: 'After', tags: ['new'] };
const merged = executeFormSetDataNodeAction(createFormContext({ data: mergeInput }));
assert.deepEqual(merged, {
  id: 'record-1',
  name: 'After',
  tags: ['new'],
});
mergeInput.tags.push('mutated');
merged.tags.push('returned-value-mutation');
assert.deepEqual(forms['record-form'].tags, ['new']);

const replaced = executeFormSetDataNodeAction(createFormContext({
  data: { name: 'Replacement' },
  mode: 'replace',
}));
assert.deepEqual(replaced, { name: 'Replacement' });
assert.deepEqual(forms['record-form'], { name: 'Replacement' });
assert.throws(
  () => executeFormSetDataNodeAction(createFormContext({ data: [] })),
  /data 必须是对象/,
);

assert.equal(
  await executeFormValidateNodeAction(createFormContext({})),
  true,
);
const formData = executeFormGetDataNodeAction(createFormContext({}));
assert.deepEqual(formData, { name: 'Replacement' });
formData.name = 'Mutated return value';
assert.deepEqual(forms['record-form'], { name: 'Replacement' });

assert.deepEqual(
  await executeFormRefreshOptionsNodeAction(createFormContext({
    codes: ['status', 'status', ''],
    sourceKeys: ['departments'],
  })),
  { codes: ['status'], sourceKeys: ['departments'] },
);
assert.deepEqual(
  await executeFormRefreshOptionsNodeAction(createFormContext({ codes: [] })),
  { codes: [] },
);
await assert.rejects(
  executeFormRefreshOptionsNodeAction(createFormContext({ codes: 'status' })),
  /codes 必须是字符串数组/,
);

let validationCleared = false;
const resetContext = createFormContext({});
resetContext.clearFormValidation = () => {
  validationCleared = true;
};
const resetData = await executeFormResetDataNodeAction(resetContext);
assert.deepEqual(resetData, { id: 'baseline-1', name: 'Baseline' });
assert.equal(validationCleared, true);
resetData.name = 'Mutated reset result';
assert.equal(forms['record-form'].name, 'Baseline');

const sourceRows = [];
let syncedSourceGrid = false;
const sourceData = [{ id: 1, name: 'Ada' }];
const normalizedSourceRows = executeGridReloadDataNodeAction({
  block: {
    id: 'record-grid',
    kind: 'grid',
    sourceKey: 'records',
    schema: { grid: { columns: [] } },
  },
  options: { data: { rows: sourceData } },
  getSourceValue: () => undefined,
  setSource: (sourceKey, rows) => sourceRows.push({ sourceKey, rows }),
  setGridRows: () => assert.fail('A source-backed grid must update its source.'),
  syncGridStates: () => {
    syncedSourceGrid = true;
  },
});
assert.deepEqual(normalizedSourceRows, sourceData);
assert.deepEqual(sourceRows, [{ sourceKey: 'records', rows: sourceData }]);
assert.equal(syncedSourceGrid, true);
sourceData[0].name = 'Mutated';
assert.equal(normalizedSourceRows[0].name, 'Ada');

const pagedSourceUpdates = [];
executeGridReloadDataNodeAction({
  block: {
    id: 'paged-grid',
    kind: 'grid',
    sourceKey: 'paged-records',
    schema: { grid: { columns: [] } },
  },
  options: { data: [{ id: 2, name: 'Grace' }] },
  getSourceValue: () => ({ rows: [{ id: 1 }], total: 10 }),
  setSource: (_sourceKey, value) => pagedSourceUpdates.push(value),
  setGridRows: () => assert.fail('A source-backed grid must update its source.'),
  syncGridStates: () => undefined,
});
assert.deepEqual(pagedSourceUpdates, [{
  rows: [{ id: 2, name: 'Grace' }],
  total: 10,
}]);

let directGridUpdate;
executeGridReloadDataNodeAction({
  block: {
    id: 'local-grid',
    kind: 'grid',
    schema: {
      grid: {
        columns: [],
        rowConfig: { keyField: 'record_id' },
      },
    },
  },
  options: { data: [{ record_id: 'record-1' }] },
  getSourceValue: () => undefined,
  setSource: () => assert.fail('A local grid must update its own rows.'),
  setGridRows: (blockId, rows, options) => {
    directGridUpdate = { blockId, rows, options };
  },
  syncGridStates: () => undefined,
});
assert.deepEqual(directGridUpdate, {
  blockId: 'local-grid',
  rows: [{ record_id: 'record-1' }],
  options: { rowKey: 'record_id' },
});

const actionRows = [
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Grace' },
];
const actionGrid = {
  sourceKey: 'records',
  rowKey: 'id',
  rows: actionRows,
  currentRow: actionRows[0],
  selectedRows: [],
  contextRow: null,
  currentCell: null,
};
const createGridContext = (options = {}) => ({
  block: {
    id: 'record-grid',
    kind: 'grid',
    sourceKey: 'records',
    schema: { grid: { columns: [], rowConfig: { keyField: 'id' } } },
  },
  options,
  grids: { 'record-grid': actionGrid },
  getSourceValue: () => actionGrid.rows,
  setSource: (_sourceKey, rows) => {
    actionGrid.rows = Array.isArray(rows) ? rows : rows.rows;
  },
  setGridRows: () => assert.fail('A source-backed grid must update its source.'),
  syncGridStates: () => undefined,
  setGridCurrentRow: (_blockId, row) => {
    actionGrid.currentRow = row;
  },
  validateGrid: async () => true,
});

assert.equal(await executeGridValidateNodeAction(createGridContext()), true);
await assert.rejects(
  executeGridValidateNodeAction({
    ...createGridContext(),
    validateGrid: async () => {
      throw new Error('表格节点 "record-grid" 当前未挂载，无法校验。');
    },
  }),
  /当前未挂载/,
);

const addedRow = await executeGridAddRowNodeAction(createGridContext({
  data: { id: 3, name: 'Linus' },
}));
assert.deepEqual(addedRow, { id: 3, name: 'Linus' });
assert.deepEqual(actionGrid.rows, [
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Grace' },
  { id: 3, name: 'Linus' },
]);
assert.equal(actionGrid.currentRow, actionGrid.rows[2]);
addedRow.name = 'Mutated return value';
assert.equal(actionGrid.rows[2].name, 'Linus');
await assert.rejects(
  executeGridAddRowNodeAction(createGridContext({ data: [] })),
  /data 必须是对象/,
);

const deletedRow = await executeGridDeleteCurrentRowNodeAction(createGridContext());
assert.deepEqual(deletedRow, { id: 3, name: 'Linus' });
assert.deepEqual(actionGrid.rows, [
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Grace' },
]);
assert.equal(actionGrid.currentRow, null);
deletedRow.name = 'Mutated deleted value';
assert.equal(actionGrid.rows[1].name, 'Grace');

assert.equal(
  await executeGridDeleteCurrentRowNodeAction(createGridContext()),
  null,
);

const localRows = [{ code: 'draft' }];
const localGrid = {
  rowKey: 'id',
  rows: localRows,
  currentRow: localRows[0],
  selectedRows: [],
  contextRow: null,
  currentCell: null,
};
let localRowsUpdate;
await executeGridDeleteCurrentRowNodeAction({
  block: {
    id: 'local-grid',
    kind: 'grid',
    schema: { grid: { columns: [], rowConfig: { keyField: 'id' } } },
  },
  options: {},
  grids: { 'local-grid': localGrid },
  getSourceValue: () => undefined,
  setSource: () => assert.fail('A local grid must not update a source.'),
  setGridRows: (_blockId, rows) => {
    localRowsUpdate = rows;
    localGrid.rows = rows;
  },
  syncGridStates: () => undefined,
  setGridCurrentRow: (_blockId, row) => {
    localGrid.currentRow = row;
  },
});
assert.deepEqual(localRowsUpdate, []);

console.log('Node action modules regression test passed.');
