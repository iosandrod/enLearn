import { BaseBoxShapeUtil } from '@tldraw/editor'
import {
	DefaultColorStyle,
	type TLBaseShape,
	type TLDefaultColorStyle,
} from '@tldraw/tlschema'
import { T } from '@tldraw/validate'
import { createVueQrSvg } from './vueQrSvgExport'
import { baseProps, type BaseProps } from '../../shapeProps/base'
import { extendShapeProperties } from '../../shapeProps/registry'
import { vueQrDefaultProps } from '../../defaults'

export type VueQrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'

export type VueQrShape = TLBaseShape<
	'vue-qr',
	BaseProps & {
		text: string
		color: TLDefaultColorStyle
		background: string
		errorCorrectionLevel: VueQrErrorCorrectionLevel
		margin: number
		showBorder?: boolean
	}
>

declare module '@tldraw/tlschema' {
	interface TLGlobalShapePropsMap {
		'vue-qr': VueQrShape['props']
	}
}

export class VueQrShapeUtil extends BaseBoxShapeUtil<VueQrShape> {
	static override type = 'vue-qr' as const

	static override props = extendShapeProperties(baseProps, {
		text: T.string,
		color: DefaultColorStyle,
		background: T.string,
		errorCorrectionLevel: T.literalEnum('L', 'M', 'Q', 'H'),
		margin: T.number,
		showBorder: T.boolean.optional(),
	}).validators

	override getDefaultProps(): VueQrShape['props'] {
		return {
			...baseProps.defaults,
			...vueQrDefaultProps,
		}
	}

	override component() {
		return null
	}

	override toSvg(shape: VueQrShape) {
		return createVueQrSvg(this.editor, shape)
	}

	override canEdit() {
		return true
	}

	override getIndicatorPath(shape: VueQrShape): Path2D {
		return rectPath(shape.props.w, shape.props.h)
	}

	override isAspectRatioLocked() {
		return true
	}
}

function rectPath(w: number, h: number) {
	const path = new Path2D()
	path.rect(0, 0, w, h)
	return path
}
