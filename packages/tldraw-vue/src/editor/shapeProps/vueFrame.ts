import { T } from '@tldraw/validate'
import { baseProps, type BaseProps } from './base'
import { extendShapeProperties } from './registry'
import { vueFrameDefaultProps } from '../defaults/vueFrame'

export type VueFrameProps = BaseProps & typeof vueFrameDefaultProps
export const vueFramePropertyRegistry = extendShapeProperties(baseProps, {
	name: T.string,
	showBorder: T.boolean.optional(),
})
