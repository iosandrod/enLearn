import { BaseBoxShapeUtil } from '@tldraw/editor'
import type { TLBaseShape } from '@tldraw/tlschema'
import { T } from '@tldraw/validate'
import { createVueBarcodeSvg } from './vueBarcodeSvgExport'

export type VueBarcodeFormat = 'code128' | 'code39' | 'ean13' | 'ean8' | 'upca'

export type VueBarcodeShape = TLBaseShape<
	'vue-barcode',
	{
		w: number
		h: number
		text: string
		format: VueBarcodeFormat
		barColor: string
		background: string
		includeText: boolean
		padding: number
		showBorder?: boolean
	}
>

declare module '@tldraw/tlschema' {
	interface TLGlobalShapePropsMap {
		'vue-barcode': VueBarcodeShape['props']
	}
}

export class VueBarcodeShapeUtil extends BaseBoxShapeUtil<VueBarcodeShape> {
	static override type = 'vue-barcode' as const

	static override props = {
		w: T.number,
		h: T.number,
		text: T.string,
		format: T.literalEnum('code128', 'code39', 'ean13', 'ean8', 'upca'),
		barColor: T.string,
		background: T.string,
		includeText: T.boolean,
		padding: T.number,
		showBorder: T.boolean.optional(),
	}

	override getDefaultProps(): VueBarcodeShape['props'] {
		return {
			w: 240,
			h: 96,
			text: '1234567890',
			format: 'code128',
			barColor: '#000000',
			background: '#ffffff',
			includeText: true,
			padding: 4,
			showBorder: false,
		}
	}

	override component() {
		return null
	}

	override toSvg(shape: VueBarcodeShape) {
		return createVueBarcodeSvg(shape)
	}

	override canEdit() {
		return true
	}

	override getIndicatorPath(shape: VueBarcodeShape): Path2D {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
}
