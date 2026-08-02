import {
	Box,
	Vec,
	isShapeId,
	pointInPolygon,
	polygonsIntersect,
	type Editor,
	type TLPageId,
	type TLShape,
	type TLShapeId,
} from '@tldraw/editor'
import { IdleState, VueInteractionState, type VueEditorContext } from './types'

interface CanvasPointerInfo {
	originPagePoint: Vec
	pointerId: number
}

interface BrushInputState {
	ctrlKey: boolean
	currentPagePoint: Vec
	shiftKey: boolean
}

export interface BrushingSnapshot {
	excludedShapeIds: Set<TLShapeId>
	initialSelectedShapeIds: TLShapeId[]
	isWrapMode: boolean
	originPagePoint: Vec
}

export function getBrushingSnapshot(editor: Editor, originPagePoint: Vec): BrushingSnapshot {
	const selectLockedShapes = editor.options.selectLockedShapes
	const excludedShapeIds = new Set(
		editor
			.getCurrentPageShapes()
			.filter(
				(shape) =>
					editor.isShapeOfType(shape, 'group') ||
					(!selectLockedShapes && editor.isShapeOrAncestorLocked(shape))
			)
			.map((shape) => shape.id)
	)

	return {
		excludedShapeIds,
		initialSelectedShapeIds: editor.getSelectedShapeIds().slice(),
		isWrapMode: editor.user.getIsWrapMode(),
		originPagePoint,
	}
}

export class PointingCanvasState extends VueInteractionState {
	readonly id = 'pointing_canvas'

	constructor(
		context: VueEditorContext,
		private readonly info: CanvasPointerInfo & {
			accelKey: boolean
			shiftKey: boolean
		}
	) {
		super(context)
	}

	override onEnter() {
		const additiveSelectionKey = this.info.shiftKey || this.info.accelKey

		if (!additiveSelectionKey && this.editor.getSelectedShapeIds().length > 0) {
			this.editor.markHistoryStoppingPoint('selecting none')
			this.editor.selectNone()
		}
	}

	override onPointerMove(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId) return

		const currentPagePoint = this.context.getPagePoint(event)
		if (Vec.Dist(currentPagePoint, this.info.originPagePoint) < 1 / this.context.getCamera().z) {
			return
		}

		const brushing = new BrushingState(this.context, this.info)
		this.transitionTo(brushing)
		brushing.onPointerMove(event)
	}

	override onPointerUp(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId) return

		selectOnCanvasPointerUp(this.editor, this.context.getPagePoint(event), event)
		this.transitionTo(new IdleState(this.context))
	}
}

export class BrushingState extends VueInteractionState {
	readonly id = 'brushing'

	private currentInput: BrushInputState
	private snapshot: BrushingSnapshot
	private viewportDidChange = false

	constructor(
		context: VueEditorContext,
		private readonly info: CanvasPointerInfo
	) {
		super(context)
		this.snapshot = getBrushingSnapshot(context.editor, info.originPagePoint)
		this.currentInput = {
			ctrlKey: false,
			currentPagePoint: info.originPagePoint,
			shiftKey: false,
		}
	}

	override onEnter() {
		this.hitTestShapes(this.currentInput)
	}

	override onExit() {
		this.snapshot.initialSelectedShapeIds = []
		this.editor.updateInstanceState({ brush: null })
	}

	override onPointerMove(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId) return

		this.currentInput = {
			ctrlKey: event.ctrlKey,
			currentPagePoint: this.context.workspaceBounds.clampPoint(this.context.getPagePoint(event)),
			shiftKey: event.shiftKey,
		}
		this.hitTestShapes(this.currentInput)
	}

	override onPointerUp(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId) return
		this.complete()
	}

	override onKeyDown(event: KeyboardEvent) {
		this.currentInput = {
			...this.currentInput,
			ctrlKey: event.ctrlKey,
			shiftKey: event.shiftKey,
		}
		this.hitTestShapes(this.currentInput)
	}

	override onKeyUp(event: KeyboardEvent) {
		this.currentInput = {
			...this.currentInput,
			ctrlKey: event.ctrlKey,
			shiftKey: event.shiftKey,
		}
		this.hitTestShapes(this.currentInput)
	}

	override onCancel() {
		this.editor.setSelectedShapes(this.snapshot.initialSelectedShapeIds)
		this.transitionTo(new IdleState(this.context))
	}

	private complete() {
		this.hitTestShapes(this.currentInput)
		this.transitionTo(new IdleState(this.context))
	}

	private hitTestShapes(input: BrushInputState) {
		const { editor } = this
		const { excludedShapeIds, initialSelectedShapeIds, isWrapMode, originPagePoint } = this.snapshot

		const results = new Set(input.shiftKey ? initialSelectedShapeIds : [])
		const isWrapping = isWrapMode ? !input.ctrlKey : input.ctrlKey
		const brush = Box.FromPoints([originPagePoint, input.currentPagePoint])
		const { corners } = brush

		const candidateIds = editor.getShapeIdsInsideBounds(brush)

		if (candidateIds.size > 0) {
			const brushBoxIsInsideViewport = editor.getViewportPageBounds().contains(brush)
			const currentPageId = editor.getCurrentPageId()
			const allShapes =
				brushBoxIsInsideViewport && !this.viewportDidChange
					? editor.getCurrentPageRenderingShapesSorted()
					: editor.getCurrentPageShapesSorted()
			const shapesToHitTest = allShapes.filter((shape) => candidateIds.has(shape.id))

			testAllShapes: for (const shape of shapesToHitTest) {
				if (excludedShapeIds.has(shape.id) || results.has(shape.id)) continue testAllShapes

				const pageBounds = editor.getShapePageBounds(shape)
				if (!pageBounds) continue testAllShapes

				if (brush.contains(pageBounds)) {
					this.handleHit(shape, input.currentPagePoint, currentPageId, results, corners)
					continue testAllShapes
				}

				if (isWrapping || editor.isShapeFrameLike(shape)) {
					continue testAllShapes
				}

				if (brush.collides(pageBounds)) {
					const pageTransform = editor.getShapePageTransform(shape)
					if (!pageTransform) continue testAllShapes

					const localCorners = pageTransform.clone().invert().applyToPoints(corners)
					const geometry = editor.getShapeGeometry(shape)

					for (let i = 0; i < 4; i++) {
						const pointA = localCorners[i]
						const pointB = localCorners[(i + 1) % 4]
						if (geometry.hitTestLineSegment(pointA, pointB, 0)) {
							this.handleHit(shape, input.currentPagePoint, currentPageId, results, corners)
							continue testAllShapes
						}
					}
				}
			}
		}

		this.updateBrush(brush)
		this.updateSelectedShapes(results)
	}

	private updateBrush(brush: Box) {
		const currentBrush = this.editor.getInstanceState().brush
		if (!currentBrush || !brush.equals(currentBrush)) {
			this.editor.updateInstanceState({ brush: { ...brush.toJson() } })
		}
	}

	private updateSelectedShapes(results: Set<TLShapeId>) {
		const current = this.editor.getSelectedShapeIds()
		if (current.length !== results.size || current.some((id) => !results.has(id))) {
			this.editor.setSelectedShapes(Array.from(results))
		}
	}

	private handleHit(
		shape: TLShape,
		currentPagePoint: Vec,
		currentPageId: TLPageId,
		results: Set<TLShapeId>,
		corners: Vec[]
	) {
		if (shape.type === ('vue-material-section' as string)) {
			const hitShape = getMaterialInteractionShape(this.editor, shape)
			if (hitShape) results.add(hitShape.id)
			return
		}

		if (shape.parentId === currentPageId) {
			results.add(shape.id)
			return
		}

		const selectedShape = this.editor.getOutermostSelectableShape(shape)
		const pageMask = this.editor.getShapeMask(selectedShape.id)
		if (
			pageMask &&
			!polygonsIntersect(pageMask, corners) &&
			!pointInPolygon(currentPagePoint, pageMask)
		) {
			return
		}

		results.add(selectedShape.id)
	}
}

function getMaterialInteractionShape(editor: Editor, shape: TLShape) {
	if (shape.type !== ('vue-material-section' as string)) return shape
	if ((shape as TLShape & { props: { zone?: string } }).props.zone !== 'tableBody') return undefined
	const parent = editor.getShape(shape.parentId)
	return parent?.type === ('vue-material' as string) ? parent : undefined
}

function findMaterialInteractionShapeAtPoint(editor: Editor, point: Vec) {
	const margin = editor.getHitTestMargin()
	const shapes = editor.getCurrentPageShapesSorted()

	for (let i = shapes.length - 1; i >= 0; i--) {
		const shape = shapes[i]
		if (!shape || shape.type !== ('vue-material-section' as string)) continue
		if ((shape as TLShape & { props: { zone?: string } }).props.zone !== 'tableBody') continue
		if (editor.isShapeOrAncestorLocked(shape) && !editor.options.selectLockedShapes) continue
		if (!editor.isPointInShape(shape, point, { hitInside: true, margin })) continue
		return getMaterialInteractionShape(editor, shape)
	}

	return undefined
}

export function selectOnCanvasPointerUp(editor: Editor, currentPagePoint: Vec, event: MouseEvent) {
	const selectedShapeIds = editor.getSelectedShapeIds()
	const additiveSelectionKey = event.shiftKey || event.ctrlKey || event.metaKey

	const selectLockedShapes = editor.options.selectLockedShapes
	const rawHitShape = editor.getShapeAtPoint(currentPagePoint, {
		filter: (shape) => selectLockedShapes || !shape.isLocked,
		hitInside: false,
		hitLabels: true,
		hitLocked: selectLockedShapes,
		margin: editor.getHitTestMargin(),
		renderingOnly: true,
	})
	const hitShape = rawHitShape
		? getMaterialInteractionShape(editor, rawHitShape)
		: findMaterialInteractionShapeAtPoint(editor, currentPagePoint)

	if (hitShape) {
		const outermostSelectableShape = editor.getOutermostSelectableShape(hitShape)

		if (additiveSelectionKey && !event.altKey) {
			if (selectedShapeIds.includes(outermostSelectableShape.id)) {
				editor.markHistoryStoppingPoint('deselecting shape')
				editor.deselect(outermostSelectableShape)
			} else {
				editor.markHistoryStoppingPoint('shift selecting shape')
				editor.setSelectedShapes([...selectedShapeIds, outermostSelectableShape.id])
			}
			return
		}

		let shapeToSelect: TLShape | undefined
		if (outermostSelectableShape === hitShape) {
			shapeToSelect = hitShape
		} else if (
			outermostSelectableShape.id === editor.getFocusedGroupId() ||
			selectedShapeIds.includes(outermostSelectableShape.id)
		) {
			shapeToSelect = hitShape
		} else {
			shapeToSelect = outermostSelectableShape
		}

		if (shapeToSelect && !selectedShapeIds.includes(shapeToSelect.id)) {
			editor.markHistoryStoppingPoint('selecting shape')
			editor.select(shapeToSelect.id)
		}
		return
	}

	if (additiveSelectionKey) return

	if (selectedShapeIds.length > 0) {
		editor.markHistoryStoppingPoint('selecting none')
		editor.selectNone()
	}

	const focusedGroupId = editor.getFocusedGroupId()
	if (isShapeId(focusedGroupId)) {
		const groupShape = editor.getShape(focusedGroupId)
		if (groupShape && !editor.isPointInShape(groupShape, currentPagePoint, { margin: 0, hitInside: true })) {
			editor.setFocusedGroup(null)
		}
	}
}
