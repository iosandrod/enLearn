import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { build } from 'esbuild';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(testDirectory, '../src/runtime/virtual-table.ts');
const result = await build({
  entryPoints: [sourcePath],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  write: false,
});
const moduleSource = result.outputFiles[0].text;
const virtualTable = await import(
  `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`
);

const {
  buildColumnOffsets,
  fitPinnedColumns,
  getColumnWindow,
  getRowWindow,
  normalizeVirtualColumns,
  normalizeVirtualSelectionConfig,
  partitionVirtualColumns,
  sortVirtualRows,
  updateVirtualSelectionKeys,
  withVirtualSelectionColumn,
} = virtualTable;

assert.deepEqual(normalizeVirtualSelectionConfig(true), { type: 'checkbox' });
assert.deepEqual(normalizeVirtualSelectionConfig('single'), { type: 'radio' });
assert.deepEqual(normalizeVirtualSelectionConfig({ enabled: true, type: 'radio', width: 56 }), {
  type: 'radio',
  width: 56,
  fixed: 'left',
});
assert.equal(normalizeVirtualSelectionConfig({ enabled: false }), null);

const configuredSelectionColumns = withVirtualSelectionColumn(
  [{ field: 'name', title: 'Name' }],
  { enabled: true, type: 'checkbox' },
);
assert.equal(configuredSelectionColumns[0].type, 'checkbox');
assert.deepEqual(
  withVirtualSelectionColumn([{ type: 'radio', title: '' }], true),
  [{ type: 'radio', title: '' }],
  'an explicit VXE selection column must take precedence over grid selection config',
);

const selectionColumns = normalizeVirtualColumns([
  { type: 'checkbox', title: '', width: 48 },
  { type: 'radio', title: '', width: 48, fixed: 'right' },
]);
assert.equal(selectionColumns[0].selection, 'checkbox');
assert.equal(selectionColumns[0].fixed, 'left');
assert.equal(selectionColumns[1].selection, 'radio');
assert.equal(selectionColumns[1].fixed, 'right');
assert.deepEqual(updateVirtualSelectionKeys([], 'a', true, true), ['a']);
assert.deepEqual(updateVirtualSelectionKeys(['a'], 'b', true, true), ['a', 'b']);
assert.deepEqual(updateVirtualSelectionKeys(['a', 'b'], 'a', false, true), ['b']);
assert.deepEqual(updateVirtualSelectionKeys(['a'], 'b', true, false), ['b']);
assert.deepEqual(updateVirtualSelectionKeys(['a'], 'a', true, false), ['a']);

const columns = normalizeVirtualColumns([
  { type: 'seq', title: '#', width: 52 },
  { field: 'code', title: 'Code', minWidth: 120, fixed: 'left' },
  { field: 'name', title: 'Name', width: 180 },
  { field: 'amount', title: 'Amount', width: 100, sortable: true },
  { title: 'Actions', width: 140, fixed: 'right', slots: { default: 'actions' } },
]);
const partitioned = partitionVirtualColumns(columns);
assert.deepEqual(partitioned.left.map((column) => column.key), ['__seq_0', 'code']);
assert.deepEqual(partitioned.center.map((column) => column.key), ['name', 'amount']);
assert.deepEqual(partitioned.right.map((column) => column.key), ['__actions_4']);
assert.equal(columns[1].width, 132, 'minWidth must participate in width normalization');

const narrowColumns = fitPinnedColumns(normalizeVirtualColumns([
  { type: 'seq', title: '#', width: 56 },
  { field: 'code', title: 'Code', width: 150, fixed: 'left' },
  { field: 'name', title: 'Name', width: 200, fixed: 'left' },
  { field: 'status', title: 'Status', width: 120 },
  { title: 'Actions', width: 120, fixed: 'right', slots: { default: 'actions' } },
]), 340);
const narrowPartitions = partitionVirtualColumns(narrowColumns);
assert.ok(
  narrowPartitions.left.reduce((total, column) => total + column.width, 0) <= 340 * 0.44 + 0.01,
  'left fixed columns must leave a usable center viewport on narrow screens',
);
assert.ok(
  narrowPartitions.right.reduce((total, column) => total + column.width, 0) <= 340 * 0.24 + 0.01,
  'right fixed columns must leave a usable center viewport on narrow screens',
);
assert.ok(narrowPartitions.center.length >= 1);

assert.deepEqual(
  getRowWindow(10_000, 48 * 500, 480, 48, 5),
  { start: 495, end: 515 },
  'row window should contain visible rows plus overscan',
);

const offsets = buildColumnOffsets([
  { width: 100 },
  { width: 120 },
  { width: 80 },
  { width: 160 },
]);
assert.deepEqual(offsets, [0, 100, 220, 300, 460]);
assert.deepEqual(
  getColumnWindow(offsets, 130, 150, 1),
  { start: 0, end: 4, offset: 0, width: 460 },
  'column window should include both intersecting columns and overscan',
);
assert.deepEqual(
  getColumnWindow(offsets, 220, 80, 0),
  { start: 2, end: 3, offset: 220, width: 80 },
  'column boundaries should not render the preceding column',
);

const rows = [
  { id: 'a', amount: 20 },
  { id: 'b', amount: 3 },
  { id: 'c', amount: 20 },
];
assert.deepEqual(
  sortVirtualRows(rows, { key: 'amount', field: 'amount', direction: 'asc' }).map((row) => row.id),
  ['b', 'a', 'c'],
  'sorting should be numeric and stable',
);
assert.deepEqual(
  sortVirtualRows(rows, { key: 'amount', field: 'amount', direction: 'desc' }).map((row) => row.id),
  ['a', 'c', 'b'],
);
assert.deepEqual(
  sortVirtualRows(
    [{ value: '2026-08-10' }, { value: '2026-08-02' }],
    { key: 'value', field: 'value', direction: 'asc' },
  ).map((row) => row.value),
  ['2026-08-02', '2026-08-10'],
  'date-like strings must not be coerced into partial numbers',
);

const componentSource = await readFile(
  path.resolve(testDirectory, '../src/runtime/materials/mobile-virtual-table.vue'),
  'utf8',
);
assert.match(
  componentSource,
  /@click\.stop="publishCurrentRow\(item\.row, item\.index\)"/,
  'fixed cells must own the current-row click because Hippy does not reliably bubble it',
);
assert.match(
  componentSource,
  /@click\.stop="handleCenterCellClick\(item\.row, item\.index\)"/,
  'virtualized center cells must own the current-row click',
);
assert.match(
  componentSource,
  /Date\.now\(\) < suppressCenterClickUntil\.value/,
  'a horizontal drag must suppress the synthetic cell click that follows it',
);
assert.match(
  componentSource,
  /backgroundColor: currentRowBackground\(key\)/,
  'the current-row background must be sent as reactive inline style for Hippy native panes',
);
assert.match(
  componentSource,
  /@click\.stop="toggleRowSelection\(item\.row, item\.index, column\.selection\)"/,
  'selection controls must keep their click independent from current-row highlighting',
);

console.log('virtual-table regression checks passed');
