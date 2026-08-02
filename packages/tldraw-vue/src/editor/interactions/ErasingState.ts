import { type TLShapeId, Vec } from '@tldraw/editor'
import { IdleState, VueInteractionState, type VueEditorContext } from './types'

export class ErasingState extends VueInteractionState {
	readonly id = 'erasing'

	private readonly deletedShapeIds = new Set<TLShapeId>()
	private readonly historyMarkId: string

	constructor(
		context: VueEditorContext,
		private readonly info: {
			originPagePoint: Vec
			pointerId: number
		}
	) {
		super(context)
		this.historyMarkId = context.editor.markHistoryStoppingPoint('erasing')
	}

	override onEnter() {
		this.eraseAt(this.info.originPagePoint)
	}

	override onPointerMove(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId) return
		this.eraseAt(this.context.getPagePoint(event))
	}

	override onPointerUp(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId) return
		this.context.setActiveTool('select')
		this.transitionTo(new IdleState(this.context))
	}

	override onCancel() {
		this.editor.bailToMark(this.historyMarkId)
		this.transitionTo(new IdleState(this.context))
	}

	private eraseAt(pagePoint: Vec) {
		if (!this.context.workspaceBounds.containsPoint(pagePoint)) return
		const shape = this.context.findShapeAt(pagePoint)
		if (!shape || shape.isLocked || this.deletedShapeIds.has(shape.id)) return
		this.deletedShapeIds.add(shape.id)
		this.editor.deleteShapes([shape.id])
	}
}
