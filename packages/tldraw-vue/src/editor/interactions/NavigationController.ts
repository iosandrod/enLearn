import type { Editor } from '@tldraw/editor'

export type NavigationActionId =
	| 'zoom-in'
	| 'zoom-out'
	| 'zoom-to-100'
	| 'zoom-to-fit'
	| 'zoom-to-selection'

export interface NavigationActionSnapshot {
	id: NavigationActionId
	label: string
	disabled: boolean
}

const ACTION_GROUPS: readonly (readonly NavigationActionId[])[] = [
	['zoom-in', 'zoom-out'],
	['zoom-to-100', 'zoom-to-fit', 'zoom-to-selection'],
]

const ACTION_LABELS: Record<NavigationActionId, string> = {
	'zoom-in': 'Zoom in',
	'zoom-out': 'Zoom out',
	'zoom-to-100': 'Zoom to 100%',
	'zoom-to-fit': 'Zoom to fit',
	'zoom-to-selection': 'Zoom to selection',
}

export class NavigationController {
	constructor(private readonly editor: Editor) {}

	getZoomValue() {
		return Math.floor(this.editor.getZoomLevel() * 100)
	}

	getZoomLabel() {
		return `${this.getZoomValue()}%`
	}

	getActionGroups(): NavigationActionSnapshot[][] {
		return ACTION_GROUPS.map((group) =>
			group.map((id) => ({
				id,
				label: ACTION_LABELS[id],
				disabled: this.getIsActionDisabled(id),
			}))
		)
	}

	runAction(actionId: NavigationActionId) {
		if (this.getIsActionDisabled(actionId)) return

		switch (actionId) {
			case 'zoom-in':
				this.zoomIn()
				break
			case 'zoom-out':
				this.zoomOut()
				break
			case 'zoom-to-100':
				this.zoomTo100()
				break
			case 'zoom-to-fit':
				this.zoomToFit()
				break
			case 'zoom-to-selection':
				this.zoomToSelection()
				break
		}
	}

	zoomIn() {
		this.editor.zoomIn(undefined, this.getAnimatedCameraOptions())
	}

	zoomOut() {
		this.editor.zoomOut(undefined, this.getAnimatedCameraOptions())
	}

	zoomTo100() {
		this.editor.resetZoom(undefined, this.getAnimatedCameraOptions())
	}

	zoomToFit() {
		if (!this.hasShapesOnPage()) return
		this.editor.zoomToFit(this.getAnimatedCameraOptions())
	}

	zoomToSelection() {
		if (!this.hasSelection()) return
		this.editor.zoomToSelection(this.getAnimatedCameraOptions())
	}

	private getAnimatedCameraOptions() {
		return {
			animation: {
				duration: this.editor.options.animationMediumMs,
			},
		}
	}

	private getIsActionDisabled(actionId: NavigationActionId) {
		switch (actionId) {
			case 'zoom-to-100':
				return Math.abs(this.editor.getZoomLevel() - 1) < 0.001
			case 'zoom-to-fit':
				return !this.hasShapesOnPage()
			case 'zoom-to-selection':
				return !this.hasSelection()
			default:
				return false
		}
	}

	private hasShapesOnPage() {
		return this.editor.getCurrentPageShapeIds().size > 0
	}

	private hasSelection() {
		return this.editor.getSelectedShapeIds().length > 0
	}
}
