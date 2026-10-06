import type { VueTableColumn } from './vueTableShape'

export const VUE_TABLE_MIN_COLUMN_WIDTH = 24

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
	item: 150,
	status: 110,
	date: 120,
	amount: 100,
}

function finitePositive(value: unknown, fallback: number) {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

export function isVueTableColumnAuto(column: VueTableColumn) {
	if (column.widthMode === 'auto') return true
	if (column.widthMode === 'fixed') return false
	const width = finitePositive(column.width, VUE_TABLE_MIN_COLUMN_WIDTH)
	return width <= VUE_TABLE_MIN_COLUMN_WIDTH || width === DEFAULT_COLUMN_WIDTHS[column.field]
}

/** Fills available space with auto columns while preserving fixed columns. */
export function getVueTableColumnWidths(columns: readonly VueTableColumn[], availableWidth: number) {
	const widths = columns.map((column) => Math.max(VUE_TABLE_MIN_COLUMN_WIDTH, finitePositive(column.width, 100)))
	const target = Math.max(0, availableWidth)
	const total = widths.reduce((sum, width) => sum + width, 0)
	if (total >= target || !columns.length) return widths

	const autoIndexes = columns.map((column, index) => isVueTableColumnAuto(column) ? index : -1).filter(index => index >= 0)
	if (!autoIndexes.length) return widths
	const autoTotal = autoIndexes.reduce((sum, index) => sum + widths[index], 0)
	const extra = target - total
	let allocated = 0
	autoIndexes.forEach((index, position) => {
		const addition = position === autoIndexes.length - 1
			? extra - allocated
			: extra * (widths[index] / Math.max(1, autoTotal))
		widths[index] += addition
		allocated += addition
	})
	return widths
}

export function getVueTableColumnContentWidth(columns: readonly VueTableColumn[]) {
	return columns.reduce((total, column) => total + Math.max(VUE_TABLE_MIN_COLUMN_WIDTH, finitePositive(column.width, 100)), 0)
}
