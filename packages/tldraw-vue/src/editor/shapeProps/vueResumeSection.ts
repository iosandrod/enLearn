import { T } from '@tldraw/validate'
import { baseProps, type BaseProps } from './base'
import { extendShapeProperties } from './registry'

export type VueResumeSectionProps = BaseProps & {
	zone: 'pageHeader' | 'content' | 'pageFooter'
	label: string
}

export const vueResumeSectionPropertyRegistry = extendShapeProperties(baseProps, {
	zone: T.literalEnum('pageHeader', 'content', 'pageFooter'),
	label: T.string,
})
