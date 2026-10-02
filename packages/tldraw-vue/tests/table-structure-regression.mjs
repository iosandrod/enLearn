import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
	expandSelectionToTableMerges,
	findTableMerge,
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
assert.doesNotMatch(componentSource, /vxe-table|VxeTable|VxeColumn|ExtendCellArea/)
assert.match(componentSource, /<table class="vue-table-shape__table"/)
for (const label of ['添加行', '添加列', '删除行', '删除列', '合并单元格', '拆分单元格']) {
	assert.match(componentSource, new RegExp(label))
}

console.log('Verified custom table selection, merge normalization, and row/column transforms.')
