import { T } from '@tldraw/validate'
import { baseProps, type BaseProps } from './base'
import { extendShapeProperties } from './registry'
import { vueBarcodeDefaultProps } from '../defaults/vueBarcode'

export type VueBarcodeProps = BaseProps & typeof vueBarcodeDefaultProps
export const vueBarcodePropertyRegistry = extendShapeProperties(baseProps, {
	text: T.string,
	format: T.literalEnum('code128', 'code39', 'ean13', 'ean8', 'upca'),
	barColor: T.string,
	background: T.string,
	includeText: T.boolean,
	padding: T.number,
	showBorder: T.boolean.optional(),
})
