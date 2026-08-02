import {
	BaseBoxShapeUtil,
	Group2d,
	Rectangle2d,
	Vec,
	type Editor,
	type TLShape,
	type TLShapeId,
} from '@tldraw/editor'
import { type TLBaseShape } from '@tldraw/tlschema'
import { T } from '@tldraw/validate'
import { createVueFrameSvg } from '../../vueSvgExport'

export type VueFrameShape = TLBaseShape<
	'vue-frame',
	{
		w: number
		h: number
		name: string
		showBorder?: boolean
	}
>

declare module '@tldraw/tlschema' {
	interface TLGlobalShapePropsMap {
		'vue-frame': VueFrameShape['props']
	}
}

export class VueFrameShapeUtil extends BaseBoxShapeUtil<VueFrameShape> {
	static override type = 'vue-frame' as const

	static override props = {
		w: T.number,
		h: T.number,
		name: T.string,
		showBorder: T.boolean.optional(),
	}

	override getDefaultProps(): VueFrameShape['props'] {
		return {
			w: 320,
			h: 180,
			name: 'Frame',
			showBorder: false,
		}
	}

	override component() {
		return null
	}

	override toSvg(shape: VueFrameShape) {
		return createVueFrameSvg(shape)
	}

	override getGeometry(shape: VueFrameShape) {
		return new Group2d({
			children: [
				new Rectangle2d({
					width: shape.props.w,
					height: shape.props.h,
					isFilled: false,
				}),
			],
		})
	}

	override isFrameLike() {
		return true
	}

	override providesBackgroundForChildren() {
		return true
	}

	override canReceiveNewChildrenOfType(shape: VueFrameShape, type: TLShape['type']) {
		return !shape.isLocked && type !== 'vue-frame'
	}

	override canRemoveChildrenOfType() {
		return false
	}

	override getClipPath(shape: VueFrameShape) {
		return [
			new Vec(0, 0),
			new Vec(shape.props.w, 0),
			new Vec(shape.props.w, shape.props.h),
			new Vec(0, shape.props.h),
		]
	}

	override shouldClipChild() {
		return true
	}

	override getIndicatorPath(shape: VueFrameShape): Path2D {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
}

export function getEnclosedVueFrameShapeIds(editor: Editor, frame: TLShape) {
	const frameBounds = editor.getShapePageBounds(frame)
	if (!frameBounds) return []

	const frameAncestorIds = new Set(editor.getShapeAncestors(frame).map((shape: TLShape) => shape.id))
	const enclosedShapeIds: TLShapeId[] = []

	for (const siblingShapeId of editor.getSortedChildIdsForParent(frame.parentId)) {
		const siblingShape = editor.getShape(siblingShapeId)
		if (!siblingShape) continue
		if (siblingShape.id === frame.id) continue
		if (siblingShape.isLocked) continue
		if (frameAncestorIds.has(siblingShape.id)) continue

		const siblingBounds = editor.getShapePageBounds(siblingShape)
		if (!siblingBounds) continue
		if (frameBounds.contains(siblingBounds)) enclosedShapeIds.push(siblingShape.id)
	}

	return enclosedShapeIds
}
