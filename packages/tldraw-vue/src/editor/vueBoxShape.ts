import { BaseBoxShapeUtil } from '@tldraw/editor'
import type { TLBaseShape } from '@tldraw/tlschema'
import {
	vueBoxPropertyRegistry,
	vueBoxShapeMigrations,
	type VueBoxProps,
} from './shapeProps/vueBox'
import { getVueBoxPath } from './vueBoxGeometry'
import { createVueBoxSvg } from './vueSvgExport'
import { vueBoxDefaultProps } from './defaults'

export type VueBoxShape = TLBaseShape<'vue-box', VueBoxProps>

declare module '@tldraw/tlschema' {
	interface TLGlobalShapePropsMap {
		'vue-box': VueBoxShape['props']
	}
}

export class VueBoxShapeUtil extends BaseBoxShapeUtil<VueBoxShape> {
	static override type = 'vue-box' as const
	static override migrations = vueBoxShapeMigrations

	static override props = vueBoxPropertyRegistry.validators

	override getDefaultProps(): VueBoxShape['props'] {
		return { ...vueBoxPropertyRegistry.defaults, ...vueBoxDefaultProps }
	}

	override component() {
		return null
	}

	override toSvg(shape: VueBoxShape) {
		return createVueBoxSvg(this.editor, shape)
	}

	override getIndicatorPath(shape: VueBoxShape): Path2D {
		return new Path2D(
			getVueBoxPath(shape.props.geo, shape.props.w, shape.props.h, shape.props.borderRadius)
		)
	}
}
