import { Vec, type TLCamera } from '@tldraw/editor'
import { IdleState, VueInteractionState, type VueEditorContext } from './types'

export class PanningState extends VueInteractionState {
	readonly id = 'panning'

	private readonly startCamera: TLCamera
	private readonly startScreenPoint: Vec

	constructor(
		context: VueEditorContext,
		private readonly info: {
			button?: number
			originScreenPoint: Vec
			pointerId: number
		}
	) {
		super(context)
		this.startCamera = context.getCamera()
		this.startScreenPoint = info.originScreenPoint
	}

	override onEnter() {
		this.editor.setCursor({ type: 'grabbing', rotation: 0 })
	}

	override onExit() {
		this.editor.setCursor({ type: 'default', rotation: 0 })
	}

	override onPointerMove(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId) return
		this.preventNativeRightButtonGesture(event)

		const screenPoint = this.context.getCanvasPoint(event)
		const dx = screenPoint.x - this.startScreenPoint.x
		const dy = screenPoint.y - this.startScreenPoint.y

		this.context.setCamera({
			x: this.startCamera.x + dx / this.startCamera.z,
			y: this.startCamera.y + dy / this.startCamera.z,
			z: this.startCamera.z,
		})
	}

	override onPointerUp(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId) return
		this.preventNativeRightButtonGesture(event)
		this.transitionTo(new IdleState(this.context))
	}

	private preventNativeRightButtonGesture(event: PointerEvent) {
		if (this.info.button !== 2) return
		event.preventDefault()
		event.stopPropagation()
	}
}
