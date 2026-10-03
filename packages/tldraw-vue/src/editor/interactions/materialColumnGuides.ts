import { isShapeId, type Editor, type TLShape, type TLShapeId } from '@tldraw/editor'
import { getPrintDataSourceDetailColumns } from '@/editor/dataSourceForm'
import type { PrintDataSourceDetailColumn } from '@/print/types'
import { getEditorPrintDataSource } from '@/editor/workspaceDataSource'
import {
	isVueMaterialSectionShape,
	isVueMaterialShape,
	type VueMaterialShape,
} from '@/editor/extensions/material/vueMaterialShape'
import type { WorkspaceGuide } from './guides'

const MIN_COLUMN_WIDTH = 36
const AXIS_EPSILON = 0.0001

/**
 * Returns the column boundaries of the material table that contains the
 * selected shape. These are transient guides used by the translate/resize
 * states; they are intentionally not persisted as workspace guides.
 */
export function getMaterialColumnGuides(editor: Editor): WorkspaceGuide[] {
	const materialIds = new Set<TLShapeId>()
	for (const shape of editor.getSelectedShapes()) {
		const materialId = findMaterialAncestor(editor, shape.id)
		if (materialId) materialIds.add(materialId)
	}

	if (!materialIds.size) return []

	const source = getEditorPrintDataSource(editor).value
	const guides: WorkspaceGuide[] = []
	for (const materialId of materialIds) {
		const material = editor.getShape<VueMaterialShape>(materialId)
		if (!isVueMaterialShape(material)) continue

		const columns = getPrintDataSourceDetailColumns(source, material.props.dataSourceField)
		const leafColumns = flattenLeafColumns(columns)
		if (!leafColumns.length) continue

		const totalWidth = Math.max(1, material.props.w - 2 / (editor.getZoomLevel() || 1))
		const widths = normalizeColumnWidths(leafColumns, totalWidth)
		const pageTransform = editor.getShapePageTransform(material.id)
		if (!pageTransform) continue

		const origin = pageTransform.applyToPoint({ x: 0, y: 0 })
		const xAxis = pageTransform.applyToPoint({ x: 1, y: 0 })
		const dx = xAxis.x - origin.x
		const dy = xAxis.y - origin.y
		const axis = Math.abs(dy) <= AXIS_EPSILON
			? 'x'
			: Math.abs(dx) <= AXIS_EPSILON
				? 'y'
				: null
		if (!axis) continue

		let offset = 0
		for (let index = 0; index <= widths.length; index += 1) {
			const point = pageTransform.applyToPoint({ x: offset, y: 0 })
			guides.push({
				axis,
				id: `material-column:${material.id}:${index}`,
				position: axis === 'x' ? point.x : point.y,
			})
			offset += widths[index] ?? 0
		}
	}

	return dedupeGuides(guides)
}

function findMaterialAncestor(editor: Editor, shapeId: TLShapeId): TLShapeId | null {
	let current: TLShape | undefined = editor.getShape(shapeId)
	if (!current || isVueMaterialShape(current) || isVueMaterialSectionShape(current)) return null

	while (isShapeId(current.parentId)) {
		const parent: TLShape | undefined = editor.getShape(current.parentId)
		if (!parent) return null
		if (isVueMaterialSectionShape(parent)) {
			const material = editor.getShape(parent.parentId)
			return isVueMaterialShape(material) ? material.id : null
		}
		if (isVueMaterialShape(parent)) return null
		current = parent
	}

	return null
}

function flattenLeafColumns(
	columns: readonly PrintDataSourceDetailColumn[],
): PrintDataSourceDetailColumn[] {
	return columns.flatMap((column) =>
		column.children?.length ? flattenLeafColumns(column.children) : column.field ? [column] : []
	)
}

function normalizeColumnWidths(
	columns: readonly Pick<PrintDataSourceDetailColumn, 'width'>[],
	totalWidth: number,
) {
	const minimum = Math.min(MIN_COLUMN_WIDTH, totalWidth / columns.length)
	const rawWidths = columns.map((column) => Math.max(minimum, Number(column.width) || 100))
	const rawTotal = rawWidths.reduce((sum, width) => sum + width, 0)
	if (rawTotal <= totalWidth) {
		const scale = totalWidth / rawTotal
		return fillLastWidth(rawWidths.map((width) => width * scale), totalWidth)
	}

	const available = Math.max(totalWidth - minimum * columns.length, 0)
	const flexibleTotal = rawWidths.reduce((sum, width) => sum + Math.max(0, width - minimum), 0)
	return fillLastWidth(
		rawWidths.map((width) =>
			minimum + (flexibleTotal ? Math.max(0, width - minimum) / flexibleTotal * available : 0)
		),
		totalWidth,
	)
}

function fillLastWidth(widths: number[], totalWidth: number) {
	if (widths.length < 2) return widths.length ? [totalWidth] : []
	widths[widths.length - 1] = totalWidth - widths.slice(0, -1).reduce((sum, width) => sum + width, 0)
	return widths
}

function dedupeGuides(guides: WorkspaceGuide[]) {
	const seen = new Set<string>()
	return guides.filter((guide) => {
		const key = `${guide.axis}:${Math.round(guide.position * 1000)}`
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
}
