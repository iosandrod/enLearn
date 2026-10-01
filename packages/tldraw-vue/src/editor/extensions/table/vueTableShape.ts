import {
	BaseBoxShapeUtil,
	resizeBox,
	type TLResizeInfo,
	type TLShape,
} from '@tldraw/editor'
import { type TLBaseShape } from '@tldraw/tlschema'
import { T } from '@tldraw/validate'
import { createVueTableSvg } from '../../vueSvgExport'
import {
	VUE_TABLE_ROW_ID_FIELD,
	clampVueTableRowHeight,
	normalizeVueTableRowHeights,
	type VueTableRowHeightMap,
} from './tableRowHeight'
import { baseProps, type BaseProps } from '../../shapeProps/base'
import { extendShapeProperties } from '../../shapeProps/registry'
import {
	vueTableDefaultColumns,
	vueTableDefaultRowHeight,
	vueTableDefaultRows,
	vueTableDefaultSize,
} from '../../defaults'

export const VUE_TABLE_MIN_WIDTH = 160
export const VUE_TABLE_MIN_HEIGHT = 96
export { VUE_TABLE_ROW_ID_FIELD } from './tableRowHeight'

export interface VueTableColumn {
	field: string
	title: string
	width: number
}

export type VueTableRow = Record<string, string>

export type VueTableShape = TLBaseShape<
	'vue-table',
	BaseProps & {
		columns: VueTableColumn[]
		rows: VueTableRow[]
		rowHeight: number
		rowHeights?: VueTableRowHeightMap
		showBorder?: boolean
	}
>

const tableColumnValidator = T.object<VueTableColumn>({
	field: T.string,
	title: T.string,
	width: T.number,
})

const tableRowValidator = T.dict(T.string, T.string)

declare module '@tldraw/tlschema' {
	interface TLGlobalShapePropsMap {
		'vue-table': VueTableShape['props']
	}
}

export class VueTableShapeUtil extends BaseBoxShapeUtil<VueTableShape> {
	static override type = 'vue-table' as const

	static override props = extendShapeProperties(baseProps, {
		columns: T.arrayOf(tableColumnValidator),
		rows: T.arrayOf(tableRowValidator),
		rowHeight: T.number,
		rowHeights: T.dict(T.string, T.number).optional(),
		showBorder: T.boolean.optional(),
	}).validators

	override getDefaultProps(): VueTableShape['props'] {
		return createDefaultVueTableProps()
	}

	override component() {
		return null
	}

	override toSvg(shape: VueTableShape) {
		return createVueTableSvg(shape)
	}

	override onBeforeUpdate(_prev: VueTableShape, next: VueTableShape) {
		const w = Math.max(VUE_TABLE_MIN_WIDTH, next.props.w)
		const h = Math.max(VUE_TABLE_MIN_HEIGHT, next.props.h)
		const rowHeight = clampVueTableRowHeight(next.props.rowHeight)
		const rowHeights = normalizeVueTableRowHeights(next.props.rows, next.props.rowHeights)

		if (
			approximatelyEqual(w, next.props.w) &&
			approximatelyEqual(h, next.props.h) &&
			approximatelyEqual(rowHeight, next.props.rowHeight) &&
			rowHeightMapsEqual(rowHeights, next.props.rowHeights)
		) {
			return
		}

		return {
			...next,
			props: {
				...next.props,
				w,
				h,
				rowHeight,
				rowHeights,
			},
		}
	}

	override onResize(shape: VueTableShape, info: TLResizeInfo<VueTableShape>) {
		return resizeBox(shape, info, {
			minWidth: VUE_TABLE_MIN_WIDTH,
			minHeight: VUE_TABLE_MIN_HEIGHT,
		})
	}

	override getIndicatorPath(shape: VueTableShape): Path2D {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
}

export function createDefaultVueTableProps(): VueTableShape['props'] {
	return {
		...baseProps.defaults,
		...vueTableDefaultSize,
		columns: createDefaultVueTableColumns(),
		rows: createDefaultVueTableRows(),
		rowHeight: vueTableDefaultRowHeight,
		rowHeights: {},
		showBorder: true,
	}
}

export function createDefaultVueTableColumns(): VueTableColumn[] {
	return vueTableDefaultColumns.map((column) => ({ ...column }))
}

export function createDefaultVueTableRows(): VueTableRow[] {
	return vueTableDefaultRows.map(([item, status, date, amount], index) =>
		createTableRow(index + 1, item, status, date, amount),
	)
}

export function isVueTableShape(shape: TLShape | undefined): shape is VueTableShape {
	return shape?.type === 'vue-table'
}

function createTableRow(
	index: number,
	item: string,
	status: string,
	date: string,
	amount: string
): VueTableRow {
	return {
		[VUE_TABLE_ROW_ID_FIELD]: `row-${index}`,
		item,
		status,
		date,
		amount,
	}
}

function approximatelyEqual(a: number, b: number) {
	return Math.abs(a - b) < 0.01
}

function rowHeightMapsEqual(a: VueTableRowHeightMap, b?: VueTableRowHeightMap) {
	const bMap = b ?? {}
	const aKeys = Object.keys(a)
	const bKeys = Object.keys(bMap)
	return (
		aKeys.length === bKeys.length &&
		aKeys.every(key => approximatelyEqual(a[key] ?? 0, bMap[key] ?? 0))
	)
}
