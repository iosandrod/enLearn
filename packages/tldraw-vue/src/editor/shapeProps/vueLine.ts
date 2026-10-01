import { DefaultColorStyle, DefaultDashStyle, DefaultSizeStyle } from '@tldraw/tlschema'
import { T } from '@tldraw/validate'
import { baseProps, type BaseProps } from './base'
import { extendShapeProperties } from './registry'
import { vueLineShapeDefaultProps } from '../defaults/vueLine'

const pointValidator = T.object({ x: T.number, y: T.number })
export type VueLineProps = BaseProps & typeof vueLineShapeDefaultProps
export const vueLinePropertyRegistry = extendShapeProperties(baseProps, {
	start: pointValidator,
	end: pointValidator,
	color: DefaultColorStyle,
	dash: DefaultDashStyle,
	size: DefaultSizeStyle,
})
