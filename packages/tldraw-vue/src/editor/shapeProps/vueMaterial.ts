import { T } from '@tldraw/validate'
import { baseProps, type BaseProps } from './base'
import { extendShapeProperties } from './registry'
import type { PrintDataSourceDetailColumn } from '@/print/types'
export type VueMaterialProps = BaseProps & {
	name: string
	dataSourceField: string
	columns?: PrintDataSourceDetailColumn[]
	headerRowHeight?: number
	bodyRowHeight?: number
	footerRowHeight?: number
	containerList?: boolean
}
export const vueMaterialPropertyRegistry = extendShapeProperties(baseProps, {
	name: T.string,
	dataSourceField: T.string.optional(),
	columns: T.arrayOf(T.jsonValue).optional(),
	bodyRowHeight: T.number.optional(),
	headerRowHeight: T.number.optional(),
	footerRowHeight: T.number.optional(),//
	showFooterAmount: T.boolean.optional(),//
	containerList: T.boolean.optional(),//
})//
