import { BaseBoxShapeUtil } from '@tldraw/editor'
import {
	DefaultColorStyle,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
	type TLBaseShape,
	type TLDefaultColorStyle,
	type TLDefaultDashStyle,
	type TLDefaultFillStyle,
	type TLDefaultSizeStyle,
} from '@tldraw/tlschema'
import { T } from '@tldraw/validate'
import type { VueGeoShape } from './interactions/types'
import { createVueBoxSvg } from './vueSvgExport'

export type VueBoxShape = TLBaseShape<
	'vue-box',
	{
		w: number
		h: number
		color: TLDefaultColorStyle
		fill: TLDefaultFillStyle
		dash: TLDefaultDashStyle
		size: TLDefaultSizeStyle
		geo: VueGeoShape
	}
>

declare module '@tldraw/tlschema' {
	interface TLGlobalShapePropsMap {
		'vue-box': VueBoxShape['props']
	}
}

export class VueBoxShapeUtil extends BaseBoxShapeUtil<VueBoxShape> {
	static override type = 'vue-box' as const

	static override props = {
		w: T.number,
		h: T.number,
		color: DefaultColorStyle,
		fill: DefaultFillStyle,
		dash: DefaultDashStyle,
		size: DefaultSizeStyle,
		geo: T.literalEnum(
			'rectangle',
			'ellipse',
			'triangle',
			'diamond',
			'hexagon',
			'oval',
			'rhombus',
			'star',
			'cloud',
			'heart',
			'x-box',
			'check-box',
			'arrow-left',
			'arrow-up',
			'arrow-down',
			'arrow-right'
		),
	}

	override getDefaultProps(): VueBoxShape['props'] {
		return {
			w: 160,
			h: 96,
			color: 'blue',
			fill: 'semi',
			dash: 'draw',
			size: 'm',
			geo: 'rectangle',
		}
	}

	override component() {
		return null
	}

	override toSvg(shape: VueBoxShape) {
		return createVueBoxSvg(this.editor, shape)
	}

	override getIndicatorPath(shape: VueBoxShape): Path2D {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
}
