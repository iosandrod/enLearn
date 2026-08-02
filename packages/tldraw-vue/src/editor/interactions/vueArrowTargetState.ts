import {
	Vec,
	atom,
	type Atom,
	type Editor,
	type TLArrowBinding,
	type TLShape,
	type TLShapeId,
	type VecLike,
	WeakCache,
} from '@tldraw/editor'
import type { VueArrowShape } from '../vueDefaultShapes'
import {
	findBindableVueArrowTarget,
	getNormalizedAnchor,
	getVueArrowBindings,
	getVueArrowTargetEdgePoint,
} from './VueArrowBindingUtil'

export interface VueArrowTargetState {
	arrowId: TLShapeId
	target: TLShape
	terminal: 'start' | 'end'
	handlesInPageSpace: {
		top: { point: VecLike; isEnabled: boolean }
		bottom: { point: VecLike; isEnabled: boolean }
		left: { point: VecLike; isEnabled: boolean }
		right: { point: VecLike; isEnabled: boolean }
	}
	isExact: boolean
	isPrecise: boolean
	centerInPageSpace: VecLike
	anchorInPageSpace: VecLike
	terminalInPageSpace: VecLike
	normalizedAnchor: VecLike
	snap: 'none' | 'edge'
	targetBounds: { x: number; y: number; w: number; h: number }
	currentBinding: TLArrowBinding | undefined
	oppositeBinding: TLArrowBinding | undefined
}

const arrowTargetStore = new WeakCache<Editor, Atom<VueArrowTargetState | null>>()

function getVueArrowTargetAtom(editor: Editor) {
	return arrowTargetStore.get(editor, () => atom('vue arrow target', null))
}

export function getVueArrowTargetState(editor: Editor) {
	return getVueArrowTargetAtom(editor).get()
}

export function clearVueArrowTargetState(editor: Editor) {
	getVueArrowTargetAtom(editor).set(null)
}

export function updateVueArrowTargetState({
	editor,
	arrow,
	terminal,
	pointInPageSpace,
}: {
	editor: Editor
	arrow: VueArrowShape
	terminal: 'start' | 'end'
	pointInPageSpace: VecLike
}) {
	const target = findBindableVueArrowTarget(editor, arrow.id, pointInPageSpace)
	if (!target) {
		clearVueArrowTargetState(editor)
		return null
	}

	const targetBounds = editor.getShapePageBounds(target)
	if (!targetBounds || targetBounds.w === 0 || targetBounds.h === 0) {
		clearVueArrowTargetState(editor)
		return null
	}

	const normalizedAnchor = getNormalizedAnchor(target, pointInPageSpace, editor)
	const anchorInPageSpace = new Vec(
		targetBounds.x + targetBounds.w * normalizedAnchor.x,
		targetBounds.y + targetBounds.h * normalizedAnchor.y
	)
	const terminalInPageSpace = getVueArrowTargetEdgePoint(editor, target, pointInPageSpace)
	const centerInPageSpace = new Vec(targetBounds.x + targetBounds.w / 2, targetBounds.y + targetBounds.h / 2)
	const minHandleDistance = 8 / editor.getZoomLevel()
	const handlesInPageSpace = {
		top: {
			point: new Vec(targetBounds.x + targetBounds.w / 2, targetBounds.y),
			isEnabled: targetBounds.h / 2 > minHandleDistance,
		},
		bottom: {
			point: new Vec(targetBounds.x + targetBounds.w / 2, targetBounds.y + targetBounds.h),
			isEnabled: targetBounds.h / 2 > minHandleDistance,
		},
		left: {
			point: new Vec(targetBounds.x, targetBounds.y + targetBounds.h / 2),
			isEnabled: targetBounds.w / 2 > minHandleDistance,
		},
		right: {
			point: new Vec(targetBounds.x + targetBounds.w, targetBounds.y + targetBounds.h / 2),
			isEnabled: targetBounds.w / 2 > minHandleDistance,
		},
	}
	const bindings = getVueArrowBindings(editor, arrow.id)
	const currentBinding = bindings[terminal]
	const oppositeBinding = bindings[terminal === 'start' ? 'end' : 'start']

	const result: VueArrowTargetState = {
		arrowId: arrow.id,
		target,
		terminal,
		handlesInPageSpace,
		isExact: false,
		isPrecise: true,
		centerInPageSpace,
		anchorInPageSpace,
		terminalInPageSpace,
		normalizedAnchor,
		snap: 'edge',
		targetBounds: {
			x: targetBounds.x,
			y: targetBounds.y,
			w: targetBounds.w,
			h: targetBounds.h,
		},
		currentBinding,
		oppositeBinding,
	}

	getVueArrowTargetAtom(editor).set(result)
	return result
}
