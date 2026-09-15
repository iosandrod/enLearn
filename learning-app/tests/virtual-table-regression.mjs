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
  createVirtualCellValueReader,
  fitPinnedColumns,
  getColumnWindow,
  getRowWindow,
  getVirtualScrollbarMetrics,
  normalizeVirtualColumns,
  normalizeVirtualSelectionConfig,
  partitionVirtualColumns,
  retainColumnWindow,
  retainVirtualRange,
  reuseColumnWindow,
  reuseVirtualRange,
  shouldStartVirtualPan,
  sortVirtualRows,
  scrollVirtualScrollbarByThumbDelta,
  scrollVirtualScrollbarToTrackPosition,
  updateVirtualSelectionKeys,
  withVirtualSelectionColumn,
} = virtualTable;

assert.equal(
  shouldStartVirtualPan(5, 5, { horizontal: true, vertical: true }),
  true,
  'a diagonal gesture should start both virtual scroll axes',
);
assert.equal(
  shouldStartVirtualPan(4, 2, { horizontal: true, vertical: true }),
  false,
  'small finger jitter must not start table panning',
);

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
  narrowPartitions.left.map((column) => column.key),
  ['__seq_0'],
  'business columns should unpin instead of being squeezed into unreadable fixed cells',
);

const narrowUtilityColumns = partitionVirtualColumns(fitPinnedColumns(normalizeVirtualColumns([
  { type: 'checkbox', title: '', width: 48 },
  { type: 'seq', title: '#', width: 48 },
  { field: 'request', title: 'Request', width: 110, fixed: 'left' },
  { field: 'owner', title: 'Owner', width: 100 },
  { title: 'Actions', width: 104, fixed: 'right', slots: { default: 'actions' } },
]), 333));
assert.deepEqual(
  narrowUtilityColumns.left.map((column) => [column.key, column.width]),
  [['__checkbox_0', 48], ['__seq_1', 48]],
  'selection and sequence columns should retain their configured widths on a phone viewport',
);
assert.equal(narrowUtilityColumns.center[0].key, 'request');

const utilityPriorityColumns = partitionVirtualColumns(fitPinnedColumns(normalizeVirtualColumns([
  { field: 'request', title: 'Request', width: 110, fixed: 'left' },
  { type: 'checkbox', title: '', width: 48 },
  { type: 'seq', title: '#', width: 48 },
  { field: 'owner', title: 'Owner', width: 100 },
  { title: 'Actions', width: 104, fixed: 'right', slots: { default: 'actions' } },
]), 333));
assert.deepEqual(
  utilityPriorityColumns.left.map((column) => column.key),
  ['__checkbox_1', '__seq_2'],
  'selection and sequence columns should take fixed-column priority regardless of schema order',
);

assert.deepEqual(
  getRowWindow(10_000, 48 * 500, 480, 48, 5),
  { start: 495, end: 515 },
  'row window should contain visible rows plus overscan',
);

const scrollbarMetrics = getVirtualScrollbarMetrics(300, 1200, 450, 32);
assert.deepEqual(scrollbarMetrics, {
  maxScroll: 900,
  thumbOffset: 112.5,
  thumbSize: 75,
  thumbTravel: 225,
});
assert.equal(
  scrollVirtualScrollbarByThumbDelta(scrollbarMetrics, 450, 50),
  650,
  'dragging the thumb must scale track movement into content movement',
);
assert.equal(
  scrollVirtualScrollbarToTrackPosition(scrollbarMetrics, 150),
  450,
  'pressing the track must center the thumb at the pressed position',
);
assert.deepEqual(
  getVirtualScrollbarMetrics(300, 200, 0, 32),
  { maxScroll: 0, thumbOffset: 0, thumbSize: 300, thumbTravel: 0 },
  'a non-overflowing axis must still render a full-size disabled thumb',
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

const stableColumnWindow = getColumnWindow(offsets, 220, 80, 0);
assert.equal(
  reuseColumnWindow(stableColumnWindow, getColumnWindow(offsets, 221, 79, 0)),
  stableColumnWindow,
  'a pixel-level scroll inside the same column window must retain object identity',
);
const retainedColumnWindow = retainColumnWindow(
  undefined,
  stableColumnWindow,
  offsets,
  { leading: 1, trailing: 1 },
);
assert.deepEqual(retainedColumnWindow, { start: 1, end: 4, offset: 100, width: 360 });
assert.equal(
  retainColumnWindow(
    retainedColumnWindow,
    getColumnWindow(offsets, 221, 79, 0),
    offsets,
    { leading: 1, trailing: 1 },
  ),
  retainedColumnWindow,
  'column retention must avoid mounting a new column at every boundary pixel',
);
const stableRowWindow = getRowWindow(10_000, 48 * 500, 480, 48, 5);
assert.equal(
  reuseVirtualRange(stableRowWindow, getRowWindow(10_000, 48 * 500 + 10, 480, 48, 5)),
  stableRowWindow,
  'a pixel-level scroll inside the same row window must retain object identity',
);
const retainedRowWindow = retainVirtualRange(
  undefined,
  stableRowWindow,
  10_000,
  { leading: 2, trailing: 2 },
);
assert.deepEqual(retainedRowWindow, { start: 493, end: 517 });
assert.equal(
  retainVirtualRange(
    retainedRowWindow,
    getRowWindow(10_000, 48 * 501, 480, 48, 5),
    10_000,
    { leading: 2, trailing: 2 },
  ),
  retainedRowWindow,
  'row retention must avoid replacing rows until the spare buffer is consumed',
);

const cachedFormatter = {
  type: 'currency',
  locale: 'en-US',
  currency: 'USD',
};
const cachedColumn = normalizeVirtualColumns([
  { field: 'amount', title: 'Amount', formatter: cachedFormatter },
])[0];
const cachedRow = { amount: 12.5 };
const cellReader = createVirtualCellValueReader();
assert.equal(cellReader(cachedRow, cachedColumn, 0), '$12.50');
cachedRow.amount = 18;
assert.equal(
  cellReader(cachedRow, cachedColumn, 0),
  '$18.00',
  'the cell cache must refresh when a mutable row value changes',
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
  /@click\.stop="handleCurrentRowClick\(item\.row, item\.index\)"/,
  'fixed cells must own the current-row click because Hippy does not reliably bubble it',
);
assert.match(
  componentSource,
  /@click\.stop="handleCurrentRowClick\(item\.row, item\.index\)"/,
  'virtualized center cells must own the current-row click',
);
assert.doesNotMatch(
  componentSource,
  /handleCenterTouch(?:Start|Move|End)/,
  'table cells must leave vertical touch gestures to the native ScrollView',
);
assert.match(
  componentSource,
  /class="vertical-scroll"[\s\S]*?@touchstart="handleBodyTouchStart"[\s\S]*?@touchmove="handleBodyTouchMove"/,
  'a stable non-scrolling viewport must own bidirectional touch panning',
);
assert.match(
  componentSource,
  /queueTableScroll\([\s\S]*?state\.lastX - nextX[\s\S]*?state\.lastY - nextY/,
  'one touch event must queue both virtual axes together',
);
assert.match(
  componentSource,
  /function scheduleScrollCommit[\s\S]*?requestAnimationFrame\(commitPendingScroll\)/,
  'touch events must coalesce into one reactive scroll commit per display frame',
);
assert.match(
  componentSource,
  /const centerWindow = computed<ColumnWindow>[\s\S]*?reuseColumnWindow/,
  'the column window should retain identity while scrolling inside the same range',
);
assert.match(
  componentSource,
  /retainColumnWindow\([\s\S]*?leading: 1, trailing: 1/,
  'the mounted column window needs a spare retention buffer',
);
assert.match(
  componentSource,
  /const rowWindow = computed<VirtualRange>[\s\S]*?reuseVirtualRange/,
  'the row window should retain identity while scrolling inside the same range',
);
assert.match(
  componentSource,
  /retainVirtualRange\([\s\S]*?leading: 2, trailing: 2/,
  'the mounted row window needs a spare retention buffer',
);
assert.match(
  componentSource,
  /const readCell = createVirtualCellValueReader\(\)/,
  'formatted cell text should be cached outside the render hot path',
);
assert.match(
  componentSource,
  /startBodyMomentum\(state\.velocityX, state\.velocityY\)/,
  'releasing a fast diagonal pan must continue on both axes',
);
assert.match(
  componentSource,
  /requestAnimationFrame\(runBodyMomentumFrame\)/,
  'momentum rendering should align with display frames when available',
);
assert.doesNotMatch(
  componentSource,
  /verticalScrollRef\.value\?\.scrollTo/,
  'vertical panning must not bridge a native scrollTo call for every touch event',
);
assert.match(
  componentSource,
  /height: `\$\{Math\.max\([\s\S]*?bodyViewportHeight\.value[\s\S]*?rowWindow\.value\.end - rowWindow\.value\.start[\s\S]*?\* rowHeight\.value[\s\S]*?\)}px`/,
  'the virtual content layer must be tall enough to contain visible and overscan rows',
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

assert.match(
  componentSource,
  /class="scrollbar-thumb horizontal-scrollbar-thumb"[\s\S]*?handleScrollbarThumbTouchStart\('x'/,
  'the horizontal scrollbar must expose a draggable thumb',
);
assert.match(
  componentSource,
  /class="scrollbar-thumb vertical-scrollbar-thumb"[\s\S]*?handleScrollbarThumbTouchStart\('y'/,
  'the vertical scrollbar must expose a draggable thumb',
);
assert.match(
  componentSource,
  /function beginScrollbarDrag[\s\S]*?stopBodyMomentum\(\)/,
  'direct scrollbar manipulation must immediately cancel body momentum',
);
assert.match(
  componentSource,
  /scrollVirtualScrollbarToTrackPosition/,
  'pressing either scrollbar track must reposition its thumb',
);
assert.doesNotMatch(
  componentSource,
  /enlearnHorizontalScroll/,
  'table scrolling must not depend on a Web-only ScrollView extension',
);
assert.match(
  componentSource,
  /\.fixed-pane \.body-cell\s*{\s*background-color: #ffffff;/,
  'fixed cells need an opaque background so center text cannot bleed through them',
);
assert.match(
  componentSource,
  /:style="fixedCellStyle\(column, item\.key\)"/,
  'fixed cells need a reactive opaque inline background on Hippy native',
);
assert.match(
  componentSource,
  /:style="leftBodyPaneStyle"/,
  'the left fixed plane must receive an explicit opaque native layer style',
);
assert.match(
  componentSource,
  /const leftBodyPaneStyle[\s\S]*?overflow: 'hidden'[\s\S]*?zIndex: 10[\s\S]*?backgroundColor: '#ffffff'/,
  'fixed plane inline styles must force clipping, opacity, and a layer above virtual columns',
);
assert.match(
  componentSource,
  /const centerBodyPaneStyle[\s\S]*?width: `\$\{centerViewportWidth\.value\}px`[\s\S]*?bodyViewportHeight\.value[\s\S]*?overflow: 'hidden'/,
  'the center virtual pane needs explicit dimensions so Hippy preserves its clipping boundary',
);
assert.match(
  componentSource,
  /class="center-body-window" :style="centerBodyWindowStyle"[\s\S]*?v-for="item in visibleRows"/,
  'all center rows must share one horizontally translated canvas',
);
assert.equal(
  (componentSource.match(/:style="centerBodyWindowStyle"/g) ?? []).length,
  1,
  'horizontal body scrolling should update one center canvas instead of one canvas per row',
);
assert.match(
  componentSource,
  /const visibleCenterColumnItems[\s\S]*?offset: centerOffsets\.value\[index\]/,
  'each virtual column needs its stable full-grid offset',
);
assert.match(
  componentSource,
  /function centerCellStyle[\s\S]*?position: 'absolute'[\s\S]*?left: `\$\{item\.offset\}px`/,
  'visible columns must use absolute grid coordinates so staggered native updates cannot shift them',
);
assert.match(
  componentSource,
  /const centerHeaderWindowStyle[\s\S]*?width: `\$\{centerWidth\.value\}px`[\s\S]*?translateX\(\$\{-scrollLeft\.value\}px\)/,
  'the virtual column canvas must retain the full center width while only visible cells are mounted',
);
assert.doesNotMatch(
  componentSource,
  /translateX\(\$\{centerWindow\.value\.offset - scrollLeft\.value\}px\)/,
  'column placement must not depend on the current window start',
);
assert.match(
  componentSource,
  /const centerHeaderPaneStyle[\s\S]*?width: `\$\{centerViewportWidth\.value\}px`[\s\S]*?height: `\$\{headerHeight\.value\}px`[\s\S]*?overflow: 'hidden'/,
  'the center header needs explicit dimensions so it cannot bleed through fixed headers',
);
assert.match(
  componentSource,
  /:numberOfLines="1" ellipsizeMode="tail"/,
  'cell text must be clipped by the native Hippy text component',
);

console.log('virtual-table regression checks passed');
