import { T } from '@tldraw/validate'
import { baseProps, type BaseProps } from './base'
import { extendShapeProperties } from './registry'
export type VueMaterialProps = BaseProps & {
	name: string
	dataSourceField: string
	headerRowHeight?: number
	bodyRowHeight?: number
	footerRowHeight?: number
}
export const vueMaterialPropertyRegistry = extendShapeProperties(baseProps, {
	name: T.string,
	dataSourceField: T.string.optional(),
	bodyRowHeight: T.number.optional(),
	headerRowHeight: T.number.optional(),
	footerRowHeight: T.number.optional(),//
	showFooterAmount: T.boolean.optional(),//
})//
