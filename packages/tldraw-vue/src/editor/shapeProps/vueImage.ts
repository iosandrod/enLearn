import { assetIdValidator } from '@tldraw/tlschema'
import { T } from '@tldraw/validate'
import { baseProps, type BaseProps } from './base'
import { extendShapeProperties } from './registry'
import { vueImageDefaultProps } from '../defaults/vueImage'

export type VueImageProps = BaseProps & {
	assetId: typeof vueImageDefaultProps.assetId
	fileId?: string
	src: string
	name: string
	showBorder?: boolean
}

export const vueImagePropertyRegistry = extendShapeProperties(baseProps, {
	assetId: assetIdValidator.nullable(),
	fileId: T.string.optional(),
	src: T.string,
	name: T.string,
	showBorder: T.boolean.optional(),
})
