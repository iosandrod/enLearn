export const VUE_TABLE_MIN_ROW_HEIGHT = 22
export const VUE_TABLE_ROW_ID_FIELD = '_rowId'

export type VueTableRowHeightMap = Record<string, number>

export interface VueTableRowLayout {
	index: number
	rowId: string
	y: number
	height: number
	bottom: number
}

export function getVueTableRowId(row: Record<string, string>, index: number) {
	return row[VUE_TABLE_ROW_ID_FIELD] || `row-${index + 1}`
}

export function clampVueTableRowHeight(height: number) {
	return Math.max(
		VUE_TABLE_MIN_ROW_HEIGHT,
		Number.isFinite(height) ? height : VUE_TABLE_MIN_ROW_HEIGHT,
	)
}

export function getVueTableRowHeight(
	row: Record<string, string>,
	index: number,
	defaultHeight: number,
	rowHeights?: VueTableRowHeightMap
) {
	const storedHeight = rowHeights?.[getVueTableRowId(row, index)]
	return clampVueTableRowHeight(
		typeof storedHeight === 'number' && Number.isFinite(storedHeight)
			? storedHeight
			: defaultHeight
	)
}

export function normalizeVueTableRowHeights(
	rows: Array<Record<string, string>>,
	rowHeights?: VueTableRowHeightMap
) {
	const normalized: VueTableRowHeightMap = {}
	if (!rowHeights) return normalized
	rows.forEach((row, index) => {
		const rowId = getVueTableRowId(row, index)
		const storedHeight = rowHeights[rowId]
		if (typeof storedHeight === 'number' && Number.isFinite(storedHeight)) {
			normalized[rowId] = clampVueTableRowHeight(storedHeight)
		}
	})
	return normalized
}

export function getVueTableRowLayouts(
	rows: Array<Record<string, string>>,
	defaultHeight: number,
	rowHeights?: VueTableRowHeightMap,
	availableHeight = Number.POSITIVE_INFINITY
) {
	const heights = rows.map((row, index) => getVueTableRowHeight(row, index, defaultHeight, rowHeights))
	const total = heights.reduce((sum, height) => sum + height, 0)
	if (Number.isFinite(availableHeight) && total < availableHeight) {
		const autoIndexes = rows.map((row, index) => {
			const rowId = getVueTableRowId(row, index)
			// A row-height entry is created by manual resize. Keep it fixed even
			// when the user resized it back to the default or minimum height.
			return rowHeights && Object.prototype.hasOwnProperty.call(rowHeights, rowId)
				? -1 : index
		}).filter(index => index >= 0)
		const autoTotal = autoIndexes.reduce((sum, index) => sum + heights[index], 0)
		const extra = availableHeight - total
		let allocated = 0
		autoIndexes.forEach((index, position) => {
			const addition = position === autoIndexes.length - 1
				? extra - allocated
				: extra * (heights[index] / Math.max(1, autoTotal))
			heights[index] += addition
			allocated += addition
		})
	}
	let y = 0
	return rows.map((row, index): VueTableRowLayout => {
		const height = heights[index]
		const layout = {
			index,
			rowId: getVueTableRowId(row, index),
			y,
			height,
			bottom: y + height,
		}
		y = layout.bottom
		return layout
	})
}
