import { T } from '@tldraw/validate'
import { baseProps, type BaseProps } from './base'
import { extendShapeProperties } from './registry'
export type VueMaterialProps = BaseProps & { name: string; dataSourceField: string }
export const vueMaterialPropertyRegistry = extendShapeProperties(baseProps, {
	name: T.string,
	dataSourceField: T.string.optional(),
})
