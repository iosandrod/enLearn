import {
	DefaultColorStyle,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
	Vec,
	createShapeId,
	type TLShapeId,
} from '@tldraw/editor'
import type { TLShape } from '@tldraw/tlschema'
import type { VueArrowShape, VueLineShape } from '../vueDefaultShapes'
import { IdleState, VueInteractionState, type VueEditorContext } from './types'
import {
	createOrUpdateVueArrowBinding,
	findBindableVueArrowTarget,
} from './VueArrowBindingUtil'
import { getLineGeometry } from './vueLineGeometry'

export type LineShapeKind = 'line' | 'arrow'

export class CreatingLineShapeState extends VueInteractionState {
	readonly id = 'creating_line_shape'

	private readonly historyMarkId: string
	private readonly shapeId: TLShapeId
	private readonly startPagePoint: Vec
	private readonly startBindingTarget: TLShape | undefined
	private hasDragged = false

	constructor(
		context: VueEditorContext,
		private readonly info: {
			kind: LineShapeKind
			originPagePoint: Vec
			pointerId: number
		}
	) {
		super(context)
		this.shapeId = createShapeId()
		this.startPagePoint = info.originPagePoint
		this.startBindingTarget =
			info.kind === 'arrow' ? this.findBindableShapeAt(info.originPagePoint) : undefined
		this.historyMarkId = context.editor.markHistoryStoppingPoint(`creating:${this.shapeId}`)
	}

	override onEnter() {
		this.createDefaultShape()
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
		if (this.info.kind === 'arrow') {
			this.createArrowBindings(this.context.workspaceBounds.clampPoint(this.context.getPagePoint(event)))
		}
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

	private createDefaultShape() {
		const end = this.context.workspaceBounds.clampPoint({
			x: this.startPagePoint.x + 120,
			y: this.startPagePoint.y,
		})
		const geometry = getLineGeometry(this.startPagePoint, end)

		if (this.info.kind === 'arrow') {
			this.editor.createShapes<VueArrowShape>([
				{
					id: this.shapeId,
					type: 'vue-arrow',
					x: geometry.x,
					y: geometry.y,
					props: {
						...geometry.props,
						color: this.editor.getStyleForNextShape(DefaultColorStyle),
						fill: this.editor.getStyleForNextShape(DefaultFillStyle),
						dash: this.editor.getStyleForNextShape(DefaultDashStyle),
						size: this.editor.getStyleForNextShape(DefaultSizeStyle),
					},
				},
			])
		} else {
			this.editor.createShapes<VueLineShape>([
				{
					id: this.shapeId,
					type: 'vue-line',
					x: geometry.x,
					y: geometry.y,
					props: {
						...geometry.props,
						color: this.editor.getStyleForNextShape(DefaultColorStyle),
						dash: this.editor.getStyleForNextShape(DefaultDashStyle),
						size: this.editor.getStyleForNextShape(DefaultSizeStyle),
					},
				},
			])
		}
	}

	private updateShape(endPagePoint: Vec) {
		const geometry = getLineGeometry(this.startPagePoint, endPagePoint)
		this.editor.updateShape({
			id: this.shapeId,
			type: this.info.kind === 'arrow' ? 'vue-arrow' : 'vue-line',
			x: geometry.x,
			y: geometry.y,
			props: geometry.props,
		})
	}

	private createArrowBindings(endPagePoint: Vec) {
		const startTarget = this.startBindingTarget

		if (startTarget) {
			createOrUpdateVueArrowBinding({
				editor: this.editor,
				arrowId: this.shapeId,
				pagePoint: this.startPagePoint,
				target: startTarget,
				terminal: 'start',
			})
		}

		const endTarget = this.findBindableShapeAt(endPagePoint)
		if (endTarget) {
			createOrUpdateVueArrowBinding({
				editor: this.editor,
				arrowId: this.shapeId,
				pagePoint: endPagePoint,
				target: endTarget,
				terminal: 'end',
			})
		}
	}

	private findBindableShapeAt(pagePoint: Vec) {
		return findBindableVueArrowTarget(this.editor, this.shapeId, pagePoint)
	}
}
