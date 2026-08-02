import { kickoutOccludedShapes, type TLShapePartial, type TLShapeId, type Vec } from '@tldraw/editor'
import { IdleState, VueInteractionState, type VueEditorContext } from './types'
import {
	getTranslatingSnapshot,
	moveShapesToPoint,
	reparentDroppedShapesToFrameLikeParents,
	type TranslatingSnapshot,
} from './TranslatingState'

export class DraggingCreatedShapeState extends VueInteractionState {
	readonly id = 'dragging_created_shape'

	private readonly snapshot: TranslatingSnapshot | null

	constructor(
		context: VueEditorContext,
		private readonly info: {
			creatingMarkId: string
			onComplete?(): void
			originPagePoint: Vec
			pointerId: number
			reparentOnComplete?: boolean
			shapeId: TLShapeId
		}
	) {
		super(context)
		this.snapshot = getTranslatingSnapshot(context.editor)
	}

	override onEnter() {
		if (!this.snapshot) {
			this.transitionTo(new IdleState(this.context))
			return
		}

		this.editor.setCursor({ type: 'move', rotation: 0 })
		this.handleStart()
	}

	override onExit() {
		this.editor.snaps.clearIndicators()
		this.editor.setCursor({ type: 'default', rotation: 0 })
	}

	override onPointerMove(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId || !this.snapshot) return
		this.updateShapes(event)
	}

	override onPointerUp(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId) return
		this.complete(event)
	}

	override onCancel() {
		if (this.snapshot) {
			for (const shape of this.snapshot.movingShapes) {
				const current = this.editor.getShape(shape.id)
				if (!current) continue
				this.editor.getShapeUtil(shape).onTranslateCancel?.(shape, current)
			}
		}

		this.editor.bailToMark(this.info.creatingMarkId)
		this.transitionTo(new IdleState(this.context))
	}

	private handleStart() {
		if (!this.snapshot) return

		const changes: TLShapePartial[] = []
		for (const shape of this.snapshot.movingShapes) {
			const change = this.editor.getShapeUtil(shape).onTranslateStart?.(shape)
			if (change) changes.push(change)
		}

		if (changes.length > 0) this.editor.updateShapes(changes)
		this.editor.setHoveredShape(null)
	}

	private handleEnd() {
		if (!this.snapshot) return

		const changes: TLShapePartial[] = []
		for (const shape of this.snapshot.movingShapes) {
			const current = this.editor.getShape(shape.id)
			if (!current) continue
			const change = this.editor.getShapeUtil(shape).onTranslateEnd?.(shape, current)
			if (change) changes.push(change)
		}

		if (changes.length > 0) this.editor.updateShapes(changes)
	}

	private updateShapes(event: PointerEvent) {
		if (!this.snapshot) return

		moveShapesToPoint({
			accelKey: event.ctrlKey || event.metaKey,
			currentPagePoint: this.context.getPagePoint(event),
			editor: this.editor,
			guides: this.context.getGuides(),
			originPagePoint: this.info.originPagePoint,
			shiftKey: event.shiftKey,
			shouldSnap: this.context.shouldSnap(event),
			snapshot: this.snapshot,
			workspaceBounds: this.context.workspaceBounds,
		})

		const changes: TLShapePartial[] = []
		for (const shape of this.snapshot.movingShapes) {
			const current = this.editor.getShape(shape.id)
			if (!current) continue
			const change = this.editor.getShapeUtil(shape).onTranslate?.(shape, current)
			if (change) changes.push(change)
		}

		if (changes.length > 0) this.editor.updateShapes(changes)
	}

	private complete(event: PointerEvent) {
		if (this.snapshot) {
			this.updateShapes(event)
			this.handleEnd()
			kickoutOccludedShapes(
				this.editor,
				this.snapshot.movingShapes.map((shape) => shape.id)
			)
			if (this.info.reparentOnComplete ?? true) {
				reparentDroppedShapesToFrameLikeParents(this.editor, this.snapshot.movingShapes)
			}
		}

		this.transitionTo(new IdleState(this.context))
		this.info.onComplete?.()
	}
}
