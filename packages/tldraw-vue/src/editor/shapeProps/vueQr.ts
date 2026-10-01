import { DefaultColorStyle } from '@tldraw/tlschema'
import { T } from '@tldraw/validate'
import { baseProps, type BaseProps } from './base'
import { extendShapeProperties } from './registry'
import { vueQrDefaultProps } from '../defaults/vueQr'

export type VueQrProps = BaseProps & typeof vueQrDefaultProps
export const vueQrPropertyRegistry = extendShapeProperties(baseProps, {
	text: T.string,
	color: DefaultColorStyle,
	background: T.string,
	errorCorrectionLevel: T.literalEnum('L', 'M', 'Q', 'H'),
	margin: T.number,
	showBorder: T.boolean.optional(),
})
