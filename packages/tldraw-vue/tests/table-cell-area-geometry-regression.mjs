import assert from 'node:assert/strict'
import { getLocalCellAreaGeometry } from '../src/components/shapes/tableCellAreaGeometry.ts'

for (const zoom of [0.5, 1, 1.5, 2]) {
	const rootLeft = 140
	const rootTop = 90
	const scrollLeft = 18
	const scrollTop = 12
	const rootWidth = 420
	const rootHeight = 260
	const localStart = { left: 42, top: 36, right: 142, bottom: 76 }
	const localEnd = { left: 142, top: 76, right: 262, bottom: 116 }
	const toScreenRect = (rect) => ({
		left: rootLeft + (rect.left - scrollLeft) * zoom,
		top: rootTop + (rect.top - scrollTop) * zoom,
		right: rootLeft + (rect.right - scrollLeft) * zoom,
		bottom: rootTop + (rect.bottom - scrollTop) * zoom,
		width: (rect.right - rect.left) * zoom,
		height: (rect.bottom - rect.top) * zoom,
	})

	const geometry = getLocalCellAreaGeometry({
		rootRect: {
			left: rootLeft,
			top: rootTop,
			right: rootLeft + rootWidth * zoom,
			bottom: rootTop + rootHeight * zoom,
			width: rootWidth * zoom,
			height: rootHeight * zoom,
		},
		rootOffsetWidth: rootWidth,
		rootOffsetHeight: rootHeight,
		rootScrollLeft: scrollLeft,
		rootScrollTop: scrollTop,
		startRect: toScreenRect(localStart),
		endRect: toScreenRect(localEnd),
	})

	assert.deepEqual(geometry, { left: 42, top: 36, width: 220, height: 80 }, `zoom ${zoom}`)
}

assert.equal(
	getLocalCellAreaGeometry({
		rootRect: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
		rootOffsetWidth: 0,
		rootOffsetHeight: 0,
		rootScrollLeft: 0,
		rootScrollTop: 0,
		startRect: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
		endRect: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
	}),
	null
)

console.log('Verified table cell-area alignment at four canvas zoom levels.')
