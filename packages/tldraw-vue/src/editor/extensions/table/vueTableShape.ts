import {
	BaseBoxShapeUtil,
	resizeBox,
	type TLResizeInfo,
	type TLShape,
} from '@tldraw/editor'
import { type TLBaseShape } from '@tldraw/tlschema'
import { T } from '@tldraw/validate'
import { createVueTableSvg } from '../../vueSvgExport'

export const VUE_TABLE_MIN_WIDTH = 160
export const VUE_TABLE_MIN_HEIGHT = 96
export const VUE_TABLE_ROW_ID_FIELD = '_rowId'

export interface VueTableColumn {
	field: string
	title: string
	width: number
}

export type VueTableRow = Record<string, string>

export type VueTableShape = TLBaseShape<
	'vue-table',
	{
		w: number
		h: number
		columns: VueTableColumn[]
		rows: VueTableRow[]
		rowHeight: number
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

	static override props = {
		w: T.number,
		h: T.number,
		columns: T.arrayOf(tableColumnValidator),
		rows: T.arrayOf(tableRowValidator),
		rowHeight: T.number,
		showBorder: T.boolean.optional(),
	}

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
		const rowHeight = clampRowHeight(next.props.rowHeight)

		if (
			approximatelyEqual(w, next.props.w) &&
			approximatelyEqual(h, next.props.h) &&
			approximatelyEqual(rowHeight, next.props.rowHeight)
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
		w: 480,
		h: 260,
		columns: createDefaultVueTableColumns(),
		rows: createDefaultVueTableRows(),
		rowHeight: 32,
		showBorder: true,
	}
}

export function createDefaultVueTableColumns(): VueTableColumn[] {
	return [
		{ field: 'item', title: 'Item', width: 150 },
		{ field: 'status', title: 'Status', width: 110 },
		{ field: 'date', title: 'Date', width: 120 },
		{ field: 'amount', title: 'Amount', width: 100 },
	]
}

export function createDefaultVueTableRows(): VueTableRow[] {
	return [
		createTableRow(1, 'Order 1001', 'Pending', '07-28', '128.00'),
		createTableRow(2, 'Order 1002', 'Ready', '07-28', '256.00'),
		createTableRow(3, 'Order 1003', 'Packed', '07-29', '89.50'),
		createTableRow(4, 'Order 1004', 'Review', '07-29', '176.20'),
		createTableRow(5, 'Order 1005', 'Ready', '07-30', '342.00'),
		createTableRow(6, 'Order 1006', 'Pending', '07-30', '64.80'),
		createTableRow(7, 'Order 1007', 'Packed', '07-31', '211.30'),
		createTableRow(8, 'Order 1008', 'Ready', '07-31', '98.00'),
	]
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

function clampRowHeight(rowHeight: number) {
	return Math.min(72, Math.max(22, rowHeight))
}

function approximatelyEqual(a: number, b: number) {
	return Math.abs(a - b) < 0.01
}
