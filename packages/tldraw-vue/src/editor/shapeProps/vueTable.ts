import { T } from '@tldraw/validate'
import { baseProps, type BaseProps } from './base'
import { extendShapeProperties } from './registry'

const columnValidator = T.object({ field: T.string, title: T.string, width: T.number, widthMode: T.literalEnum('auto', 'fixed').optional() })
const rowValidator = T.dict(T.string, T.string)
export type VueTableProps = BaseProps & {
	columns: Array<{ field: string; title: string; width: number; widthMode?: 'auto' | 'fixed' }>
	rows: Array<Record<string, string>>
	rowHeight: number
	rowHeights?: Record<string, number>
	mergeCells?: Array<{ row: number; col: number; rowspan: number; colspan: number }>
	showBorder?: boolean
}
const mergeCellValidator = T.object({
	row: T.number,
	col: T.number,
	rowspan: T.number,
	colspan: T.number,
})
export const vueTablePropertyRegistry = extendShapeProperties(baseProps, {
	columns: T.arrayOf(columnValidator),
	rows: T.arrayOf(rowValidator),
	rowHeight: T.number,
	rowHeights: T.dict(T.string, T.number).optional(),
	mergeCells: T.arrayOf(mergeCellValidator).optional(),
	showBorder: T.boolean.optional(),
})
