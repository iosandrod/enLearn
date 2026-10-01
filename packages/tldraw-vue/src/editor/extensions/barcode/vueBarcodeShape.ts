import { BaseBoxShapeUtil } from '@tldraw/editor'
import type { TLBaseShape } from '@tldraw/tlschema'
import { createVueBarcodeSvg } from './vueBarcodeSvgExport'
import { baseProps, type BaseProps } from '../../shapeProps/base'
import { vueBarcodePropertyRegistry } from '../../shapeProps/vueBarcode'
import { vueBarcodeDefaultProps } from '../../defaults'

export type VueBarcodeFormat = 'code128' | 'code39' | 'ean13' | 'ean8' | 'upca'

export type VueBarcodeShape = TLBaseShape<
	'vue-barcode',
	BaseProps & {
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

	static override props = vueBarcodePropertyRegistry.validators

	override getDefaultProps(): VueBarcodeShape['props'] {
		return {
			...baseProps.defaults,
			...vueBarcodeDefaultProps,
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
