import { BaseBoxShapeUtil, type SvgExportContext, type TLBaseShape } from '@tldraw/editor'
import { baseProps, type BaseProps } from './shapeProps/base'
import { vueRichTextDefaultProps, vueRichTextPropertyRegistry } from './shapeProps/vueRichText'
import { createVueRichTextSvg } from './vueSvgExport'

export type VueRichTextShape = TLBaseShape<'vue-rich-text', BaseProps & {
	content: string
	color: string
	fontSize: number
	showBorder?: boolean
}>

export class VueRichTextShapeUtil extends BaseBoxShapeUtil<VueRichTextShape> {
	static override type = 'vue-rich-text' as const
	static override props = vueRichTextPropertyRegistry.validators
	override getDefaultProps(): VueRichTextShape['props'] {
		return { ...baseProps.defaults, ...vueRichTextDefaultProps }
	}
	override component() { return null }
	override toSvg(shape: VueRichTextShape, _ctx: SvgExportContext) { return createVueRichTextSvg(shape) }
	override getIndicatorPath(shape: VueRichTextShape): Path2D { const path = new Path2D(); path.rect(0, 0, shape.props.w, shape.props.h); return path }
}
