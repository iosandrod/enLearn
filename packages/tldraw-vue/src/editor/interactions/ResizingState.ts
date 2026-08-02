import {
	Box,
	HALF_PI,
	Mat,
	Vec,
	areAnglesCompatible,
	isShapeId,
	kickoutOccludedShapes,
	rotateSelectionHandle,
	type Editor,
	type SelectionCorner,
	type SelectionEdge,
	type TLCursorType,
	type TLShape,
	type TLShapeId,
	type TLShapePartial,
	type VecLike,
} from '@tldraw/editor'
import { resolveGuideSnap, snapResizeToGuides } from './guides'
import { IdleState, VueInteractionState, type ResizeHandle, type VueEditorContext } from './types'

const RESIZE_CURSORS: Record<ResizeHandle, TLCursorType> = {
	top_left: 'nwse-resize',
	top: 'ns-resize',
	top_right: 'nesw-resize',
	right: 'ew-resize',
	bottom_right: 'nwse-resize',
	bottom: 'ns-resize',
	bottom_left: 'nesw-resize',
	left: 'ew-resize',
}

export interface ResizeShapeSnapshot {
	bounds: Box
	isAspectRatioLocked: boolean
	pageRotation: number
	pageTransform: Mat
	shape: TLShape
}

export interface ResizingSnapshot {
	canShapesDeform: boolean
	cursorHandleOffset: Vec
	initialSelectionPageBounds: NonNullable<ReturnType<Editor['getSelectionPageBounds']>>
	resizeLevels: TLShapeId[][]
	selectedShapeIds: TLShapeId[]
	selectionBounds: Box
	selectionRotation: number
	shapeSnapshots: Map<TLShapeId, ResizeShapeSnapshot>
}

export function getResizingSnapshot(
	editor: Editor,
	handle: ResizeHandle,
	originPagePoint: VecLike
): ResizingSnapshot | null {
	const selectedShapeIds = editor.getSelectedShapeIds()
	const selectionRotation = editor.getSelectionRotation()
	const selectionBounds = editor.getSelectionRotatedPageBounds()
	const initialSelectionPageBounds = editor.getSelectionPageBounds()

	if (!selectionBounds || !initialSelectionPageBounds) return null

	const dragHandlePoint = Vec.RotWith(
		selectionBounds.getHandlePoint(handle),
		selectionBounds.point,
		selectionRotation
	)
	const cursorHandleOffset = Vec.Sub(originPagePoint, dragHandlePoint)

	const shapeSnapshots = new Map<TLShapeId, ResizeShapeSnapshot>()

	const populateResizingShape = (shapeId: TLShapeId): false | undefined => {
		const shape = editor.getShape(shapeId)
		if (!shape) return false

		const util = editor.getShapeUtil(shape)
		if (util.canResize(shape)) {
			const pageTransform = editor.getShapePageTransform(shape.id)
			if (pageTransform) {
				shapeSnapshots.set(shape.id, {
					shape,
					bounds: editor.getShapeGeometry(shape).bounds,
					pageTransform,
					pageRotation: Mat.Decompose(pageTransform).rotation,
					isAspectRatioLocked: util.isAspectRatioLocked(shape),
				})
			}
		}

		if (!util.canResizeChildren(shape)) return false
		return undefined
	}

	for (const shapeId of selectedShapeIds) {
		const keepDescending = populateResizingShape(shapeId)
		if (keepDescending === false) continue
		editor.visitDescendants(shapeId, populateResizingShape)
	}

	if (shapeSnapshots.size === 0) return null

	const canShapesDeform = ![...shapeSnapshots.values()].some(
		(snapshot) =>
			!areAnglesCompatible(snapshot.pageRotation, selectionRotation) ||
			snapshot.isAspectRatioLocked
	)

	const resizeLevels: TLShapeId[][] = []
	const levelByShapeId = new Map<TLShapeId, number>()
	const getLevel = (id: TLShapeId): number => {
		const cached = levelByShapeId.get(id)
		if (cached !== undefined) return cached

		let level = 0
		let parentId = editor.getShape(id)?.parentId
		while (parentId && isShapeId(parentId)) {
			if (shapeSnapshots.has(parentId)) {
				level = getLevel(parentId) + 1
				break
			}
			parentId = editor.getShape(parentId)?.parentId
		}

		levelByShapeId.set(id, level)
		return level
	}

	for (const id of shapeSnapshots.keys()) {
		const level = getLevel(id)
		while (resizeLevels.length <= level) resizeLevels.push([])
		resizeLevels[level].push(id)
	}

	return {
		canShapesDeform,
		cursorHandleOffset,
		initialSelectionPageBounds,
		resizeLevels,
		selectedShapeIds,
		selectionBounds,
		selectionRotation,
		shapeSnapshots,
	}
}

export class ResizingState extends VueInteractionState {
	readonly id = 'resizing'

	private readonly markId: string
	private readonly snapshot: ResizingSnapshot | null

	constructor(
		context: VueEditorContext,
		private readonly info: {
			handle: ResizeHandle
			originPagePoint: Vec
			pointerId: number
		}
	) {
		super(context)
		this.snapshot = getResizingSnapshot(context.editor, info.handle, info.originPagePoint)
		this.markId = context.editor.markHistoryStoppingPoint('starting resizing')
	}

	override onEnter() {
		if (!this.snapshot) {
			this.transitionTo(new IdleState(this.context))
			return
		}

		this.updateCursor({
			dragHandle: this.info.handle,
			isFlippedX: false,
			isFlippedY: false,
			rotation: this.snapshot.selectionRotation,
		})
		this.handleResizeStart()
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
		if (!this.snapshot) {
			this.transitionTo(new IdleState(this.context))
			return
		}

		for (const { shape } of this.snapshot.shapeSnapshots.values()) {
			const current = this.editor.getShape(shape.id)
			if (!current) continue
			this.editor.getShapeUtil(shape).onResizeCancel?.(shape, current)
		}

		this.editor.bailToMark(this.markId)
		this.transitionTo(new IdleState(this.context))
	}

	private handleResizeStart() {
		if (!this.snapshot) return

		const changes: TLShapePartial[] = []
		for (const { shape } of this.snapshot.shapeSnapshots.values()) {
			const change = this.editor.getShapeUtil(shape).onResizeStart?.(shape)
			if (change) changes.push(change)
		}

		if (changes.length > 0) this.editor.updateShapes(changes)
	}

	private handleResizeEnd() {
		if (!this.snapshot) return

		const changes: TLShapePartial[] = []
		for (const { shape } of this.snapshot.shapeSnapshots.values()) {
			const current = this.editor.getShape(shape.id)
			if (!current) continue
			const change = this.editor.getShapeUtil(shape).onResizeEnd?.(shape, current)
			if (change) changes.push(change)
		}

		if (changes.length > 0) this.editor.updateShapes(changes)
	}

	private updateShapes(event: PointerEvent) {
		if (!this.snapshot) return

		const {
			canShapesDeform,
			cursorHandleOffset,
			initialSelectionPageBounds,
			resizeLevels,
			selectedShapeIds,
			selectionBounds,
			selectionRotation,
			shapeSnapshots,
		} = this.snapshot

		const currentPagePoint = this.context.getPagePoint(event).sub(cursorHandleOffset)
		const originPagePoint = this.info.originPagePoint.clone().sub(cursorHandleOffset)

		if (editorShouldSnapToGrid(this.editor, event)) {
			currentPagePoint.snapToGrid(this.editor.getDocumentSettings().gridSize)
		}

		let isAspectRatioLocked = event.shiftKey || !canShapesDeform
		if (shapeSnapshots.size === 1) {
			const onlySnapshot = [...shapeSnapshots.values()][0]!
			isAspectRatioLocked = isAspectRatioLocked || onlySnapshot.isAspectRatioLocked
		}

		const dragHandle = this.info.handle as SelectionCorner | SelectionEdge
		const scaleOriginHandle = rotateSelectionHandle(dragHandle, Math.PI)

		this.editor.snaps.clearIndicators()

		if (this.context.shouldSnap(event) && selectionRotation % HALF_PI === 0) {
			const dragDelta = Vec.Sub(currentPagePoint, originPagePoint)
			const snapHandle = rotateSelectionHandle(dragHandle, selectionRotation)
			const shapeSnap = this.editor.snaps.shapeBounds.snapResizeShapes({
				dragDelta,
				handle: snapHandle,
				initialSelectionPageBounds,
				isAspectRatioLocked,
				isResizingFromCenter: event.altKey,
			})
			const shapeIndicators = this.editor.snaps.getIndicators()
			const guideSnap = this.context.getGuides().length
				? snapResizeToGuides({
						dragDelta,
						guides: this.context.getGuides(),
						handle: snapHandle,
						initialSelectionPageBounds,
						isAspectRatioLocked,
						isResizingFromCenter: event.altKey,
						threshold: this.editor.snaps.getSnapThreshold(),
						viewportPageBounds: this.editor.getViewportPageBounds(),
					})
				: null
			const { guideIndicators, nudge } = guideSnap
				? resolveGuideSnap({
						guideSnap,
						shapeIndicators,
						shapeNudge: shapeSnap.nudge,
					})
				: { guideIndicators: [], nudge: shapeSnap.nudge }

			currentPagePoint.add(nudge)
			if (guideIndicators.length) {
				this.editor.snaps.setIndicators([...shapeIndicators, ...guideIndicators])
			}
		}

		const scaleOriginPage = Vec.RotWith(
			event.altKey ? selectionBounds.center : selectionBounds.getHandlePoint(scaleOriginHandle),
			selectionBounds.point,
			selectionRotation
		)

		const distanceFromScaleOriginNow = Vec.Sub(currentPagePoint, scaleOriginPage).rot(
			-selectionRotation
		)
		const distanceFromScaleOriginAtStart = Vec.Sub(originPagePoint, scaleOriginPage).rot(
			-selectionRotation
		)
		const scale = Vec.DivV(distanceFromScaleOriginNow, distanceFromScaleOriginAtStart)

		if (!Number.isFinite(scale.x)) scale.x = 1
		if (!Number.isFinite(scale.y)) scale.y = 1

		const isXLocked = dragHandle === 'top' || dragHandle === 'bottom'
		const isYLocked = dragHandle === 'left' || dragHandle === 'right'

		if (isAspectRatioLocked) {
			if (isYLocked) {
				scale.y = Math.abs(scale.x)
			} else if (isXLocked) {
				scale.x = Math.abs(scale.y)
			} else if (Math.abs(scale.x) > Math.abs(scale.y)) {
				scale.y = Math.abs(scale.x) * (scale.y < 0 ? -1 : 1)
			} else {
				scale.x = Math.abs(scale.y) * (scale.x < 0 ? -1 : 1)
			}
		} else {
			if (isXLocked) scale.x = 1
			if (isYLocked) scale.y = 1
		}

		this.updateCursor({
			dragHandle,
			isFlippedX: scale.x < 0,
			isFlippedY: scale.y < 0,
			rotation: selectionRotation,
		})

		for (const level of resizeLevels) {
			const changes: TLShapePartial[] = []

			for (const id of level) {
				const snapshot = shapeSnapshots.get(id)!
				const change = this.editor.getResizeShapePartial(id, scale, {
					dragHandle,
					initialBounds: snapshot.bounds,
					initialPageTransform: snapshot.pageTransform,
					initialShape: snapshot.shape,
					isAspectRatioLocked,
					mode:
						selectedShapeIds.length === 1 && id === selectedShapeIds[0]
							? 'resize_bounds'
							: 'scale_shape',
					scaleAxisRotation: selectionRotation,
					scaleOrigin: scaleOriginPage,
					skipStartAndEndCallbacks: true,
				})

				if (change) changes.push(this.context.workspaceBounds.clampShapePartial(this.editor, change))
			}

			if (changes.length > 0) this.editor.updateShapes(changes)
		}
	}

	private complete(event: PointerEvent) {
		if (this.snapshot) {
			this.updateShapes(event)
			kickoutOccludedShapes(this.editor, this.snapshot.selectedShapeIds)
			this.handleResizeEnd()
		}

		this.transitionTo(new IdleState(this.context))
	}

	private updateCursor({
		dragHandle,
		isFlippedX,
		isFlippedY,
		rotation,
	}: {
		dragHandle: ResizeHandle
		isFlippedX: boolean
		isFlippedY: boolean
		rotation: number
	}) {
		const prevCursor = this.editor.getInstanceState().cursor
		let nextCursorType = RESIZE_CURSORS[dragHandle]

		switch (dragHandle) {
			case 'top_left':
			case 'bottom_right': {
				nextCursorType = isFlippedX !== isFlippedY ? 'nesw-resize' : 'nwse-resize'
				break
			}
			case 'top_right':
			case 'bottom_left': {
				nextCursorType = isFlippedX !== isFlippedY ? 'nwse-resize' : 'nesw-resize'
				break
			}
		}

		if (nextCursorType === prevCursor.type && rotation === prevCursor.rotation) return
		this.editor.setCursor({ type: nextCursorType, rotation })
	}
}

function editorShouldSnapToGrid(editor: Editor, event: PointerEvent) {
	return editor.getInstanceState().isGridMode && !(event.ctrlKey || event.metaKey)
}
