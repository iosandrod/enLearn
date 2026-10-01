import { T } from '@tldraw/validate'
import { baseProps, type BaseProps } from './base'
import { extendShapeProperties } from './registry'

const columnValidator = T.object({ field: T.string, title: T.string, width: T.number })
const rowValidator = T.dict(T.string, T.string)
export type VueTableProps = BaseProps & {
	columns: Array<{ field: string; title: string; width: number }>
	rows: Array<Record<string, string>>
	rowHeight: number
	rowHeights?: Record<string, number>
	showBorder?: boolean
}
export const vueTablePropertyRegistry = extendShapeProperties(baseProps, {
	columns: T.arrayOf(columnValidator),
	rows: T.arrayOf(rowValidator),
	rowHeight: T.number,
	rowHeights: T.dict(T.string, T.number).optional(),
	showBorder: T.boolean.optional(),
})
