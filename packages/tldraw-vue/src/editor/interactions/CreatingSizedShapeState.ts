import { Vec, createShapeId, type TLShape, type TLShapeId, type TLShapePartial } from '@tldraw/editor'
import type { VueShapeCreateDefinition } from '../vueEditorExtensions'
import { IdleState, VueInteractionState, type VueEditorContext } from './types'

export class CreatingSizedShapeState extends VueInteractionState {
	readonly id = 'creating_sized_shape'

	private readonly historyMarkId: string
	private readonly shapeId: TLShapeId
	private readonly startPagePoint: Vec
	private hasDragged = false

	constructor(
		context: VueEditorContext,
		private readonly info: {
			createDefinition: VueShapeCreateDefinition
			originPagePoint: Vec
			pointerId: number
		}
	) {
		super(context)
		this.shapeId = createShapeId()
		this.startPagePoint = info.originPagePoint
		this.historyMarkId = context.editor.markHistoryStoppingPoint(`creating:${this.shapeId}`)
	}

	override onEnter() {
		const rect = this.context.workspaceBounds.clampRect({
			x: this.startPagePoint.x,
			y: this.startPagePoint.y,
			...this.info.createDefinition.defaultSize,
		})

		this.info.createDefinition.createShape({
			editor: this.editor,
			id: this.shapeId,
			point: this.startPagePoint,
			rect,
			source: 'canvas',
		})

		const shape = this.editor.getShape(this.shapeId)
		if (!shape) {
			this.editor.bailToMark(this.historyMarkId)
			this.transitionTo(new IdleState(this.context))
			return
		}

		this.context.setSelectedShapes([this.shapeId])
	}

	override onPointerMove(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId) return
		const pagePoint = this.context.workspaceBounds.clampPoint(this.context.getPagePoint(event))
		if (Vec.Dist(pagePoint, this.startPagePoint) < 2 / this.context.getCamera().z) return
		this.hasDragged = true
		this.updateShape(pagePoint)
	}

	override onPointerUp(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId) return
		if (this.hasDragged) {
			this.updateShape(this.context.workspaceBounds.clampPoint(this.context.getPagePoint(event)))
		}

		this.context.setSelectedShapes([this.shapeId])
		const shape = this.editor.getShape(this.shapeId)
		if (shape) {
			const rect = this.getShapeRect(shape)
			this.info.createDefinition.onComplete?.({
				editor: this.editor,
				id: this.shapeId,
				point: new Vec(rect.x + rect.w / 2, rect.y + rect.h / 2),
				rect,
				shape,
				source: 'canvas',
			})
		}

		if (!this.editor.getInstanceState().isToolLocked) {
			this.context.setActiveTool('select')
		}
		this.transitionTo(new IdleState(this.context))
	}

	override onCancel() {
		this.editor.bailToMark(this.historyMarkId)
		this.transitionTo(new IdleState(this.context))
	}

	private updateShape(pagePoint: Vec) {
		const rect = this.getRectForPoint(pagePoint)
		const updateShape =
			this.info.createDefinition.updateShape ?? this.updateCreatedShapeBounds.bind(this)

		updateShape({
			editor: this.editor,
			id: this.shapeId,
			point: pagePoint,
			rect,
			source: 'canvas',
		})
	}

	private updateCreatedShapeBounds({
		editor,
		id,
		rect,
	}: Parameters<NonNullable<VueShapeCreateDefinition['updateShape']>>[0]) {
		editor.updateShape({
			id,
			type: this.info.createDefinition.shapeType,
			x: rect.x,
			y: rect.y,
			props: {
				w: rect.w,
				h: rect.h,
			},
		} as TLShapePartial)
	}

	private getRectForPoint(pagePoint: Vec) {
		const w = Math.abs(pagePoint.x - this.startPagePoint.x)
		const h = Math.abs(pagePoint.y - this.startPagePoint.y)
		const side = this.info.createDefinition.isAspectRatioLocked ? Math.max(w, h) : undefined

		return this.context.workspaceBounds.clampRect({
			x: Math.min(this.startPagePoint.x, pagePoint.x),
			y: Math.min(this.startPagePoint.y, pagePoint.y),
			w: side ?? w,
			h: side ?? h,
		})
	}

	private getShapeRect(shape: TLShape) {
		const props = shape.props as { w?: number; h?: number }
		return {
			x: shape.x,
			y: shape.y,
			w: typeof props.w === 'number' ? props.w : this.info.createDefinition.defaultSize.w,
			h: typeof props.h === 'number' ? props.h : this.info.createDefinition.defaultSize.h,
		}
	}
}
