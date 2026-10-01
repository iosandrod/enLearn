import assert from 'node:assert/strict'
import {
	cloneTableMergeCells,
	getZoomAdjustedResizeValue,
} from '../src/components/shapes/tableResize.ts'
import {
	getVueTableRowHeight,
	getVueTableRowId,
	getVueTableRowLayouts,
	normalizeVueTableRowHeights,
} from '../src/editor/extensions/table/tableRowHeight.ts'

assert.equal(getZoomAdjustedResizeValue(100, 120, 1, 24), 120)
assert.equal(getZoomAdjustedResizeValue(100, 120, 0.5, 24), 140)
assert.equal(getZoomAdjustedResizeValue(100, 120, 2, 24), 110)
assert.equal(getZoomAdjustedResizeValue(32, 5, 1, 22, 72), 22)
assert.equal(getZoomAdjustedResizeValue(32, 200, 1, 22, 72), 72)
assert.equal(getZoomAdjustedResizeValue(100, 120, 0, 24), 120)

const currentWidth = 100
const initialGuidePosition = 250
const resizedWidth = getZoomAdjustedResizeValue(currentWidth, 120, 0.5, 24)
assert.equal(resizedWidth, 140)
assert.equal(
	initialGuidePosition + resizedWidth - currentWidth,
	290,
	'the resize guide and committed width must use the same zoom-adjusted delta'
)

const sourceMerges = [
	{ row: 0, col: 1, rowspan: 2, colspan: 3, extra: 'ignored' },
	{ row: 4, col: 0, rowspan: 1, colspan: 2 },
]
const mergeSnapshot = cloneTableMergeCells(sourceMerges)
assert.deepEqual(mergeSnapshot, [
	{ row: 0, col: 1, rowspan: 2, colspan: 3 },
	{ row: 4, col: 0, rowspan: 1, colspan: 2 },
])
sourceMerges[0].rowspan = 9
assert.equal(mergeSnapshot[0].rowspan, 2, 'resize merge snapshots must not alias VXE state')
assert.deepEqual(cloneTableMergeCells([{ row: -1, col: 0, rowspan: 1, colspan: 1 }]), [])

const rows = [{ _rowId: 'first', value: 'A' }, { _rowId: 'second', value: 'B' }]
const rowHeights = { first: 48 }
assert.equal(getVueTableRowHeight(rows[0], 0, 32, rowHeights), 48)
assert.equal(getVueTableRowHeight(rows[1], 1, 32, rowHeights), 32)
assert.equal(getVueTableRowId({ value: 'legacy' }, 2), 'row-3')
assert.deepEqual(normalizeVueTableRowHeights(rows, { first: 90, second: 18, stale: 40 }), {
	first: 72,
	second: 22,
})
assert.deepEqual(getVueTableRowLayouts(rows, 32, rowHeights), [
	{ index: 0, rowId: 'first', y: 0, height: 48, bottom: 48 },
	{ index: 1, rowId: 'second', y: 48, height: 32, bottom: 80 },
])

console.log('Verified zoom-aware table resizing, independent row heights, and merge snapshots.')
