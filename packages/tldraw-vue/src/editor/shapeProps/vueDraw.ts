import { DefaultColorStyle, DefaultDashStyle, DefaultFillStyle, DefaultSizeStyle } from '@tldraw/tlschema'
import { T } from '@tldraw/validate'
import { baseProps, type BaseProps } from './base'
import { extendShapeProperties } from './registry'
import { vueDrawDefaultProps } from '../defaults/vueDraw'

const pointValidator = T.object({ x: T.number, y: T.number })
export type VueDrawProps = BaseProps & typeof vueDrawDefaultProps
export const vueDrawPropertyRegistry = extendShapeProperties(baseProps, {
	points: T.arrayOf(pointValidator),
	color: DefaultColorStyle,
	fill: DefaultFillStyle,
	dash: DefaultDashStyle,
	size: DefaultSizeStyle,
})
