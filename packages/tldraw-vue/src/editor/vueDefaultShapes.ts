import { BaseBoxShapeUtil, type SvgExportContext } from '@tldraw/editor'
import {
	DefaultColorStyle,
	DefaultFontStyle,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
	assetIdValidator,
	type TLAssetId,
	type TLBaseShape,
	type TLDefaultColorStyle,
	type TLDefaultFontStyle,
	type TLDefaultDashStyle,
	type TLDefaultFillStyle,
	type TLDefaultSizeStyle,
} from '@tldraw/tlschema'
import { T } from '@tldraw/validate'
import {
	createVueArrowSvg,
	createVueDrawSvg,
	createVueImageSvg,
	createVueLineSvg,
	createVueTextSvg,
} from './vueSvgExport'
import { baseProps, type BaseProps } from './shapeProps/base'
import { extendShapeProperties } from './shapeProps/registry'
import {
	vueArrowShapeDefaultSize,
	vueArrowShapeDefaultProps,
	vueDrawDefaultProps,
	vueDrawDefaultSize,
	vueImageDefaultProps,
	vueLineShapeDefaultSize,
	vueLineShapeDefaultProps,
	vueTextDefaultProps,
} from './defaults'

export interface VuePoint {
	x: number
	y: number
}

const pointValidator = T.object<VuePoint>({
	x: T.number,
	y: T.number,
})

export type VueTextShape = TLBaseShape<
	'vue-text',
	BaseProps & {
		text: string
		color: TLDefaultColorStyle
		font: TLDefaultFontStyle
		size: TLDefaultSizeStyle
		autoSize?: boolean
		showBorder?: boolean
	}
>

export type VueImageShape = TLBaseShape<
	'vue-image',
	BaseProps & {
		assetId: TLAssetId | null
		fileId?: string
		src: string
		name: string
		showBorder?: boolean
	}
>

export type VueLineShape = TLBaseShape<
	'vue-line',
	BaseProps & {
		start: VuePoint
		end: VuePoint
		color: TLDefaultColorStyle
		dash: TLDefaultDashStyle
		size: TLDefaultSizeStyle
	}
>

export type VueArrowShape = TLBaseShape<
	'vue-arrow',
	BaseProps & {
		start: VuePoint
		end: VuePoint
		color: TLDefaultColorStyle
		fill: TLDefaultFillStyle
		dash: TLDefaultDashStyle
		size: TLDefaultSizeStyle
	}
>

export type VueDrawShape = TLBaseShape<
	'vue-draw',
	BaseProps & {
		points: VuePoint[]
		color: TLDefaultColorStyle
		fill: TLDefaultFillStyle
		dash: TLDefaultDashStyle
		size: TLDefaultSizeStyle
	}
>

declare module '@tldraw/tlschema' {
	interface TLGlobalShapePropsMap {
		'vue-text': VueTextShape['props']
		'vue-image': VueImageShape['props']
		'vue-line': VueLineShape['props']
		'vue-arrow': VueArrowShape['props']
		'vue-draw': VueDrawShape['props']
	}
}

export class VueTextShapeUtil extends BaseBoxShapeUtil<VueTextShape> {
	static override type = 'vue-text' as const

	static override props = extendShapeProperties(baseProps, {
		text: T.string,
		color: DefaultColorStyle,
		font: DefaultFontStyle,
		size: DefaultSizeStyle,
		autoSize: T.boolean.optional(),
		showBorder: T.boolean.optional(),
	}).validators

	override getDefaultProps(): VueTextShape['props'] {
		return {
			...baseProps.defaults,
			...vueTextDefaultProps,
		}
	}

	override component() {
		return null
	}

	override toSvg(shape: VueTextShape) {
		return createVueTextSvg(this.editor, shape)
	}

	override canEdit() {
		return true
	}

	override getIndicatorPath(shape: VueTextShape): Path2D {
		return rectPath(shape.props.w, shape.props.h)
	}
}

export class VueImageShapeUtil extends BaseBoxShapeUtil<VueImageShape> {
	static override type = 'vue-image' as const

	static override props = extendShapeProperties(baseProps, {
		assetId: assetIdValidator.nullable(),
		fileId: T.string.optional(),
		src: T.string,
		name: T.string,
		showBorder: T.boolean.optional(),
	}).validators

	override getDefaultProps(): VueImageShape['props'] {
		return {
			...baseProps.defaults,
			...vueImageDefaultProps,
		}
	}

	override component() {
		return null
	}

	override toSvg(shape: VueImageShape, ctx: SvgExportContext) {
		return createVueImageSvg(this.editor, shape, ctx)
	}

	override getIndicatorPath(shape: VueImageShape): Path2D {
		return rectPath(shape.props.w, shape.props.h)
	}
}

export class VueLineShapeUtil extends BaseBoxShapeUtil<VueLineShape> {
	static override type = 'vue-line' as const

	static override props = extendShapeProperties(baseProps, {
		start: pointValidator,
		end: pointValidator,
		color: DefaultColorStyle,
		dash: DefaultDashStyle,
		size: DefaultSizeStyle,
	}).validators

	override getDefaultProps(): VueLineShape['props'] {
		return {
			...baseProps.defaults,
			...vueLineShapeDefaultSize,
			...vueLineShapeDefaultProps,
		}
	}

	override component() {
		return null
	}

	override toSvg(shape: VueLineShape) {
		return createVueLineSvg(this.editor, shape)
	}

	override getIndicatorPath(shape: VueLineShape): Path2D {
		return linePath(shape.props.start, shape.props.end)
	}
}

export class VueArrowShapeUtil extends BaseBoxShapeUtil<VueArrowShape> {
	static override type = 'vue-arrow' as const

	static override props = extendShapeProperties(baseProps, {
		start: pointValidator,
		end: pointValidator,
		color: DefaultColorStyle,
		fill: DefaultFillStyle,
		dash: DefaultDashStyle,
		size: DefaultSizeStyle,
	}).validators

	override getDefaultProps(): VueArrowShape['props'] {
		return {
			...baseProps.defaults,
			...vueArrowShapeDefaultSize,
			...vueArrowShapeDefaultProps,
		}
	}

	override component() {
		return null
	}

	override toSvg(shape: VueArrowShape) {
		return createVueArrowSvg(this.editor, shape)
	}

	override getIndicatorPath(shape: VueArrowShape): Path2D {
		return linePath(shape.props.start, shape.props.end)
	}
}

export class VueDrawShapeUtil extends BaseBoxShapeUtil<VueDrawShape> {
	static override type = 'vue-draw' as const

	static override props = extendShapeProperties(baseProps, {
		points: T.arrayOf(pointValidator),
		color: DefaultColorStyle,
		fill: DefaultFillStyle,
		dash: DefaultDashStyle,
		size: DefaultSizeStyle,
	}).validators

	override getDefaultProps(): VueDrawShape['props'] {
		return {
			...baseProps.defaults,
			...vueDrawDefaultSize,
			...vueDrawDefaultProps,
		}
	}

	override component() {
		return null
	}

	override toSvg(shape: VueDrawShape) {
		return createVueDrawSvg(this.editor, shape)
	}

	override getIndicatorPath(shape: VueDrawShape): Path2D {
		const path = new Path2D()
		const first = shape.props.points[0]
		if (!first) return path
		path.moveTo(first.x, first.y)
		for (const point of shape.props.points.slice(1)) {
			path.lineTo(point.x, point.y)
		}
		return path
	}
}

function rectPath(w: number, h: number) {
	const path = new Path2D()
	path.rect(0, 0, w, h)
	return path
}

function linePath(start: VuePoint, end: VuePoint) {
	const path = new Path2D()
	path.moveTo(start.x, start.y)
	path.lineTo(end.x, end.y)
	return path
}
