import { T } from '@tldraw/validate'
import { baseProps, type BaseProps } from './base'
import { extendShapeProperties } from './registry'
export type VueResumeProps = BaseProps & { name: string }
export const vueResumePropertyRegistry = extendShapeProperties(baseProps, { name: T.string })
