export function getZoomAdjustedResizeValue(
	currentValue: number,
	measuredValue: number,
	zoom: number,
	min: number,
	max = Number.POSITIVE_INFINITY
) {
	const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
	const nextValue = currentValue + (measuredValue - currentValue) / safeZoom
	return Math.min(max, Math.max(min, Math.round(nextValue)))
}

export interface TableMergeCell {
	row: number
	col: number
	rowspan: number
	colspan: number
}

export function cloneTableMergeCells(value: unknown): TableMergeCell[] {
	if (!Array.isArray(value)) return []
	return value.flatMap(item => {
		if (!item || typeof item !== 'object') return []
		const merge = item as Partial<TableMergeCell>
		const row = Number(merge.row)
		const col = Number(merge.col)
		const rowspan = Number(merge.rowspan)
		const colspan = Number(merge.colspan)
		if (
			!Number.isInteger(row) ||
			!Number.isInteger(col) ||
			!Number.isInteger(rowspan) ||
			!Number.isInteger(colspan) ||
			row < 0 ||
			col < 0 ||
			rowspan < 1 ||
			colspan < 1
		) {
			return []
		}
		return [{ row, col, rowspan, colspan }]
	})
}
