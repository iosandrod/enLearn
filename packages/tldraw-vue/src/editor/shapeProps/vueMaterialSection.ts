import { T } from '@tldraw/validate'
import { baseProps, type BaseProps } from './base'
import { extendShapeProperties } from './registry'

export type VueMaterialSectionProps = BaseProps & {
	zone: 'pageHeader' | 'tableHeader' | 'tableBody' | 'tableFooter' | 'pageFooter'
	label: string
}

export const vueMaterialSectionPropertyRegistry = extendShapeProperties(baseProps, {
	zone: T.literalEnum('pageHeader', 'tableHeader', 'tableBody', 'tableFooter', 'pageFooter'),
	label: T.string,
})
