import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
	expandSelectionToTableMerges,
	findTableMerge,
	getTableMergeBoundaryGaps,
	insertTableMergeAxis,
	normalizeTableMergeCells,
	normalizeTableSelection,
	removeTableMergeAxis,
	tableMergesIntersecting,
} from '../src/components/shapes/tableStructure.ts'

const merges = normalizeTableMergeCells([
	{ row: 1, col: 1, rowspan: 2, colspan: 2 },
	{ row: 9, col: 0, rowspan: 2, colspan: 1 },
	{ row: 0, col: 0, rowspan: 0, colspan: 2 },
	{ row: Number.NaN, col: 0, rowspan: 2, colspan: 2 },
], 4, 4)
assert.deepEqual(merges, [{ row: 1, col: 1, rowspan: 2, colspan: 2 }])
assert.equal(findTableMerge(merges, 2, 2), merges[0])
assert.equal(findTableMerge(merges, 0, 0), undefined)
assert.deepEqual(
	getTableMergeBoundaryGaps(merges, 'row', 1, [0, 10, 20, 30, 40]),
	[{ start: 10, end: 30 }],
	'horizontal grid lines must leave merged cell interiors clear'
)
assert.deepEqual(
	getTableMergeBoundaryGaps(merges, 'col', 1, [0, 15, 30, 45, 60]),
	[{ start: 15, end: 45 }],
	'vertical grid lines must leave merged cell interiors clear'
)
assert.deepEqual(getTableMergeBoundaryGaps(merges, 'row', 0, [0, 10, 20, 30, 40]), [])

assert.deepEqual(
	expandSelectionToTableMerges(normalizeTableSelection(2, 2, 2, 2), merges),
	{ rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 },
	'selecting part of a merged cell must select the complete merge'
)
assert.equal(tableMergesIntersecting(merges, {
	rowStart: 0, rowEnd: 1, colStart: 2, colEnd: 3,
}).length, 1)

assert.deepEqual(insertTableMergeAxis(merges, 'row', 1, 2), [
	{ row: 3, col: 1, rowspan: 2, colspan: 2 },
])
assert.deepEqual(insertTableMergeAxis(merges, 'col', 2, 1), [
	{ row: 1, col: 1, rowspan: 2, colspan: 3 },
])
assert.deepEqual(removeTableMergeAxis(merges, 'row', 1, 1), [
	{ row: 1, col: 1, rowspan: 1, colspan: 2 },
])
assert.deepEqual(removeTableMergeAxis(merges, 'col', 1, 2), [])

const componentSource = await readFile(
	new URL('../src/components/shapes/VueTableShapeNode.vue', import.meta.url),
	'utf8'
)
const controllerSource = await readFile(
	new URL('../src/editor/interactions/VueEditorController.ts', import.meta.url),
	'utf8'
)
const tableSvgSource = await readFile(
	new URL('../src/editor/vueSvgExport.ts', import.meta.url),
	'utf8'
)
const svgExportSource = await readFile(
	new URL('../packages/editor/src/lib/exports/getSvgJsx.tsx', import.meta.url),
	'utf8'
)
assert.doesNotMatch(componentSource, /vxe-table|VxeTable|VxeColumn|ExtendCellArea/)
assert.match(componentSource, /<table class="vue-table-shape__table"/)
assert.doesNotMatch(componentSource, /cell\.value/)
assert.match(componentSource, /getVueTableCellShapePartial/)
assert.match(componentSource, /onCellDoubleClick/)
assert.match(componentSource, /setEditingShape\(id\)/)
assert.match(componentSource, /VUE_TABLE_TOOLBAR_DRAG_EVENT/)
assert.match(componentSource, /vue-table-shape__drop-preview/)
assert.match(controllerSource, /isVueTableCellFrame/)
assert.match(controllerSource, /editor\.deleteShapes\(\[existingChild\.id\]\)/)
assert.match(tableSvgSource, /strokeWidth: 1\.5/)
assert.match(tableSvgSource, /fill: 'none'/)
assert.match(svgExportSource, /shape\.type === 'vue-table'/)
assert.match(svgExportSource, /getShapeAndDescendantIds\(\[shape\.id\]\)/)
for (const label of ['添加行', '添加列', '删除行', '删除列', '合并单元格', '拆分单元格']) {
	assert.match(componentSource, new RegExp(label))
}

console.log('Verified custom table selection, merge normalization, and row/column transforms.')
