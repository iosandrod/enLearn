import { T } from '@tldraw/validate'
import { baseProps } from './base'
import { extendShapeProperties } from './registry'

export const vueRichTextPropertyRegistry = extendShapeProperties(baseProps, {
	content: T.string,
	color: T.string,
	fontSize: T.number,
	showBorder: T.boolean.optional(),
})

export const vueRichTextDefaultProps = {
	w: 320,
	h: 160,
	content: '<p>富文本</p>',
	color: 'black',
	fontSize: 14,
	showBorder: false,
} as const
