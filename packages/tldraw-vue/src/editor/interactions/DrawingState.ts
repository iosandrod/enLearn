import {
	DefaultColorStyle,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
	Vec,
	createShapeId,
	type TLShapeId,
} from '@tldraw/editor'
import type { VueDrawShape, VuePoint } from '../vueDefaultShapes'
import { IdleState, VueInteractionState, type VueEditorContext } from './types'

export class DrawingState extends VueInteractionState {
	readonly id = 'drawing'

	private readonly historyMarkId: string
	private readonly shapeId: TLShapeId
	private readonly pagePoints: Vec[] = []

	constructor(
		context: VueEditorContext,
		private readonly info: {
			originPagePoint: Vec
			pointerId: number
		}
	) {
		super(context)
		this.shapeId = createShapeId()
		this.historyMarkId = context.editor.markHistoryStoppingPoint(`drawing:${this.shapeId}`)
		this.pagePoints.push(info.originPagePoint)
	}

	override onEnter() {
		this.editor.createShapes<VueDrawShape>([
			{
				id: this.shapeId,
				type: 'vue-draw',
				x: this.info.originPagePoint.x,
				y: this.info.originPagePoint.y,
				props: {
					w: 1,
					h: 1,
					points: [{ x: 0, y: 0 }],
					color: this.editor.getStyleForNextShape(DefaultColorStyle),
					fill: this.editor.getStyleForNextShape(DefaultFillStyle),
					dash: this.editor.getStyleForNextShape(DefaultDashStyle),
					size: this.editor.getStyleForNextShape(DefaultSizeStyle),
				},
			},
		])
		this.context.setSelectedShapes([this.shapeId])
	}

	override onPointerMove(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId) return
		const point = this.context.workspaceBounds.clampPoint(this.context.getPagePoint(event))
		const last = this.pagePoints[this.pagePoints.length - 1]
		if (last && Vec.Dist(last, point) < 1 / this.context.getCamera().z) return
		this.pagePoints.push(point)
		this.updateShape()
	}

	override onPointerUp(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId) return
		const point = this.context.workspaceBounds.clampPoint(this.context.getPagePoint(event))
		this.pagePoints.push(point)
		this.updateShape()
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

	private updateShape() {
		const minX = Math.min(...this.pagePoints.map((point) => point.x))
		const minY = Math.min(...this.pagePoints.map((point) => point.y))
		const maxX = Math.max(...this.pagePoints.map((point) => point.x))
		const maxY = Math.max(...this.pagePoints.map((point) => point.y))
		const rect = this.context.workspaceBounds.clampRect(
			{
				x: minX,
				y: minY,
				w: Math.max(1, maxX - minX),
				h: Math.max(1, maxY - minY),
			},
			1,
			1
		)
		const points: VuePoint[] = this.pagePoints.map((point) => ({
			x: point.x - rect.x,
			y: point.y - rect.y,
		}))

		this.editor.updateShape<VueDrawShape>({
			id: this.shapeId,
			type: 'vue-draw',
			x: rect.x,
			y: rect.y,
			props: {
				w: rect.w,
				h: rect.h,
				points,
			},
		})
	}
}
