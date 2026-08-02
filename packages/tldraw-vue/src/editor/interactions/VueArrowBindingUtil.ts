import {
	BindingUtil,
	Vec,
	arrowBindingProps,
	type BindingOnCreateOptions,
	type BindingOnDeleteOptions,
	type BindingOnShapeChangeOptions,
	type BindingOnShapeIsolateOptions,
	type Editor,
	type TLArrowBinding,
	type TLArrowBindingProps,
	type TLShape,
	type TLShapeId,
	type VecLike,
} from '@tldraw/editor'
import type { VueArrowShape } from '../vueDefaultShapes'
import {
	getVueArrowPageTerminalPoint,
	updateVueArrowFromPageTerminals,
} from './vueLineGeometry'

export class VueArrowBindingUtil extends BindingUtil<TLArrowBinding> {
	static override type = 'arrow'
	static override props = arrowBindingProps

	override getDefaultProps(): Partial<TLArrowBindingProps> {
		return {
			isPrecise: false,
			isExact: false,
			normalizedAnchor: { x: 0.5, y: 0.5 },
			snap: 'none',
		}
	}

	override onAfterCreate({ binding }: BindingOnCreateOptions<TLArrowBinding>): void {
		updateBoundVueArrow(this.editor, binding.fromId)
	}

	override onAfterChangeFromShape({ shapeAfter }: BindingOnShapeChangeOptions<TLArrowBinding>): void {
		updateBoundVueArrow(this.editor, shapeAfter.id)
	}

	override onAfterChangeToShape({ binding }: BindingOnShapeChangeOptions<TLArrowBinding>): void {
		updateBoundVueArrow(this.editor, binding.fromId)
	}

	override onBeforeDeleteFromShape({ binding }: BindingOnDeleteOptions<TLArrowBinding>): void {
		if (this.editor.isReplayingHistory()) return
		const arrow = this.editor.getShape<VueArrowShape>(binding.fromId)
		if (!arrow || arrow.type !== 'vue-arrow') return
		updateBoundVueArrow(this.editor, arrow.id)
		removeVueArrowBinding(this.editor, arrow.id, binding.props.terminal)
	}

	override onBeforeDeleteToShape({ binding }: BindingOnDeleteOptions<TLArrowBinding>): void {
		if (this.editor.isReplayingHistory()) return
		const arrow = this.editor.getShape<VueArrowShape>(binding.fromId)
		if (!arrow || arrow.type !== 'vue-arrow') return
		updateBoundVueArrow(this.editor, arrow.id)
		removeVueArrowBinding(this.editor, arrow.id, binding.props.terminal)
	}

	override onBeforeIsolateFromShape({ binding }: BindingOnShapeIsolateOptions<TLArrowBinding>): void {
		if (this.editor.isReplayingHistory()) return
		const arrow = this.editor.getShape<VueArrowShape>(binding.fromId)
		if (!arrow || arrow.type !== 'vue-arrow') return
		const terminalPoint =
			getBoundTerminalPagePoint(this.editor, binding) ?? getFallbackTerminalPoint(arrow, binding)
		const otherTerminal = binding.props.terminal === 'start' ? 'end' : 'start'
		const otherPoint = getVueArrowPageTerminalPoint(arrow, otherTerminal)

		updateVueArrowFromPageTerminals(
			this.editor,
			arrow.id,
			binding.props.terminal === 'start' ? terminalPoint : otherPoint,
			binding.props.terminal === 'end' ? terminalPoint : otherPoint
		)
		removeVueArrowBinding(this.editor, arrow.id, binding.props.terminal)
	}

	override onBeforeIsolateToShape({ binding }: BindingOnShapeIsolateOptions<TLArrowBinding>): void {
		if (this.editor.isReplayingHistory()) return
		const arrow = this.editor.getShape<VueArrowShape>(binding.fromId)
		if (!arrow || arrow.type !== 'vue-arrow') return
		updateBoundVueArrow(this.editor, arrow.id)
		removeVueArrowBinding(this.editor, arrow.id, binding.props.terminal)
	}
}

export function updateBoundVueArrow(editor: Editor, arrowId: TLShapeId) {
	const arrow = editor.getShape<VueArrowShape>(arrowId)
	if (!arrow || arrow.type !== 'vue-arrow') return

	const bindings = getVueArrowBindings(editor, arrow.id)
	const startPoint =
		(bindings.start && getBoundTerminalPagePoint(editor, bindings.start)) ??
		getVueArrowPageTerminalPoint(arrow, 'start')
	const endPoint =
		(bindings.end && getBoundTerminalPagePoint(editor, bindings.end)) ??
		getVueArrowPageTerminalPoint(arrow, 'end')

	updateVueArrowFromPageTerminals(editor, arrow.id, startPoint, endPoint)
}

export function getVueArrowBindings(editor: Editor, arrowId: TLShapeId) {
	const bindings = editor.getBindingsFromShape<TLArrowBinding>(arrowId, 'arrow')
	return {
		start: bindings.find((binding) => binding.props.terminal === 'start'),
		end: bindings.find((binding) => binding.props.terminal === 'end'),
	}
}

export function createOrUpdateVueArrowBinding({
	editor,
	arrowId,
	pagePoint,
	target,
	terminal,
}: {
	editor: Editor
	arrowId: TLShapeId
	pagePoint: VecLike
	target: TLShape
	terminal: 'start' | 'end'
}) {
	const props: TLArrowBindingProps = {
		terminal,
		normalizedAnchor: getNormalizedAnchor(target, pagePoint, editor),
		isExact: false,
		isPrecise: true,
		snap: 'edge',
	}

	const existingMany = editor
		.getBindingsFromShape<TLArrowBinding>(arrowId, 'arrow')
		.filter((binding) => binding.props.terminal === terminal)

	if (existingMany.length > 1) {
		editor.deleteBindings(existingMany.slice(1))
	}

	const existing = existingMany[0]
	if (existing) {
		editor.updateBinding<TLArrowBinding>({
			id: existing.id,
			type: 'arrow',
			fromId: arrowId,
			toId: target.id,
			props,
		})
		return
	}

	editor.createBinding<TLArrowBinding>({
		type: 'arrow',
		fromId: arrowId,
		toId: target.id,
		props,
	})
}

export function removeVueArrowBinding(editor: Editor, arrowId: TLShapeId, terminal: 'start' | 'end') {
	const bindings = editor
		.getBindingsFromShape<TLArrowBinding>(arrowId, 'arrow')
		.filter((binding) => binding.props.terminal === terminal)
	if (bindings.length > 0) {
		editor.deleteBindings(bindings)
	}
}

export function findBindableVueArrowTarget(editor: Editor, arrowId: TLShapeId, pagePoint: VecLike) {
	return editor.getShapeAtPoint(pagePoint, {
		filter: (shape) =>
			shape.id !== arrowId &&
			shape.type !== 'vue-arrow' &&
			shape.type !== 'vue-line' &&
			!editor.isShapeOrAncestorLocked(shape),
		hitInside: true,
		hitLabels: true,
		margin: editor.getHitTestMargin(),
		renderingOnly: true,
	})
}

export function getNormalizedAnchor(target: TLShape, pagePoint: VecLike, editor: Editor) {
	const bounds = editor.getShapePageBounds(target)
	if (!bounds || bounds.w === 0 || bounds.h === 0) return { x: 0.5, y: 0.5 }
	return {
		x: Math.min(1, Math.max(0, (pagePoint.x - bounds.x) / bounds.w)),
		y: Math.min(1, Math.max(0, (pagePoint.y - bounds.y) / bounds.h)),
	}
}

export function getVueArrowTargetEdgePoint(editor: Editor, target: TLShape, pagePoint: VecLike) {
	const bounds = editor.getShapePageBounds(target)
	if (!bounds) return new Vec(pagePoint.x, pagePoint.y)

	const anchor = getNormalizedAnchor(target, pagePoint, editor)
	const targetPoint = new Vec(bounds.x + bounds.w * anchor.x, bounds.y + bounds.h * anchor.y)
	return projectPointToBoundsEdge(targetPoint, bounds.center, bounds)
}

function getBoundTerminalPagePoint(editor: Editor, binding: TLArrowBinding) {
	const target = editor.getShape(binding.toId)
	if (!target) return undefined
	const bounds = editor.getShapePageBounds(target)
	if (!bounds) return undefined

	const anchor = binding.props.isPrecise
		? clampNormalizedAnchor(binding.props.normalizedAnchor)
		: { x: 0.5, y: 0.5 }

	const targetPoint = new Vec(bounds.x + bounds.w * anchor.x, bounds.y + bounds.h * anchor.y)
	if (binding.props.isExact) return targetPoint

	return projectPointToBoundsEdge(targetPoint, bounds.center, bounds)
}

function getFallbackTerminalPoint(arrow: VueArrowShape, binding: TLArrowBinding) {
	return getVueArrowPageTerminalPoint(arrow, binding.props.terminal)
}

function clampNormalizedAnchor(anchor: { x: number; y: number }) {
	return {
		x: Math.min(1, Math.max(0, anchor.x)),
		y: Math.min(1, Math.max(0, anchor.y)),
	}
}

function projectPointToBoundsEdge(point: Vec, center: Vec, bounds: { x: number; y: number; w: number; h: number }) {
	const dx = point.x - center.x
	const dy = point.y - center.y
	if (dx === 0 && dy === 0) return point

	const halfW = bounds.w / 2
	const halfH = bounds.h / 2
	const scale = Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH, 1)
	return new Vec(center.x + dx / scale, center.y + dy / scale)
}
