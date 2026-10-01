import { DefaultColorStyle, DefaultDashStyle, DefaultFillStyle, DefaultSizeStyle } from '@tldraw/tlschema'
import { T } from '@tldraw/validate'
import { baseProps, type BaseProps } from './base'
import { extendShapeProperties } from './registry'
import { vueArrowShapeDefaultProps } from '../defaults/vueArrow'

const pointValidator = T.object({ x: T.number, y: T.number })
export type VueArrowProps = BaseProps & typeof vueArrowShapeDefaultProps
export const vueArrowPropertyRegistry = extendShapeProperties(baseProps, {
	start: pointValidator,
	end: pointValidator,
	color: DefaultColorStyle,
	fill: DefaultFillStyle,
	dash: DefaultDashStyle,
	size: DefaultSizeStyle,
})
