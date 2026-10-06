import assert from 'node:assert/strict'
import { getZoomAdjustedResizeValue } from '../src/components/shapes/tableResize.ts'
import {
	getVueTableRowHeight,
	getVueTableRowId,
	getVueTableRowLayouts,
	normalizeVueTableRowHeights,
} from '../src/editor/extensions/table/tableRowHeight.ts'
import {
	getVueTableColumnContentWidth,
	getVueTableColumnWidths,
} from '../src/editor/extensions/table/tableSizing.ts'
import {
	getVueTableCellAtPoint,
	getVueTableCellRect,
	getVueTableCellMeta,
	getVueTableCellShapePartial,
} from '../src/editor/extensions/table/tableCell.ts'

assert.equal(getZoomAdjustedResizeValue(100, 120, 1, 24), 120)
assert.equal(getZoomAdjustedResizeValue(100, 120, 0.5, 24), 140)
assert.equal(getZoomAdjustedResizeValue(100, 120, 2, 24), 110)
assert.equal(getZoomAdjustedResizeValue(32, 5, 1, 22, 72), 22)
assert.equal(getZoomAdjustedResizeValue(32, 200, 1, 22), 200)
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

const rows = [{ _rowId: 'first', value: 'A' }, { _rowId: 'second', value: 'B' }]
const rowHeights = { first: 48 }
assert.equal(getVueTableRowHeight(rows[0], 0, 32, rowHeights), 48)
assert.equal(getVueTableRowHeight(rows[1], 1, 32, rowHeights), 32)
assert.equal(getVueTableRowId({ value: 'legacy' }, 2), 'row-3')
assert.deepEqual(normalizeVueTableRowHeights(rows, { first: 90, second: 18, stale: 40 }), {
	first: 90,
	second: 22,
})
assert.deepEqual(getVueTableRowLayouts(rows, 32, rowHeights), [
	{ index: 0, rowId: 'first', y: 0, height: 48, bottom: 48 },
	{ index: 1, rowId: 'second', y: 48, height: 32, bottom: 80 },
])

const columns = [
	{ field: 'item', title: 'Item', width: 100, widthMode: 'auto' },
	{ field: 'status', title: 'Status', width: 80, widthMode: 'fixed' },
]
assert.deepEqual(getVueTableColumnWidths(columns, 300), [220, 80],
	'auto columns must absorb free width while fixed columns remain unchanged')
assert.deepEqual(getVueTableColumnWidths([
		{ field: 'manual', title: 'Manual', width: 24, widthMode: 'fixed' },
		{ field: 'auto', title: 'Auto', width: 100, widthMode: 'auto' },
	], 300), [24, 276],
	'a column manually resized to the minimum width must remain fixed')
assert.equal(getVueTableColumnContentWidth(columns), 180,
	'content width must use raw column widths when deciding whether to expand the shape')
assert.deepEqual(getVueTableRowLayouts(rows, 32, rowHeights, 140).map(row => row.height), [48, 92],
	'auto rows must absorb free height while an explicitly sized row remains fixed')
assert.deepEqual(getVueTableRowLayouts(rows, 32, { first: 22 }, 100).map(row => row.height), [22, 78],
	'a row manually resized to the minimum height must remain fixed')

const cellTable = {
	x: 10,
	y: 20,
	props: {
		w: 200,
		h: 100,
		columns: [
			{ field: 'a', title: 'A', width: 100, widthMode: 'fixed' },
			{ field: 'b', title: 'B', width: 100, widthMode: 'fixed' },
		],
		rows: [{ _rowId: 'r1' }, { _rowId: 'r2' }],
		rowHeight: 30,
		rowHeights: {},
		mergeCells: [],
	},
}
assert.deepEqual(getVueTableCellRect(cellTable, { row: 0, col: 1 }), {
	x: 100, y: 0, w: 100, h: 50, row: 0, col: 1,
})
assert.deepEqual(getVueTableCellAtPoint(cellTable, { x: 160, y: 71 }), {
	x: 100, y: 50, w: 100, h: 50, row: 1, col: 1,
})
assert.deepEqual(getVueTableCellMeta({ row: 1, col: 1 }), { __vueTableCell: { row: 1, col: 1 } })
assert.deepEqual(
	getVueTableCellShapePartial({
		id: 'shape:line', type: 'vue-line', x: 0, y: 0, rotation: 0, parentId: 'page:page',
		meta: {}, props: { w: 100, h: 20, start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
	}, cellTable, { row: 0, col: 0 }),
	{
		id: 'shape:line', type: 'vue-line', x: 0, y: 0, rotation: 0,
		props: { w: 100, h: 50, start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
		meta: { __vueTableCell: { row: 0, col: 0 } },
	},
	'line geometry must follow the cell-sized bounding box'
)

console.log('Verified zoom-aware table resizing and independent row heights.')
