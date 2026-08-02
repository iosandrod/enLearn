import {
	DefaultColorStyle,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
	Vec,
	createShapeId,
	type TLShapeId,
} from '@tldraw/editor'
import type { VueBoxShape } from '../vueBoxShape'
import { IdleState, VueInteractionState, type VueEditorContext } from './types'

export class CreatingBoxState extends VueInteractionState {
	readonly id = 'creating_box'

	private readonly historyMarkId: string
	private readonly shapeId: TLShapeId
	private readonly startPagePoint: Vec

	constructor(
		context: VueEditorContext,
		private readonly info: {
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
			w: 32,
			h: 32,
		})

		this.editor.createShapes<VueBoxShape>([
			{
				id: this.shapeId,
				type: 'vue-box',
				x: rect.x,
				y: rect.y,
				props: {
					w: rect.w,
					h: rect.h,
					color: this.editor.getStyleForNextShape(DefaultColorStyle),
					fill: this.editor.getStyleForNextShape(DefaultFillStyle),
					dash: this.editor.getStyleForNextShape(DefaultDashStyle),
					size: this.editor.getStyleForNextShape(DefaultSizeStyle),
					geo: this.context.getCurrentGeoShape(),
				},
			},
		])
		this.context.setSelectedShapes([this.shapeId])
	}

	override onPointerMove(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId) return
		this.updateShape(event)
	}

	override onPointerUp(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId) return
		this.updateShape(event)
		this.context.setSelectedShapes([this.shapeId])
		if (!this.editor.getInstanceState().isToolLocked) {
			this.context.setActiveTool('select')
		}
		this.transitionTo(new IdleState(this.context))
	}

	override onCancel() {
		this.editor.bailToMark(this.historyMarkId)
		this.transitionTo(new IdleState(this.context))
	}

	private updateShape(event: PointerEvent) {
		const pagePoint = this.context.workspaceBounds.clampPoint(this.context.getPagePoint(event))
		const rect = this.context.workspaceBounds.clampRect({
			x: Math.min(this.startPagePoint.x, pagePoint.x),
			y: Math.min(this.startPagePoint.y, pagePoint.y),
			w: Math.abs(pagePoint.x - this.startPagePoint.x),
			h: Math.abs(pagePoint.y - this.startPagePoint.y),
		})

		this.editor.updateShape<VueBoxShape>({
			id: this.shapeId,
			type: 'vue-box',
			x: rect.x,
			y: rect.y,
			props: { w: rect.w, h: rect.h },
		})
	}
}
