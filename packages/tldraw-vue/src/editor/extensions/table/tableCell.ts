import type { Editor, TLShape, TLShapeId, TLShapePartial, VecLike } from '@tldraw/editor'
import type { VueTableShape } from './vueTableShape'
import { getVueTableColumnWidths } from './tableSizing.ts'
import { getVueTableRowLayouts } from './tableRowHeight.ts'
import { findTableMerge, normalizeTableMergeCells } from '../../../components/shapes/tableStructure.ts'

export const VUE_TABLE_CELL_META_KEY = '__vueTableCell'
export const VUE_TABLE_TOOLBAR_DRAG_EVENT = 'vue-table-toolbar-drag'

export interface VueTableToolbarDragDetail {
	phase: 'move' | 'end'
	pagePoint?: VecLike
}

export interface VueTableCellPosition {
	row: number
	col: number
}

export interface VueTableCellInfo extends VueTableCellPosition {
	tableId: TLShapeId
}

export function getVueTableCellInfo(shape: TLShape | undefined): VueTableCellInfo | null {
	if (!shape || !shape.parentId || shape.type === 'vue-table') return null
	const meta = shape.meta as Record<string, unknown> | undefined
	const value = meta?.[VUE_TABLE_CELL_META_KEY]
	if (!value || typeof value !== 'object') return null
	const cell = value as Record<string, unknown>
	const row = Number(cell.row)
	const col = Number(cell.col)
	if (!Number.isInteger(row) || !Number.isInteger(col)) return null
	return { tableId: shape.parentId as TLShapeId, row, col }
}

export function isVueTableCellShape(shape: TLShape | undefined) {
	return getVueTableCellInfo(shape) !== null
}

export function isVueTableCellFrame(shape: TLShape | undefined) {
	return shape?.type === 'vue-frame' && isVueTableCellShape(shape)
}

export function getVueTableCellFrameAncestor(editor: Editor, shape: TLShape | undefined) {
	let parentId = shape?.parentId
	while (parentId) {
		const parent = editor.getShape(parentId)
		if (!parent) return undefined
		if (isVueTableCellFrame(parent)) return parent
		if (parent.type === 'vue-table') return undefined
		parentId = parent.parentId
	}
	return undefined
}

export function isVueTableFrameChild(editor: Editor, shape: TLShape | undefined) {
	return getVueTableCellFrameAncestor(editor, shape) !== undefined
}

export function getVueTableCellRect(
	table: VueTableShape,
	position: VueTableCellPosition,
): { x: number; y: number; w: number; h: number; row: number; col: number } | null {
	const rows = table.props.rows
	const columns = table.props.columns
	if (!rows.length || !columns.length) return null

	const merges = normalizeTableMergeCells(table.props.mergeCells, rows.length, columns.length)
	const merge = findTableMerge(merges, position.row, position.col)
	const row = merge?.row ?? position.row
	const col = merge?.col ?? position.col
	if (row < 0 || row >= rows.length || col < 0 || col >= columns.length) return null

	const rowSpan = merge?.rowspan ?? 1
	const colSpan = merge?.colspan ?? 1
	const widths = getVueTableColumnWidths(columns, table.props.w)
	const rowLayouts = getVueTableRowLayouts(rows, table.props.rowHeight, table.props.rowHeights, table.props.h)
	const firstRow = rowLayouts[row]
	const lastRow = rowLayouts[Math.min(rowLayouts.length - 1, row + rowSpan - 1)]
	if (!firstRow || !lastRow) return null

	const x = widths.slice(0, col).reduce((sum, width) => sum + width, 0)
	const right = widths.slice(0, Math.min(widths.length, col + colSpan)).reduce((sum, width) => sum + width, 0)
	return {
		x,
		y: firstRow.y,
		w: Math.max(1, right - x),
		h: Math.max(1, lastRow.bottom - firstRow.y),
		row,
		col,
	}
}

export function getVueTableCellAtPoint(table: VueTableShape, point: VecLike) {
	const tablePoint = { x: point.x - table.x, y: point.y - table.y }
	if (tablePoint.x < 0 || tablePoint.y < 0 || tablePoint.x > table.props.w || tablePoint.y > table.props.h) {
		return null
	}

	const widths = getVueTableColumnWidths(table.props.columns, table.props.w)
	const rowLayouts = getVueTableRowLayouts(table.props.rows, table.props.rowHeight, table.props.rowHeights, table.props.h)
	let col = -1
	let x = 0
	for (let index = 0; index < widths.length; index += 1) {
		const next = x + widths[index]
		if (tablePoint.x >= x && tablePoint.x <= next) {
			col = index
			break
		}
		x = next
	}
	const row = rowLayouts.findIndex(layout => tablePoint.y >= layout.y && tablePoint.y <= layout.bottom)
	if (row < 0 || col < 0) return null
	return getVueTableCellRect(table, { row, col })
}

export function getVueTableCellMeta(position: VueTableCellPosition) {
	return { [VUE_TABLE_CELL_META_KEY]: { row: position.row, col: position.col } }
}

export function getVueTableCellShapePartial(
	shape: TLShape,
	table: VueTableShape,
	position: VueTableCellPosition,
): TLShapePartial | null {
	const rect = getVueTableCellRect(table, position)
	if (!rect) return null
	const shapeProps = shape.props as Record<string, unknown>
	const nextProps: Record<string, unknown> = {}
	const currentWidth = finitePositiveNumber(shapeProps.w, rect.w)
	const currentHeight = finitePositiveNumber(shapeProps.h, rect.h)
	const scaleX = rect.w / currentWidth
	const scaleY = rect.h / currentHeight
	if ('w' in shapeProps) nextProps.w = rect.w
	if ('h' in shapeProps) nextProps.h = rect.h

	// Vector shapes store their geometry in local coordinates. Resize those
	// coordinates along with the bounding box so the whole component fills the
	// cell instead of leaving its original line or drawing at the old size.
	if ((shape.type === 'vue-line' || shape.type === 'vue-arrow') &&
		isPoint(shapeProps.start) && isPoint(shapeProps.end)) {
		nextProps.start = scalePoint(shapeProps.start, scaleX, scaleY)
		nextProps.end = scalePoint(shapeProps.end, scaleX, scaleY)
	}
	if (shape.type === 'vue-draw' && Array.isArray(shapeProps.points)) {
		nextProps.points = shapeProps.points
			.filter(isPoint)
			.map(point => scalePoint(point, scaleX, scaleY))
	}
	return {
		id: shape.id,
		type: shape.type,
		x: rect.x,
		y: rect.y,
		rotation: 0,
		...(Object.keys(nextProps).length ? { props: nextProps } : {}),
		meta: { ...(shape.meta as Record<string, unknown> | undefined), ...getVueTableCellMeta(rect) },
	} as TLShapePartial
}

function finitePositiveNumber(value: unknown, fallback: number) {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function isPoint(value: unknown): value is { x: number; y: number } {
	return Boolean(value && typeof value === 'object' &&
		typeof (value as { x?: unknown }).x === 'number' &&
		typeof (value as { y?: unknown }).y === 'number')
}

function scalePoint(point: { x: number; y: number }, scaleX: number, scaleY: number) {
	return { x: point.x * scaleX, y: point.y * scaleY }
}
