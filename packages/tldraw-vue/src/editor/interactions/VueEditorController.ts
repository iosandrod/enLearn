import {
	HALF_PI,
	Vec,
	approximately,
	createShapeId,
	isShapeId,
	kickoutOccludedShapes,
	pointInPolygon,
	type Editor,
	type TLCamera,
	type TLParentId,
	type TLShape,
	type TLShapeId,
	type VecLike,
} from '@tldraw/editor'
import { PointingCanvasState, selectOnCanvasPointerUp } from './BrushingState'
import { CreatingLineShapeState } from './CreatingLineShapeState'
import { CreatingSizedShapeState } from './CreatingSizedShapeState'
import { DraggingCreatedShapeState } from './DraggingCreatedShapeState'
import { DraggingArrowHandleState, type VueArrowTerminal } from './DraggingArrowHandleState'
import { ContextMenuState, type ContextMenuActionId, type ContextMenuSnapshot } from './ContextMenuState'
import { CreatingBoxState } from './CreatingBoxState'
import { DrawingState } from './DrawingState'
import { ErasingState } from './ErasingState'
import { PanningState } from './PanningState'
import { ResizingState } from './ResizingState'
import { PointingShapeState } from './TranslatingState'
import type { VueShapeCreateDefinition, VueToolbarToolDefinition } from '../vueEditorExtensions'
import type { WorkspaceGuide } from './guides'
import type { WorkspaceBoundsManager, WorkspaceViewportSize } from './WorkspaceBoundsManager'
import {
	IdleState,
	type CanvasTool,
	type ClientPoint,
	type ResizeHandle,
	type VueGeoShape,
	type VueEditorContext,
	type VueEditorHost,
	type VueInteractionState,
} from './types'

export interface VueEditorControllerOptions {
	editor: Editor
	getCurrentGeoShape(): VueGeoShape
	getCamera(): TLCamera
	getContainer(): HTMLElement | null
	getCurrentPageShapes(): TLShape[]
	getGuides(): readonly WorkspaceGuide[]
	handleShortcut?(event: KeyboardEvent): boolean
	onContextMenuChange(snapshot: ContextMenuSnapshot | null): void
	onToolChange(tool: CanvasTool, geoShape?: VueGeoShape): void
	toolbarTools: readonly VueToolbarToolDefinition[]
	workspaceBounds: WorkspaceBoundsManager
}

const RIGHT_BUTTON_PAN_DISTANCE_SQUARED = 36

export class VueEditorController {
	private activeTool: CanvasTool = 'select'
	private activeToolbarDragPointerId: number | null = null
	private contextMenu: ContextMenuSnapshot | null = null
	private readonly contextMenuState = new ContextMenuState()
	private rightButtonPanCandidate:
		| {
				originScreenPoint: Vec
				pointerId: number
		  }
		| null = null
	private rightButtonPanPointerId: number | null = null
	private suppressNextContextMenu = false
	private readonly context: VueEditorContext
	private state: VueInteractionState
	private readonly onToolbarDragPointerMove = (event: PointerEvent) => {
		if (event.pointerId !== this.activeToolbarDragPointerId) return
		event.preventDefault()
		this.pointerMove(event)
	}
	private readonly onToolbarDragPointerUp = (event: PointerEvent) => {
		if (event.pointerId !== this.activeToolbarDragPointerId) return
		event.preventDefault()
		this.pointerUp(event)
		this.stopForwardingToolbarDragEvents()
	}
	private readonly onToolbarDragPointerCancel = (event: PointerEvent) => {
		if (event.pointerId !== this.activeToolbarDragPointerId) return
		event.preventDefault()
		this.state.onCancel()
		this.stopForwardingToolbarDragEvents()
	}

	constructor(private readonly options: VueEditorControllerOptions) {
		const host: VueEditorHost = {
			editor: options.editor,
			getActiveTool: () => this.activeTool,
			getCurrentGeoShape: () => options.getCurrentGeoShape(),
			getCamera: options.getCamera,
			getContainer: options.getContainer,
			getCurrentPageShapes: options.getCurrentPageShapes,
			getGuides: options.getGuides,
			setActiveTool: (tool, geoShape) => this.setActiveTool(tool, geoShape),
			workspaceBounds: options.workspaceBounds,
		}

		this.context = {
			...host,
			capturePointer: (event) => this.capturePointer(event),
			findShapeAt: (point) => this.getMaterialInteractionShape(this.findShapeAt(point)),
			getCanvasPoint: (event) => this.getCanvasPoint(event),
			getPagePoint: (event) => this.getPagePoint(event),
			getScreenPoint: (event) => this.getScreenPoint(event),
			setCamera: (point) => this.setCamera(point),
			setSelectedShapes: (ids) => this.setSelectedShapes(ids),
			shouldSnap: (event) => this.shouldSnap(event),
			transitionTo: (state) => this.transitionTo(state),
			updateViewport: (center) => this.updateViewport(center),
		}

		this.state = new IdleState(this.context)
	}

	setActiveTool(tool: CanvasTool, geoShape?: VueGeoShape) {
		if (this.activeTool === tool && !geoShape) return
		this.activeTool = tool
		this.options.onToolChange(tool, geoShape)
	}

	isContextMenuOpen() {
		return this.contextMenu !== null
	}

	closeContextMenu() {
		if (!this.contextMenu) return
		this.contextMenu = null
		this.options.onContextMenuChange(null)
	}

	openContextMenu(event: MouseEvent) {
		event.preventDefault()
		event.stopPropagation()
		if (this.suppressNextContextMenu) {
			this.suppressNextContextMenu = false
			return
		}

		this.updateViewport()

		if (this.activeTool !== 'select') {
			this.setActiveTool('select')
		}

		const pagePoint = this.getPagePoint(event)
		this.selectOnContextMenu(pagePoint, event)

		this.contextMenu = this.contextMenuState.buildSnapshot(
			this.options.editor,
			this.getScreenPoint(event),
			pagePoint
		)
		this.options.onContextMenuChange(this.contextMenu)
	}

	doubleClick(event: MouseEvent) {
		const target = event.target as HTMLElement | null
		if (target?.closest('input, textarea, select, [contenteditable="true"]')) return

		this.updateViewport()
		const editor = this.options.editor
		const hitShape = this.findShapeAt(this.getPagePoint(event))
		if (!hitShape || hitShape.type !== 'vue-text') return

		event.preventDefault()
		event.stopPropagation()
		editor.markHistoryStoppingPoint('editing text')
		editor.select(hitShape.id)
		editor.setEditingShape(hitShape.id)
	}

	editSelectedTextShape() {
		const editor = this.options.editor
		const selectedShapes = editor.getSelectedShapes()
		if (selectedShapes.length !== 1) return false
		const shape = selectedShapes[0]
		if (!shape || shape.type !== 'vue-text') return false

		editor.markHistoryStoppingPoint('editing text')
		editor.setEditingShape(shape.id)
		return true
	}

	private selectOnContextMenu(pagePoint: Vec, event: MouseEvent) {
		const editor = this.options.editor
		const selectedShapeIds = editor.getSelectedShapeIds()
		const additiveSelectionKey = event.shiftKey || event.ctrlKey || event.metaKey
		const hitShape = this.getMaterialInteractionShape(this.getContextMenuHitShape(pagePoint))

		if (hitShape) {
			const outermostSelectableShape = editor.getOutermostSelectableShape(hitShape)
			if (
				selectedShapeIds.includes(hitShape.id) ||
				selectedShapeIds.includes(outermostSelectableShape.id) ||
				this.hasSelectedAncestor(hitShape, selectedShapeIds)
			) {
				return
			}

			const shapeToSelect =
				outermostSelectableShape.id === editor.getFocusedGroupId()
					? hitShape
					: outermostSelectableShape

			if (additiveSelectionKey && !event.altKey) {
				editor.markHistoryStoppingPoint('shift selecting shape')
				editor.setSelectedShapes([...selectedShapeIds, shapeToSelect.id])
				return
			}

			editor.markHistoryStoppingPoint('selecting shape')
			editor.select(shapeToSelect.id)
			return
		}

		if (this.isPointInRotatedSelectionBounds(pagePoint)) return

		if (additiveSelectionKey) return

		if (selectedShapeIds.length > 0) {
			editor.markHistoryStoppingPoint('selecting none')
			editor.selectNone()
		}

		const focusedGroupId = editor.getFocusedGroupId()
		if (isShapeId(focusedGroupId)) {
			const groupShape = editor.getShape(focusedGroupId)
			if (groupShape && !editor.isPointInShape(groupShape, pagePoint, { margin: 0, hitInside: true })) {
				editor.setFocusedGroup(null)
			}
		}
	}

	private getContextMenuHitShape(pagePoint: Vec) {
		const editor = this.options.editor
		return (
			editor.getShapeAtPoint(pagePoint, {
				filter: () => true,
				hitInside: false,
				hitLabels: true,
				hitLocked: true,
				margin: editor.getHitTestMargin(),
				renderingOnly: true,
			}) ??
			editor.getSelectedShapeAtPoint(pagePoint) ??
			this.findMaterialInteractionShapeAtPoint(pagePoint)
		)
	}

	private selectOnShapePointerDown(hitShape: TLShape, pagePoint: Vec, event: PointerEvent) {
		const editor = this.options.editor
		const selectedShapeIds = editor.getSelectedShapeIds()
		const selectionBounds = editor.getSelectionRotatedPageBounds()
		const focusedGroupId = editor.getFocusedGroupId()
		const outermostSelectingShape = editor.getOutermostSelectableShape(hitShape)
		const selectedAncestor = editor.findShapeAncestor(outermostSelectingShape, (parent) =>
			selectedShapeIds.includes(parent.id)
		)

		if (
			event.ctrlKey ||
			event.metaKey ||
			editor.getShapeUtil(hitShape).onClick ||
			outermostSelectingShape.id === focusedGroupId ||
			selectedShapeIds.includes(outermostSelectingShape.id) ||
			selectedAncestor ||
			(selectedShapeIds.length > 1 && selectionBounds?.containsPoint(pagePoint))
		) {
			return {
				didSelectOnEnter: false,
				hitShapeForPointerUp: outermostSelectingShape,
			}
		}

		if (event.shiftKey && !event.altKey) {
			editor.markHistoryStoppingPoint('shift selecting shape')
			this.setSelectedShapes([...selectedShapeIds, outermostSelectingShape.id])
			return {
				didSelectOnEnter: true,
				hitShapeForPointerUp: outermostSelectingShape,
			}
		}

		editor.markHistoryStoppingPoint('selecting shape')
		this.setSelectedShapes([outermostSelectingShape.id])
		return {
			didSelectOnEnter: true,
			hitShapeForPointerUp: outermostSelectingShape,
		}
	}

	private hasSelectedAncestor(shape: TLShape, selectedShapeIds: TLShapeId[]) {
		const editor = this.options.editor
		const selectedIdSet = new Set<TLShapeId>(selectedShapeIds)
		let parentId: TLParentId | undefined = shape.parentId
		while (isShapeId(parentId)) {
			if (selectedIdSet.has(parentId)) return true
			parentId = editor.getShape(parentId)?.parentId
		}
		return false
	}

	async runContextMenuAction(actionId: ContextMenuActionId) {
		const snapshot = this.contextMenu
		if (!snapshot) return

		this.closeContextMenu()
		this.resetContainerScroll()
		try {
			await this.contextMenuState.executeAction(this.options.editor, snapshot, actionId)
			this.resetContainerScroll()
		} catch (error) {
			console.error(error)
		}
	}

	async pasteClipboardData(pagePoint: VecLike, clipboardData?: DataTransfer | null) {
		try {
			const didPaste = await this.contextMenuState.pasteClipboardData(
				this.options.editor,
				pagePoint,
				clipboardData
			)
			this.resetContainerScroll()
			return didPaste
		} catch (error) {
			console.error(error)
			return false
		}
	}

	updateViewport(center = false) {
		const container = this.options.getContainer()
		if (!container) return
		this.resetContainerScroll()
		this.options.editor.updateViewportScreenBounds(container, center)
		if (center) {
			this.setCamera(this.options.workspaceBounds.getCenteredCamera(this.getViewportSize()))
		}
	}

	pointerDown(event: PointerEvent) {
		if (event.button !== 0 && event.button !== 1 && event.button !== 2) return

		if (event.button === 2) {
			this.rightButtonPanCandidate = {
				originScreenPoint: this.getCanvasPoint(event),
				pointerId: event.pointerId,
			}
			this.capturePointer(event)
			return
		}

		this.capturePointer(event)
		this.updateViewport()
		if (this.options.editor.getEditingShapeId()) {
			this.options.editor.setEditingShape(null)
		}

		if (
			event.button === 1 ||
			this.activeTool === 'hand' ||
			this.options.editor.inputs.getIsSpacebarPanning() ||
			this.options.editor.inputs.keys.has('Space')
		) {
			this.transitionTo(
				new PanningState(this.context, {
					button: event.button,
					originScreenPoint: this.getCanvasPoint(event),
					pointerId: event.pointerId,
				})
			)
			return
		}

		const pagePoint = this.getPagePoint(event)

		if (this.activeTool !== 'select' && !this.options.workspaceBounds.containsPoint(pagePoint)) {
			return
		}

		if (this.activeTool === 'geo') {
			this.transitionTo(
				new CreatingBoxState(this.context, {
					originPagePoint: pagePoint,
					pointerId: event.pointerId,
				})
			)
			return
		}

		const canvasCreateDefinition = this.getCanvasCreateDefinition(this.activeTool)
		if (canvasCreateDefinition) {
			this.transitionTo(
				new CreatingSizedShapeState(this.context, {
					createDefinition: canvasCreateDefinition,
					originPagePoint: pagePoint,
					pointerId: event.pointerId,
				})
			)
			return
		}

		const lineKind =
			this.activeTool === 'line' ? 'line' : this.activeTool === 'arrow' ? 'arrow' : null
		if (lineKind) {
			this.transitionTo(
				new CreatingLineShapeState(this.context, {
					kind: lineKind,
					originPagePoint: pagePoint,
					pointerId: event.pointerId,
				})
			)
			return
		}

		if (this.activeTool === 'draw') {
			this.transitionTo(
				new DrawingState(this.context, {
					originPagePoint: pagePoint,
					pointerId: event.pointerId,
				})
			)
			return
		}

		if (this.activeTool === 'eraser') {
			this.transitionTo(
				new ErasingState(this.context, {
					originPagePoint: pagePoint,
					pointerId: event.pointerId,
				})
			)
			return
		}

		const hitShape = this.getMaterialInteractionShape(this.findShapeAt(pagePoint))
		if (!hitShape) {
			if (this.isPointInRotatedSelectionBounds(pagePoint)) {
				this.transitionTo(
					new PointingShapeState(this.context, {
						originPagePoint: pagePoint,
						pointerId: event.pointerId,
					})
				)
				return
			}

			if (!this.options.workspaceBounds.containsPoint(pagePoint)) {
				selectOnCanvasPointerUp(this.options.editor, pagePoint, event)
				this.transitionTo(new IdleState(this.context))
				return
			}

			this.transitionTo(
				new PointingCanvasState(this.context, {
					accelKey: event.ctrlKey || event.metaKey,
					originPagePoint: pagePoint,
					pointerId: event.pointerId,
					shiftKey: event.shiftKey,
				})
			)
			return
		}

		const selectionInfo = this.selectOnShapePointerDown(hitShape, pagePoint, event)

		this.transitionTo(
			new PointingShapeState(this.context, {
				didSelectOnEnter: selectionInfo.didSelectOnEnter,
				hitShape,
				hitShapeForPointerUp: selectionInfo.hitShapeForPointerUp,
				originPagePoint: pagePoint,
				pointerId: event.pointerId,
			})
		)
	}

	pointerMove(event: PointerEvent) {
		if (this.maybeStartRightButtonPan(event)) return
		this.state.onPointerMove(event)
	}

	pointerUp(event: PointerEvent) {
		if (this.rightButtonPanCandidate?.pointerId === event.pointerId) {
			this.rightButtonPanCandidate = null
		}
		this.state.onPointerUp(event)
		if (this.rightButtonPanPointerId === event.pointerId) {
			this.rightButtonPanPointerId = null
		}
	}

	isBlockingNativeRightButtonGesture() {
		return this.rightButtonPanPointerId !== null
	}

	toolbarDragStart(tool: CanvasTool, geoShape: VueGeoShape | undefined, event: PointerEvent) {
		if (this.options.editor.getIsReadonly()) return
		const toolDefinition = this.getToolbarToolDefinition(tool, geoShape)
		const createDefinition = toolDefinition?.toolbarCreate
		if (!createDefinition) {
			this.setActiveTool(tool, geoShape)
			return
		}

		event.preventDefault()
		this.closeContextMenu()
		this.updateViewport()
		this.options.getContainer()?.focus({ preventScroll: true })

		const editor = this.options.editor
		if (editor.getEditingShapeId()) {
			editor.setEditingShape(null)
		}

		this.setActiveTool('select')

		const shapeId = createShapeId()
		const creatingMarkId = editor.markHistoryStoppingPoint(`toolbar_create:${shapeId}`)
		const pagePoint = this.context.workspaceBounds.clampPoint(this.getPagePoint(event))
		const rect = this.context.workspaceBounds.clampRect({
			x: pagePoint.x - createDefinition.defaultSize.w / 2,
			y: pagePoint.y - createDefinition.defaultSize.h / 2,
			w: createDefinition.defaultSize.w,
			h: createDefinition.defaultSize.h,
		})

		createDefinition.createShape({
			editor,
			id: shapeId,
			point: pagePoint,
			rect,
			source: 'toolbar',
		})

		const shape = editor.getShape(shapeId)
		if (!shape) {
			editor.bailToMark(creatingMarkId)
			return
		}

		editor.select(shapeId)
		this.transitionTo(
			new DraggingCreatedShapeState(this.context, {
				creatingMarkId,
				originPagePoint: pagePoint,
				pointerId: event.pointerId,
				reparentOnComplete: false,
				shapeId,
				onComplete: () => {
					const currentShape = editor.getShape(shapeId)
					if (!currentShape) return
					this.setActiveTool('select')
					editor.select(shapeId)
					const currentRect = this.getShapeCreateRect(currentShape, createDefinition)
					createDefinition.onComplete?.({
						editor,
						id: shapeId,
						point: new Vec(currentRect.x + currentRect.w / 2, currentRect.y + currentRect.h / 2),
						rect: currentRect,
						shape: currentShape,
						source: 'toolbar',
					})
				},
			})
		)
		this.startForwardingToolbarDragEvents(event.pointerId)
	}

	toolbarDragMove(event: PointerEvent) {
		if (event.pointerId !== this.activeToolbarDragPointerId) return
		event.preventDefault()
		this.pointerMove(event)
	}

	toolbarDragEnd(event: PointerEvent) {
		if (event.pointerId !== this.activeToolbarDragPointerId) return
		event.preventDefault()
		this.pointerUp(event)
		this.stopForwardingToolbarDragEvents()
	}

	toolbarDragCancel(event: PointerEvent) {
		if (event.pointerId !== this.activeToolbarDragPointerId) return
		event.preventDefault()
		this.state.onCancel()
		this.stopForwardingToolbarDragEvents()
	}

	resizeHandlePointerDown(handle: ResizeHandle, event: PointerEvent) {
		this.capturePointer(event)
		this.updateViewport()
		this.transitionTo(
			new ResizingState(this.context, {
				handle,
				originPagePoint: this.getPagePoint(event),
				pointerId: event.pointerId,
			})
		)
	}

	arrowHandlePointerDown(terminal: VueArrowTerminal, event: PointerEvent) {
		if (event.button !== 0) return
		const selectedShapeIds = this.options.editor.getSelectedShapeIds()
		if (selectedShapeIds.length !== 1) return

		const arrow = this.options.editor.getShape(selectedShapeIds[0])
		if (!arrow || arrow.type !== 'vue-arrow') return

		this.capturePointer(event)
		this.updateViewport()
		const originPagePoint = this.getPagePoint(event)
		this.transitionTo(
			new DraggingArrowHandleState(this.context, {
				arrowId: arrow.id,
				originPagePoint,
				pointerId: event.pointerId,
				terminal,
			})
		)
	}

	selectionPointerDown(event: PointerEvent) {
		if (event.button !== 0) return
		if (this.options.editor.getSelectedShapeIds().length === 0) return

		this.capturePointer(event)
		this.updateViewport()
		const pagePoint = this.getPagePoint(event)
		const hitShape = this.getMaterialInteractionShape(this.findShapeAt(pagePoint))
		const selectionInfo = hitShape
			? this.selectOnShapePointerDown(hitShape, pagePoint, event)
			: null
		this.transitionTo(
			new PointingShapeState(this.context, {
				didSelectOnEnter: selectionInfo?.didSelectOnEnter,
				hitShape,
				hitShapeForPointerUp: selectionInfo?.hitShapeForPointerUp,
				originPagePoint: pagePoint,
				pointerId: event.pointerId,
			})
		)
	}

	zoomIn() {
		this.zoomBy(1.1)
	}

	zoomOut() {
		this.zoomBy(0.9)
	}

	resetZoom() {
		this.setZoomLevel(1)
	}

	wheel(event: WheelEvent) {
		event.preventDefault()
		this.updateViewport()

		const localPoint = this.getCanvasPoint(event)
		const screenPoint = this.getScreenPoint(event)
		const currentCamera = this.options.getCamera()

		if (event.ctrlKey || event.metaKey) {
			const nextZoom = Math.min(4, Math.max(0.2, currentCamera.z * (event.deltaY > 0 ? 0.9 : 1.1)))
			const pagePoint = this.options.editor.screenToPage(screenPoint)
			this.setCamera({
				x: localPoint.x / nextZoom - pagePoint.x,
				y: localPoint.y / nextZoom - pagePoint.y,
				z: nextZoom,
			})
			return
		}

		this.setCamera({
			x: currentCamera.x - event.deltaX / currentCamera.z,
			y: currentCamera.y - event.deltaY / currentCamera.z,
			z: currentCamera.z,
		})
	}

	keyDown(event: KeyboardEvent) {
		if (this.shouldSkipKeyboardEvent(event)) return
		this.dispatchKeyboardEvent(event)

		if (this.contextMenu) {
			event.preventDefault()
			if (event.key === 'Escape') {
				this.closeContextMenu()
			}
			return
		}

		if (event.key === 'Escape') {
			event.preventDefault()
			this.cancel()
			return
		}

		if (this.handleKeyboardShortcut(event)) {
			event.preventDefault()
			return
		}

		this.state.onKeyDown(event)
	}

	keyUp(event: KeyboardEvent) {
		if (this.shouldSkipKeyboardEvent(event)) return
		this.dispatchKeyboardEvent(event)
		this.handleKeyboardKeyUp(event)
		this.state.onKeyUp(event)
	}

	cancel() {
		this.closeContextMenu()
		this.stopForwardingToolbarDragEvents()
		if (this.options.editor.getEditingShapeId()) {
			this.options.editor.setEditingShape(null)
		}
		this.state.onCancel()
		if (this.activeTool !== 'select') {
			this.setActiveTool('select')
		}
		this.options.editor.snaps.clearIndicators()
	}

	deleteSelection() {
		this.selectMaterialParentsForSelectedSections()
		const ids = this.options.editor.getSelectedShapeIds()
		if (!ids.length) return
		this.options.editor.markHistoryStoppingPoint('delete shapes')
		this.options.editor.deleteShapes(ids)
	}

	private handleKeyboardShortcut(event: KeyboardEvent) {
		if (this.options.handleShortcut?.(event)) return true
		if (event.repeat && !this.isRepeatableShortcut(event)) return true

		this.selectMaterialParentsForSelectedSections()

		if (this.handleArrowKeyShortcut(event)) return true
		if (this.handleTabShortcut(event)) return true
		if (this.handleActionShortcut(event)) return true
		if (this.handleToolbarNumberShortcut(event)) return true
		if (this.handleToolShortcut(event)) return true
		if (this.handleZoomShortcut(event)) return true
		if (this.handleSpacebarShortcut(event)) return true

		return false
	}

	private handleKeyboardKeyUp(event: KeyboardEvent) {
		if (event.key !== 'Enter') return
		if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return

		const selectedShapes = this.options.editor.getSelectedShapes()
		if (!selectedShapes.length) return

		if (selectedShapes.length === 1 && selectedShapes[0]?.type === 'vue-text') {
			event.preventDefault()
			this.options.editor.markHistoryStoppingPoint('editing text')
			this.options.editor.setEditingShape(selectedShapes[0].id)
			return
		}

		if (selectedShapes.every((shape) => this.options.editor.isShapeOfType(shape, 'group'))) {
			event.preventDefault()
			this.options.editor.setSelectedShapes(
				selectedShapes.flatMap((shape) => this.options.editor.getSortedChildIdsForParent(shape.id))
			)
		}
	}

	private handleActionShortcut(event: KeyboardEvent) {
		const editor = this.options.editor

		if (this.matchesShortcut(event, { key: 'z', accel: true })) {
			if (editor.getCanUndo()) editor.undo()
			return true
		}

		if (
			this.matchesShortcut(event, { key: 'z', accel: true, shift: true }) ||
			this.matchesShortcut(event, { key: 'y', accel: true })
		) {
			if (editor.getCanRedo()) editor.redo()
			return true
		}

		if (this.matchesShortcut(event, { key: 'a', accel: true })) {
			editor.markHistoryStoppingPoint('select all')
			editor.selectAll()
			return true
		}

		if (this.matchesShortcut(event, { key: 'enter', accel: true, shift: true })) {
			this.openKeyboardContextMenu()
			return true
		}

		if (this.matchesShortcut(event, { key: 'd', accel: true })) {
			void this.runContextMenuShortcut('duplicate')
			return true
		}

		if (this.matchesShortcut(event, { key: 'x', accel: true })) {
			void this.runContextMenuShortcut('cut')
			return true
		}

		if (this.matchesShortcut(event, { key: 'c', accel: true })) {
			void this.runContextMenuShortcut('copy')
			return true
		}

		if (this.matchesShortcut(event, { key: 'v', accel: true })) {
			void this.runContextMenuShortcut('paste')
			return true
		}

		if (event.key === 'Delete' || event.key === 'Backspace') {
			this.deleteSelection()
			return true
		}

		if (this.matchesShortcut(event, { key: 'g', accel: true, shift: true })) {
			void this.runContextMenuShortcut('ungroup')
			return true
		}

		if (this.matchesShortcut(event, { key: 'g', accel: true })) {
			void this.runContextMenuShortcut('group')
			return true
		}

		if (this.matchesShortcut(event, { key: 'l', shift: true })) {
			void this.runContextMenuShortcut('toggle-lock')
			return true
		}

		if (this.matchesShortcut(event, { key: 'f', shift: true })) {
			void this.runContextMenuShortcut('expand')
			return true
		}

		if (this.matchesShortcut(event, { key: ']', alt: true })) {
			void this.runContextMenuShortcut('bring-forward')
			return true
		}

		if (this.matchesShortcut(event, { key: '[', alt: true })) {
			void this.runContextMenuShortcut('send-backward')
			return true
		}

		if (this.matchesShortcut(event, { key: ']' })) {
			void this.runContextMenuShortcut('bring-to-front')
			return true
		}

		if (this.matchesShortcut(event, { key: '[' })) {
			void this.runContextMenuShortcut('send-to-back')
			return true
		}

		if (this.matchesShortcut(event, { key: 'h', shift: true })) {
			this.flipSelection('horizontal')
			return true
		}

		if (this.matchesShortcut(event, { key: 'v', shift: true })) {
			this.flipSelection('vertical')
			return true
		}

		if (this.matchesShortcut(event, { key: 'q' })) {
			editor.updateInstanceState({ isToolLocked: !editor.getInstanceState().isToolLocked })
			return true
		}

		if (this.matchesShortcut(event, { key: '.', shift: true })) {
			this.rotateSelection('clockwise', false)
			return true
		}

		if (this.matchesShortcut(event, { key: '.', alt: true, shift: true })) {
			this.rotateSelection('clockwise', true)
			return true
		}

		if (this.matchesShortcut(event, { key: ',', shift: true })) {
			this.rotateSelection('counter-clockwise', false)
			return true
		}

		if (this.matchesShortcut(event, { key: ',', alt: true, shift: true })) {
			this.rotateSelection('counter-clockwise', true)
			return true
		}

		if (this.matchesShortcut(event, { key: '=', accel: true, alt: true, shift: true })) {
			this.scaleSelection(1.1)
			return true
		}

		if (this.matchesShortcut(event, { key: '-', accel: true, alt: true, shift: true })) {
			this.scaleSelection(1 / 1.1)
			return true
		}

		return this.handleArrangeShortcut(event)
	}

	private handleArrangeShortcut(event: KeyboardEvent) {
		if (this.matchesShortcut(event, { key: 'a', alt: true })) {
			this.alignSelection('left')
			return true
		}

		if (this.matchesShortcut(event, { key: 'h', alt: true })) {
			this.alignSelection('center-horizontal')
			return true
		}

		if (this.matchesShortcut(event, { key: 'd', alt: true })) {
			this.alignSelection('right')
			return true
		}

		if (this.matchesShortcut(event, { key: 'w', alt: true })) {
			this.alignSelection('top')
			return true
		}

		if (this.matchesShortcut(event, { key: 'v', alt: true })) {
			this.alignSelection('center-vertical')
			return true
		}

		if (this.matchesShortcut(event, { key: 's', alt: true })) {
			this.alignSelection('bottom')
			return true
		}

		if (this.matchesShortcut(event, { key: 'h', alt: true, shift: true })) {
			this.distributeSelection('horizontal')
			return true
		}

		if (this.matchesShortcut(event, { key: 'v', alt: true, shift: true })) {
			this.distributeSelection('vertical')
			return true
		}

		return false
	}

	private handleToolShortcut(event: KeyboardEvent) {
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false

		const key = this.getEventKey(event)
		const toolByKey: Partial<Record<string, CanvasTool>> = {
			a: 'arrow',
			b: 'table',
			d: 'draw',
			e: 'eraser',
			f: 'frame',
			g: 'geo',
			h: 'hand',
			k: 'laser',
			l: 'line',
			m: 'material',
			n: 'note',
			t: 'text',
			v: 'select',
		}

		const geoShapeByKey: Partial<Record<string, VueGeoShape>> = {
			o: 'ellipse',
			r: 'rectangle',
		}

		const tool = toolByKey[key]
		if (tool) {
			this.closeContextMenu()
			this.setActiveTool(tool)
			return true
		}

		const geoShape = geoShapeByKey[key]
		if (geoShape) {
			this.closeContextMenu()
			this.setActiveTool('geo', geoShape)
			return true
		}

		return false
	}

	private handleToolbarNumberShortcut(event: KeyboardEvent) {
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false

		const index = Number(event.key)
		if (!Number.isInteger(index) || index < 1 || index > 9) return false

		const primaryTool = this.options.toolbarTools.filter((tool) => tool.placement === 'primary')[
			index - 1
		]
		if (!primaryTool?.selection) return false

		this.closeContextMenu()
		this.setActiveTool(primaryTool.selection.tool, primaryTool.selection.geoShape)
		return true
	}

	private handleSpacebarShortcut(event: KeyboardEvent) {
		if (event.code !== 'Space') return false
		if (event.ctrlKey || event.metaKey || event.altKey) return false
		return true
	}

	private handleZoomShortcut(event: KeyboardEvent) {
		if (this.matchesShortcut(event, { key: '=' }) || this.matchesShortcut(event, { key: '=', accel: true })) {
			this.zoomIn()
			return true
		}

		if (
			this.matchesShortcut(event, { key: '=', shift: true }) ||
			this.matchesShortcut(event, { key: '=', accel: true, shift: true })
		) {
			this.zoomIn()
			return true
		}

		if (this.matchesShortcut(event, { key: '-' }) || this.matchesShortcut(event, { key: '-', accel: true })) {
			this.zoomOut()
			return true
		}

		if (
			this.matchesShortcut(event, { key: '-', shift: true }) ||
			this.matchesShortcut(event, { key: '-', accel: true, shift: true })
		) {
			this.zoomOut()
			return true
		}

		if (this.matchesShortcut(event, { key: '0', shift: true })) {
			this.resetZoom()
			return true
		}

		if (this.matchesShortcut(event, { key: '0', accel: true })) {
			return true
		}

		if (this.matchesShortcut(event, { key: '1', shift: true })) {
			this.options.editor.zoomToFit({
				animation: { duration: this.options.editor.options.animationMediumMs },
			})
			return true
		}

		if (this.matchesShortcut(event, { key: '2', shift: true })) {
			if (this.options.editor.getSelectedShapeIds().length > 0) {
				this.options.editor.zoomToSelection({
					animation: { duration: this.options.editor.options.animationMediumMs },
				})
			}
			return true
		}

		return false
	}

	private handleArrowKeyShortcut(event: KeyboardEvent) {
		if (
			event.code !== 'ArrowLeft' &&
			event.code !== 'ArrowRight' &&
			event.code !== 'ArrowUp' &&
			event.code !== 'ArrowDown'
		) {
			return false
		}

		if (event.altKey && !event.ctrlKey && !event.metaKey) {
			this.switchPage(event.code === 'ArrowLeft' || event.code === 'ArrowUp' ? -1 : 1)
			return true
		}

		if (event.ctrlKey || event.metaKey) {
			if (event.shiftKey) {
				if (event.code === 'ArrowDown') {
					this.options.editor.selectFirstChildShape()
				} else if (event.code === 'ArrowUp') {
					this.options.editor.selectParentShape()
				}
				this.selectMaterialParentsForSelectedSections()
			} else {
				this.options.editor.selectAdjacentShape(
					event.code.replace('Arrow', '').toLowerCase() as 'left' | 'right' | 'up' | 'down'
				)
				this.selectMaterialParentsForSelectedSections()
			}
			return true
		}

		this.selectMaterialParentsForSelectedSections()
		this.nudgeSelectedShapes(event.repeat)
		return true
	}

	private handleTabShortcut(event: KeyboardEvent) {
		if (event.key !== 'Tab') return false
		const selectedShapes = this.options.editor.getSelectedShapes()
		if (!selectedShapes.length || event.altKey) return false
		this.options.editor.selectAdjacentShape(event.shiftKey ? 'prev' : 'next')
		this.selectMaterialParentsForSelectedSections()
		return true
	}

	private async runContextMenuShortcut(actionId: ContextMenuActionId) {
		const editor = this.options.editor
		const snapshot = this.contextMenuState.buildSnapshot(
			editor,
			this.getKeyboardActionScreenPoint(),
			this.getKeyboardActionPagePoint()
		)
		await this.contextMenuState.executeAction(editor, snapshot, actionId)
		this.resetContainerScroll()
	}

	private getKeyboardActionScreenPoint() {
		const container = this.options.getContainer()
		if (!container) return new Vec(0, 0)
		const bounds = container.getBoundingClientRect()
		return new Vec(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
	}

	private getKeyboardActionPagePoint() {
		return this.options.editor.screenToPage(this.getKeyboardActionScreenPoint())
	}

	private openKeyboardContextMenu() {
		const editor = this.options.editor
		if (!editor.getSelectedShapeIds().length) return

		const pagePoint = editor.getSelectionPageBounds()?.center ?? this.getKeyboardActionPagePoint()
		const screenPoint = editor.pageToScreen(pagePoint)
		this.contextMenu = this.contextMenuState.buildSnapshot(editor, screenPoint, pagePoint)
		this.options.onContextMenuChange(this.contextMenu)
	}

	private nudgeSelectedShapes(ephemeral: boolean) {
		const editor = this.options.editor
		const selectedShapeIds = editor.getSelectedShapeIds()
		if (!selectedShapeIds.length || editor.getIsReadonly()) return

		const delta = new Vec(0, 0)
		if (editor.inputs.keys.has('ArrowLeft')) delta.x -= 1
		if (editor.inputs.keys.has('ArrowRight')) delta.x += 1
		if (editor.inputs.keys.has('ArrowUp')) delta.y -= 1
		if (editor.inputs.keys.has('ArrowDown')) delta.y += 1
		if (delta.equals(new Vec(0, 0))) return

		if (!ephemeral) editor.markHistoryStoppingPoint('nudge shapes')
		editor.updateInstanceState({ isChangingStyle: true })

		const { gridSize } = editor.getDocumentSettings()
		const step = editor.getInstanceState().isGridMode
			? editor.inputs.keys.has('ShiftLeft')
				? gridSize * 5
				: gridSize
			: editor.inputs.keys.has('ShiftLeft')
				? 10
				: 1

		editor.nudgeShapes(selectedShapeIds, delta.mul(step))
		kickoutOccludedShapes(editor, selectedShapeIds)
	}

	private flipSelection(operation: 'horizontal' | 'vertical') {
		const ids = this.options.editor.getSelectedShapeIds()
		if (!ids.length) return
		this.options.editor.flipShapes(ids, operation)
	}

	private alignSelection(
		operation: 'left' | 'center-horizontal' | 'right' | 'top' | 'center-vertical' | 'bottom'
	) {
		const ids = this.options.editor.getSelectedShapeIds()
		if (ids.length < 2) return
		this.options.editor.alignShapes(ids, operation)
	}

	private distributeSelection(operation: 'horizontal' | 'vertical') {
		const ids = this.options.editor.getSelectedShapeIds()
		if (ids.length < 3) return
		this.options.editor.distributeShapes(ids, operation)
	}

	private rotateSelection(direction: 'clockwise' | 'counter-clockwise', isFine: boolean) {
		const editor = this.options.editor
		const selectedShapeIds = editor.getSelectedShapeIds()
		if (!selectedShapeIds.length || editor.getIsReadonly()) return

		editor.markHistoryStoppingPoint(direction === 'clockwise' ? 'rotate-cw' : 'rotate-ccw')
		editor.run(() => {
			const rotation = HALF_PI / (isFine ? 96 : 6)
			const offset = editor.getSelectionRotation() % rotation

			if (direction === 'clockwise') {
				const dontUseOffset = approximately(offset, 0) || approximately(offset, rotation)
				editor.rotateShapesBy(selectedShapeIds, rotation - (dontUseOffset ? 0 : offset))
			} else {
				const offsetCloseToZero = approximately(offset, 0)
				editor.rotateShapesBy(selectedShapeIds, offsetCloseToZero ? -rotation : -offset)
			}

			kickoutOccludedShapes(editor, selectedShapeIds)
		})
	}

	private scaleSelection(scaleFactor: number) {
		const editor = this.options.editor
		const selectedShapeIds = editor.getSelectedShapeIds()
		const scaleOrigin = editor.getSelectionPageBounds()?.center
		if (!selectedShapeIds.length || editor.getIsReadonly() || !scaleOrigin) return

		editor.markHistoryStoppingPoint('resize shapes')
		editor.run(() => {
			for (const shapeId of selectedShapeIds) {
				editor.resizeShape(shapeId, new Vec(scaleFactor, scaleFactor), { scaleOrigin })
			}
		})
	}

	private switchPage(direction: -1 | 1) {
		const pages = this.options.editor.getPages()
		const currentPageId = this.options.editor.getCurrentPageId()
		const currentIndex = pages.findIndex((page) => page.id === currentPageId)
		const nextPage = pages[currentIndex + direction]
		if (nextPage) this.options.editor.setCurrentPage(nextPage.id)
	}

	private dispatchKeyboardEvent(event: KeyboardEvent) {
		this.options.editor.dispatch({
			type: 'keyboard',
			name: event.repeat ? 'key_repeat' : event.type === 'keyup' ? 'key_up' : 'key_down',
			key: event.key,
			code: event.code,
			shiftKey: event.shiftKey,
			altKey: event.altKey,
			ctrlKey: event.ctrlKey || event.metaKey,
			metaKey: event.metaKey,
			accelKey: event.ctrlKey || event.metaKey,
		})
	}

	private shouldSkipKeyboardEvent(event: KeyboardEvent) {
		if (event.isComposing) return true
		const target = event.target as HTMLElement | null
		const activeElement = document.activeElement as HTMLElement | null
		if (activeElement?.closest('.lowcode-form-panel')) return true
		if (!target) return false
		if (target.closest('.lowcode-form-panel')) return true
		if (target.isContentEditable) return true
		const tagName = target.tagName
		if (tagName === 'TEXTAREA' || tagName === 'SELECT') return true
		if (tagName !== 'INPUT') return false
		const input = target as HTMLInputElement
		return !['checkbox', 'radio', 'range', 'button', 'file', 'reset', 'submit', 'color'].includes(
			input.type
		)
	}

	private isRepeatableShortcut(event: KeyboardEvent) {
		return (
			event.code === 'ArrowLeft' ||
			event.code === 'ArrowRight' ||
			event.code === 'ArrowUp' ||
			event.code === 'ArrowDown' ||
			event.key === 'Tab'
		)
	}

	private matchesShortcut(
		event: KeyboardEvent,
		shortcut: { key: string; shift?: boolean; alt?: boolean; accel?: boolean }
	) {
		return (
			this.getEventKey(event) === shortcut.key &&
			event.shiftKey === Boolean(shortcut.shift) &&
			event.altKey === Boolean(shortcut.alt) &&
			(event.ctrlKey || event.metaKey) === Boolean(shortcut.accel)
		)
	}

	private getEventKey(event: KeyboardEvent) {
		const key = event.key.toLowerCase()
		if (event.shiftKey) {
			return (
				{
					'+': '=',
					'_': '-',
					'{': '[',
					'}': ']',
					'<': ',',
					'>': '.',
				} as Record<string, string>
			)[key] ?? key
		}
		return key
	}

	private getCanvasCreateDefinition(tool: CanvasTool) {
		return this.options.toolbarTools.find(
			(definition) =>
				definition.selection?.tool === tool &&
				definition.selection.geoShape === undefined &&
				definition.canvasCreate
		)?.canvasCreate
	}

	private getToolbarToolDefinition(tool: CanvasTool, geoShape?: VueGeoShape) {
		const matchesSelection = (definition: VueToolbarToolDefinition) =>
			definition.selection?.tool === tool &&
			(definition.selection.geoShape ?? undefined) === (geoShape ?? undefined)

		return (
			this.options.toolbarTools.find(
				(definition) => matchesSelection(definition) && definition.toolbarCreate
			) ?? this.options.toolbarTools.find(matchesSelection)
		)
	}

	private getShapeCreateRect(shape: TLShape, definition: VueShapeCreateDefinition) {
		const props = shape.props as { w?: number; h?: number }
		return {
			x: shape.x,
			y: shape.y,
			w: typeof props.w === 'number' ? props.w : definition.defaultSize.w,
			h: typeof props.h === 'number' ? props.h : definition.defaultSize.h,
		}
	}

	private transitionTo(state: VueInteractionState) {
		this.state.onExit()
		this.state = state
		this.state.onEnter()
	}

	private maybeStartRightButtonPan(event: PointerEvent) {
		const candidate = this.rightButtonPanCandidate
		if (!candidate || candidate.pointerId !== event.pointerId) return false

		if ((event.buttons & 2) === 0) {
			this.rightButtonPanCandidate = null
			return false
		}

		const currentScreenPoint = this.getCanvasPoint(event)
		const distanceSquared = Vec.Dist2(candidate.originScreenPoint, currentScreenPoint)
		if (distanceSquared <= RIGHT_BUTTON_PAN_DISTANCE_SQUARED) return false

		event.preventDefault()
		event.stopPropagation()
		this.suppressNextContextMenu = true
		this.rightButtonPanCandidate = null
		this.rightButtonPanPointerId = event.pointerId
		this.updateViewport()
		this.transitionTo(
			new PanningState(this.context, {
				button: 2,
				originScreenPoint: candidate.originScreenPoint,
				pointerId: event.pointerId,
			})
		)
		this.state.onPointerMove(event)
		return true
	}

	private startForwardingToolbarDragEvents(pointerId: number) {
		this.stopForwardingToolbarDragEvents()
		this.activeToolbarDragPointerId = pointerId
		window.addEventListener('pointermove', this.onToolbarDragPointerMove, true)
		window.addEventListener('pointerup', this.onToolbarDragPointerUp, true)
		window.addEventListener('pointercancel', this.onToolbarDragPointerCancel, true)
	}

	private stopForwardingToolbarDragEvents() {
		if (this.activeToolbarDragPointerId === null) return
		this.activeToolbarDragPointerId = null
		window.removeEventListener('pointermove', this.onToolbarDragPointerMove, true)
		window.removeEventListener('pointerup', this.onToolbarDragPointerUp, true)
		window.removeEventListener('pointercancel', this.onToolbarDragPointerCancel, true)
	}

	private capturePointer(event: PointerEvent) {
		const target = event.currentTarget
		if (target instanceof Element) {
			try {
				target.setPointerCapture(event.pointerId)
				return
			} catch {
				// Fall back to the canvas container below.
			}
		}

		this.options.getContainer()?.setPointerCapture(event.pointerId)
	}

	private resetContainerScroll() {
		const container = this.options.getContainer()
		if (!container) return
		if (container.scrollLeft !== 0) container.scrollLeft = 0
		if (container.scrollTop !== 0) container.scrollTop = 0
	}

	private getCanvasPoint(event: ClientPoint) {
		const container = this.options.getContainer()
		if (!container) return new Vec(event.clientX, event.clientY)
		const bounds = container.getBoundingClientRect()
		return new Vec(event.clientX - bounds.left, event.clientY - bounds.top)
	}

	private getScreenPoint(event: ClientPoint) {
		return new Vec(event.clientX, event.clientY)
	}

	private getPagePoint(event: ClientPoint) {
		return this.options.editor.screenToPage(this.getScreenPoint(event))
	}

	private findShapeAt(point: VecLike) {
		const editor = this.options.editor
		const hitOptions = {
			hitInside: false,
			hitLabels: false,
			hitLocked: editor.options.selectLockedShapes,
			margin: editor.getHitTestMargin(),
		}

		const hitShape =
			editor.getShapeAtPoint(point, {
				...hitOptions,
				renderingOnly: true,
			}) ??
			editor.getSelectedShapeAtPoint(point) ??
			editor.getShapeAtPoint(point, hitOptions)

		if (
			hitShape &&
			editor.isShapeOfType(hitShape, 'group') &&
			editor.getSelectedShapeIds().includes(hitShape.id)
		) {
			return this.findChildShapeAtPoint(point, hitShape.id) ?? hitShape
		}

		return hitShape ?? this.findMaterialInteractionShapeAtPoint(point)
	}

	private findChildShapeAtPoint(point: VecLike, parentId: TLShapeId) {
		const editor = this.options.editor
		const margin = editor.getHitTestMargin()
		const shapes = this.options.getCurrentPageShapes()

		for (let i = shapes.length - 1; i >= 0; i--) {
			const shape = shapes[i]
			if (!shape || shape.id === parentId || !editor.hasAncestor(shape, parentId)) continue
			if (editor.isShapeOrAncestorLocked(shape) && !editor.options.selectLockedShapes) continue
			if (editor.isPointInShape(shape, point, { hitInside: true, margin })) {
				return shape
			}
		}

		return undefined
	}

	private getMaterialInteractionShape(shape: TLShape | undefined) {
		if (!shape || shape.type !== ('vue-material-section' as string)) return shape
		if ((shape as TLShape & { props: { zone?: string } }).props.zone !== 'tableBody') {
			return undefined
		}
		const parent = this.options.editor.getShape(shape.parentId)
		return parent?.type === ('vue-material' as string) ? parent : undefined
	}

	private findMaterialInteractionShapeAtPoint(point: VecLike) {
		const editor = this.options.editor
		const margin = editor.getHitTestMargin()
		const shapes = this.options.getCurrentPageShapes()

		for (let i = shapes.length - 1; i >= 0; i--) {
			const shape = shapes[i]
			if (!shape || shape.type !== ('vue-material-section' as string)) continue
			if ((shape as TLShape & { props: { zone?: string } }).props.zone !== 'tableBody') continue
			if (editor.isShapeOrAncestorLocked(shape) && !editor.options.selectLockedShapes) continue
			if (!editor.isPointInShape(shape, point, { hitInside: true, margin })) continue
			return this.getMaterialInteractionShape(shape)
		}

		return undefined
	}

	private getMaterialInteractionSelectionIds(ids: TLShapeId[]) {
		const nextIds: TLShapeId[] = []
		const seen = new Set<TLShapeId>()

		for (const id of ids) {
			const shape = this.options.editor.getShape(id)
			if (shape?.type === ('vue-material-section' as string)) {
				const nextId = this.getMaterialInteractionShape(shape)?.id
				if (!nextId || seen.has(nextId)) continue
				seen.add(nextId)
				nextIds.push(nextId)
				continue
			}
			const nextId = shape?.id ?? id
			if (seen.has(nextId)) continue
			seen.add(nextId)
			nextIds.push(nextId)
		}

		return nextIds
	}

	private selectMaterialParentsForSelectedSections() {
		const selectedShapeIds = this.options.editor.getSelectedShapeIds()
		const nextIds = this.getMaterialInteractionSelectionIds(selectedShapeIds)
		if (
			nextIds.length === selectedShapeIds.length &&
			nextIds.every((id, index) => id === selectedShapeIds[index])
		) {
			return
		}
		this.setSelectedShapes(nextIds)
	}

	private isPointInRotatedSelectionBounds(point: VecLike) {
		const editor = this.options.editor
		const selectionBounds = editor.getSelectionRotatedPageBounds()
		if (!selectionBounds) return false

		const selectionRotation = editor.getSelectionRotation()
		if (!selectionRotation) return selectionBounds.containsPoint(point)

		return pointInPolygon(
			point,
			selectionBounds.corners.map((corner) =>
				Vec.RotWith(corner, selectionBounds.point, selectionRotation)
			)
		)
	}

	private setCamera(point: VecLike) {
		const maybeCamera = point as VecLike & { z?: unknown }
		const currentCamera = this.options.getCamera()
		const z = typeof maybeCamera.z === 'number' ? maybeCamera.z : currentCamera.z
		const nextCamera = {
			x: point.x,
			y: point.y,
			z,
		}
		this.options.editor.run(
			() => this.options.editor.setCamera(nextCamera, { immediate: true }),
			{ history: 'ignore' }
		)
	}

	private zoomBy(factor: number) {
		this.setZoomLevel(this.options.getCamera().z * factor)
	}

	private setZoomLevel(zoom: number) {
		const viewport = this.getViewportSize()
		const currentCamera = this.options.getCamera()
		const nextZoom = Math.min(4, Math.max(0.2, zoom))
		const anchor = new Vec(viewport.w / 2, viewport.h / 2)
		const anchorPagePoint = new Vec(
			anchor.x / currentCamera.z - currentCamera.x,
			anchor.y / currentCamera.z - currentCamera.y
		)

		this.setCamera({
			x: anchor.x / nextZoom - anchorPagePoint.x,
			y: anchor.y / nextZoom - anchorPagePoint.y,
			z: nextZoom,
		})
	}

	private setSelectedShapes(ids: TLShapeId[]) {
		const nextIds = this.getMaterialInteractionSelectionIds(ids)
		this.options.editor.run(() => this.options.editor.setSelectedShapes(nextIds), {
			history: 'ignore',
		})
	}

	private shouldSnap(event: MouseEvent | PointerEvent | KeyboardEvent) {
		const isHoldingAccel = event.ctrlKey || event.metaKey
		return this.options.editor.user.getIsSnapMode() ? !isHoldingAccel : isHoldingAccel
	}

	private getViewportSize(): WorkspaceViewportSize {
		const container = this.options.getContainer()
		if (!container) return { w: 0, h: 0 }
		return {
			w: container.clientWidth,
			h: container.clientHeight,
		}
	}
}
