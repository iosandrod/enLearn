import { Vec, type TLShapeId } from '@tldraw/editor'
import type { VueArrowShape } from '../vueDefaultShapes'
import { IdleState, VueInteractionState, type VueEditorContext } from './types'
import {
	createOrUpdateVueArrowBinding,
	findBindableVueArrowTarget,
	removeVueArrowBinding,
} from './VueArrowBindingUtil'
import {
	getVueArrowPageTerminalPoint,
	updateVueArrowFromPageTerminals,
} from './vueLineGeometry'
import {
	clearVueArrowTargetState,
	updateVueArrowTargetState,
} from './vueArrowTargetState'

export type VueArrowTerminal = 'start' | 'end'

export class DraggingArrowHandleState extends VueInteractionState {
	readonly id = 'dragging_arrow_handle'

	private readonly markId: string

	constructor(
		context: VueEditorContext,
		private readonly info: {
			arrowId: TLShapeId
			originPagePoint: Vec
			pointerId: number
			terminal: VueArrowTerminal
		}
	) {
		super(context)
		this.markId = context.editor.markHistoryStoppingPoint('dragging arrow handle')
	}

	override onEnter() {
		const arrow = this.getArrow()
		if (!arrow) {
			this.transitionTo(new IdleState(this.context))
			return
		}

		this.editor.setCursor({ type: 'grabbing', rotation: 0 })
		removeVueArrowBinding(this.editor, arrow.id, this.info.terminal)
		this.editor.select(arrow.id)
	}

	override onExit() {
		clearVueArrowTargetState(this.editor)
		this.editor.snaps.clearIndicators()
		this.editor.setCursor({ type: 'default', rotation: 0 })
	}

	override onPointerMove(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId) return
		const pagePoint = this.context.workspaceBounds.clampPoint(this.context.getPagePoint(event))
		const previewPoint = this.updateTargetState(pagePoint) ?? pagePoint
		this.updateTerminal(previewPoint)
	}

	override onPointerUp(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId) return
		const pagePoint = this.context.workspaceBounds.clampPoint(this.context.getPagePoint(event))
		this.updateTerminal(pagePoint)
		this.updateBinding(pagePoint)
		this.transitionTo(new IdleState(this.context))
	}

	override onCancel() {
		this.editor.bailToMark(this.markId)
		this.transitionTo(new IdleState(this.context))
	}

	private updateTerminal(pagePoint: Vec) {
		const arrow = this.getArrow()
		if (!arrow) return

		const otherTerminal = this.info.terminal === 'start' ? 'end' : 'start'
		const otherPoint = getVueArrowPageTerminalPoint(arrow, otherTerminal)
		updateVueArrowFromPageTerminals(
			this.editor,
			arrow.id,
			this.info.terminal === 'start' ? pagePoint : otherPoint,
			this.info.terminal === 'end' ? pagePoint : otherPoint
		)
	}

	private updateBinding(pagePoint: Vec) {
		const arrow = this.getArrow()
		if (!arrow) return

		const target = findBindableVueArrowTarget(this.editor, arrow.id, pagePoint)
		if (!target) {
			removeVueArrowBinding(this.editor, arrow.id, this.info.terminal)
			return
		}

		createOrUpdateVueArrowBinding({
			editor: this.editor,
			arrowId: arrow.id,
			pagePoint,
			target,
			terminal: this.info.terminal,
		})
	}

	private updateTargetState(pagePoint: Vec) {
		const arrow = this.getArrow()
		if (!arrow) {
			clearVueArrowTargetState(this.editor)
			return undefined
		}

		const targetState = updateVueArrowTargetState({
			editor: this.editor,
			arrow,
			terminal: this.info.terminal,
			pointInPageSpace: pagePoint,
		})
		return targetState
			? new Vec(targetState.terminalInPageSpace.x, targetState.terminalInPageSpace.y)
			: undefined
	}

	private getArrow() {
		const shape = this.editor.getShape<VueArrowShape>(this.info.arrowId)
		return shape?.type === 'vue-arrow' ? shape : undefined
	}
}
