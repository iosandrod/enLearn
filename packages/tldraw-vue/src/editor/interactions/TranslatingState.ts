import {
	Mat,
	PageRecordType,
	Vec,
	kickoutOccludedShapes,
	type BoundsSnapPoint,
	type Editor,
	type MatModel,
	type TLShape,
	type TLShapeId,
	type TLShapePartial,
	type VecLike,
} from '@tldraw/editor'
import {
	resolveGuideSnap,
	snapTranslateToGuides,
	type WorkspaceGuide,
} from './guides'
import { IdleState, VueInteractionState, type VueEditorContext } from './types'
import type { WorkspaceBoundsManager } from './WorkspaceBoundsManager'

type PageBounds = NonNullable<ReturnType<Editor['getShapePageBounds']>>

export interface MovingShapeSnapshot {
	shape: TLShape
	pagePoint: Vec
	pageBounds: PageBounds
	pageRotation: number
	parentTransform: MatModel | null
}

export interface TranslatingSnapshot {
	averagePagePoint: Vec
	initialPageBounds: NonNullable<ReturnType<Editor['getSelectionPageBounds']>>
	initialSnapPoints: BoundsSnapPoint[]
	movingShapes: TLShape[]
	shapeSnapshots: MovingShapeSnapshot[]
}

export function getTranslatingSnapshot(editor: Editor): TranslatingSnapshot | null {
	const movingShapes: TLShape[] = []
	const pagePoints: Vec[] = []

	const shapeSnapshots = editor
		.getSelectedShapeIds()
		.map((id): MovingShapeSnapshot | null => {
			const shape = editor.getShape(id)
			const pageTransform = editor.getShapePageTransform(id)
			if (!shape || !pageTransform) return null

			const pageBounds = editor.getShapePageBounds(shape)
			if (!pageBounds) return null

			const pagePoint = pageTransform.point()
			movingShapes.push(shape)
			pagePoints.push(pagePoint)

			return {
				shape,
				pagePoint,
				pageBounds,
				pageRotation: pageTransform.rotation(),
				parentTransform: PageRecordType.isId(shape.parentId)
					? null
					: Mat.Inverse(editor.getShapePageTransform(shape.parentId)!),
			}
		})
		.filter((snapshot): snapshot is MovingShapeSnapshot => snapshot !== null)

	const initialPageBounds = editor.getSelectionPageBounds()
	if (!initialPageBounds || shapeSnapshots.length === 0) return null

	const onlySelectedShape = editor.getOnlySelectedShape()
	let initialSnapPoints: BoundsSnapPoint[] = []

	if (onlySelectedShape) {
		initialSnapPoints = editor.snaps.shapeBounds.getSnapPoints(onlySelectedShape.id)
	} else {
		initialSnapPoints = initialPageBounds.cornersAndCenter.map((point, index) => ({
			id: 'selection:' + index,
			x: point.x,
			y: point.y,
		}))
	}

	return {
		averagePagePoint: Vec.Average(pagePoints),
		initialPageBounds,
		initialSnapPoints,
		movingShapes,
		shapeSnapshots,
	}
}

export function moveShapesToPoint({
	accelKey,
	currentPagePoint,
	editor,
	guides = [],
	originPagePoint,
	shiftKey,
	shouldSnap,
	snapshot,
	workspaceBounds,
}: {
	accelKey: boolean
	currentPagePoint: VecLike
	editor: Editor
	guides?: readonly WorkspaceGuide[]
	originPagePoint: VecLike
	shiftKey: boolean
	shouldSnap: boolean
	snapshot: TranslatingSnapshot
	workspaceBounds?: WorkspaceBoundsManager
}) {
	const {
		averagePagePoint,
		initialPageBounds,
		initialSnapPoints,
		shapeSnapshots,
	} = snapshot
	const delta = Vec.Sub(currentPagePoint, originPagePoint)

	const lockedAxis: 'x' | 'y' | null = shiftKey
		? Math.abs(delta.x) < Math.abs(delta.y)
			? 'x'
			: 'y'
		: null

	if (lockedAxis === 'x') {
		delta.x = 0
	} else if (lockedAxis === 'y') {
		delta.y = 0
	}

	editor.snaps.clearIndicators()

	if (shouldSnap) {
		const shapeSnap = editor.snaps.shapeBounds.snapTranslateShapes({
			dragDelta: delta,
			initialSelectionPageBounds: initialPageBounds,
			initialSelectionSnapPoints: initialSnapPoints,
			lockedAxis,
		})
		const shapeIndicators = editor.snaps.getIndicators()
		const guideSnap = guides.length
			? snapTranslateToGuides({
					dragDelta: delta,
					guides,
					initialSelectionSnapPoints: initialSnapPoints,
					lockedAxis,
					threshold: editor.snaps.getSnapThreshold(),
					viewportPageBounds: editor.getViewportPageBounds(),
				})
			: null
		const { guideIndicators, nudge } = guideSnap
			? resolveGuideSnap({
					guideSnap,
					shapeIndicators,
					shapeNudge: shapeSnap.nudge,
				})
			: { guideIndicators: [], nudge: shapeSnap.nudge }

		delta.add(nudge)
		if (guideIndicators.length) {
			editor.snaps.setIndicators([...shapeIndicators, ...guideIndicators])
		}
	}

	const averageSnappedPoint = Vec.Add(averagePagePoint, delta)
	const snapIndicators = editor.snaps.getIndicators()

	if (editor.getInstanceState().isGridMode && !accelKey && snapIndicators.length === 0) {
		averageSnappedPoint.snapToGrid(editor.getDocumentSettings().gridSize)
	}

	const averageSnap = workspaceBounds
		? workspaceBounds.clampDeltaForBounds(initialPageBounds, Vec.Sub(averageSnappedPoint, averagePagePoint))
		: Vec.Sub(averageSnappedPoint, averagePagePoint)

	const { constrainedShapeDeltas, lockedFrameChildIds } = getHardFrameMovementConstraints(
		editor,
		snapshot,
		averageSnap
	)

	const normalChanges: TLShapePartial[] = []
	const lockedFrameChildChanges: TLShapePartial[] = []

	for (const { shape, pagePoint, parentTransform } of shapeSnapshots) {
		if (shape.isLocked) continue

		const shapeSnap = constrainedShapeDeltas.get(shape.id) ?? averageSnap
		const newPagePoint = Vec.Add(pagePoint, shapeSnap)
		const newLocalPoint = parentTransform
			? Mat.applyToPoint(parentTransform, newPagePoint)
			: newPagePoint

		const change: TLShapePartial = {
			id: shape.id,
			type: shape.type,
			x: newLocalPoint.x,
			y: newLocalPoint.y,
		}

		if (lockedFrameChildIds.has(shape.id)) {
			lockedFrameChildChanges.push(change)
		} else {
			normalChanges.push(change)
		}
	}

	if (normalChanges.length > 0) editor.updateShapes(normalChanges)
	if (lockedFrameChildChanges.length > 0) {
		editor.run(() => editor.updateShapes(lockedFrameChildChanges), { ignoreShapeLock: true })
	}
}

function getHardFrameMovementConstraints(
	editor: Editor,
	snapshot: TranslatingSnapshot,
	requestedDelta: Vec
) {
	const movingShapeIds = new Set<TLShapeId>(snapshot.movingShapes.map((shape) => shape.id))
	const constrainedDeltas = new Map<TLShapeId, Vec>()
	const lockedFrameChildIds = new Set<TLShapeId>()
	const frameGroups = new Map<
		TLShapeId,
		{
			frameBounds: PageBounds
			movingBounds: PageBounds
			snapshots: MovingShapeSnapshot[]
		}
	>()

	for (const shapeSnapshot of snapshot.shapeSnapshots) {
		const { shape } = shapeSnapshot
		if (PageRecordType.isId(shape.parentId)) continue

		const parent = editor.getShape(shape.parentId)
		if (!parent || movingShapeIds.has(parent.id)) continue
		if (!isHardFrameParent(editor, parent, shape)) continue

		const frameBounds = editor.getShapePageBounds(parent)
		if (!frameBounds) continue
		if (parent.isLocked) lockedFrameChildIds.add(shape.id)

		let group = frameGroups.get(parent.id)
		if (!group) {
			group = {
				frameBounds,
				movingBounds: shapeSnapshot.pageBounds.clone(),
				snapshots: [],
			}
			frameGroups.set(parent.id, group)
		} else {
			group.movingBounds.union(shapeSnapshot.pageBounds)
		}

		group.snapshots.push(shapeSnapshot)
	}

	for (const group of frameGroups.values()) {
		const constrainedDelta = clampDeltaToBounds(group.movingBounds, requestedDelta, group.frameBounds)
		for (const shapeSnapshot of group.snapshots) {
			constrainedDeltas.set(shapeSnapshot.shape.id, constrainedDelta)
		}
	}

	return { constrainedShapeDeltas: constrainedDeltas, lockedFrameChildIds }
}

function isHardFrameParent(editor: Editor, parent: TLShape, child: TLShape) {
	const parentUtil = editor.getShapeUtil(parent)
	return parentUtil.isFrameLike(parent) && !parentUtil.canRemoveChildrenOfType(parent, child.type)
}

function clampDeltaToBounds(bounds: PageBounds, delta: Vec, containerBounds: PageBounds) {
	return new Vec(
		clampAxisDelta(delta.x, containerBounds.minX - bounds.minX, containerBounds.maxX - bounds.maxX),
		clampAxisDelta(delta.y, containerBounds.minY - bounds.minY, containerBounds.maxY - bounds.maxY)
	)
}

function clampAxisDelta(delta: number, minDelta: number, maxDelta: number) {
	const low = Math.min(minDelta, maxDelta)
	const high = Math.max(minDelta, maxDelta)
	return Math.min(Math.max(delta, low), high)
}

function getMaterialInteractionShape(editor: Editor, shape: TLShape) {
	if (shape.type !== ('vue-material-section' as string)) return shape
	if ((shape as TLShape & { props: { zone?: string } }).props.zone !== 'tableBody') return undefined
	const parent = editor.getShape(shape.parentId)
	return parent?.type === ('vue-material' as string) ? parent : undefined
}

export function reparentDroppedShapesToFrameLikeParents(editor: Editor, movingShapes: TLShape[]) {
	if (movingShapes.length === 0) return

	const movingShapeIds = new Set<TLShapeId>(movingShapes.map((shape) => shape.id))
	const sortedShapes = editor.getCurrentPageShapesSorted()
	const candidateParents = sortedShapes.filter((shape) => {
		if (movingShapeIds.has(shape.id)) return false
		return editor.getShapeUtil(shape).isFrameLike(shape)
	})

	if (candidateParents.length === 0) return

	const reparenting = new Map<TLShapeId, TLShapeId[]>()

	for (const movingShape of movingShapes) {
		const currentShape = editor.getShape(movingShape.id)
		if (!currentShape || currentShape.isLocked) continue

		const currentBounds = editor.getShapePageBounds(currentShape)
		if (!currentBounds) continue

		for (let i = candidateParents.length - 1; i >= 0; i--) {
			const parent = candidateParents[i]
			if (currentShape.parentId === parent.id) break
			if (editor.hasAncestor(parent, currentShape.id)) continue

			const parentUtil = editor.getShapeUtil(parent)
			if (!parentUtil.canReceiveNewChildrenOfType(parent, currentShape.type)) continue

			const parentBounds = editor.getShapePageBounds(parent)
			if (!parentBounds?.contains(currentBounds)) continue

			const childIds = reparenting.get(parent.id) ?? []
			childIds.push(currentShape.id)
			reparenting.set(parent.id, childIds)
			break
		}
	}

	if (reparenting.size === 0) return

	editor.run(() => {
		for (const [parentId, childIds] of reparenting) {
			editor.reparentShapes(childIds, parentId)
		}
	})
}

export class PointingShapeState extends VueInteractionState {
	readonly id = 'pointing_shape'

	constructor(
		context: VueEditorContext,
		private readonly info: {
			didSelectOnEnter?: boolean
			hitShape?: TLShape
			hitShapeForPointerUp?: TLShape
			originPagePoint: Vec
			pointerId: number
		}
	) {
		super(context)
	}

	override onPointerMove(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId) return

		const currentPagePoint = this.context.getPagePoint(event)
		if (Vec.Dist(currentPagePoint, this.info.originPagePoint) < 1 / this.context.getCamera().z) {
			return
		}

		const translating = new TranslatingState(this.context, this.info)
		this.transitionTo(translating)
		translating.onPointerMove(event)
	}

	override onPointerUp(event: PointerEvent) {
		if (event.pointerId !== this.info.pointerId) return
		this.selectOnPointerUp(event)
		this.transitionTo(new IdleState(this.context))
	}

	private selectOnPointerUp(event: PointerEvent) {
		const { hitShape: initialHitShape, hitShapeForPointerUp } = this.info
		if (!initialHitShape) return

		const selectedShapeIds = this.editor.getSelectedShapeIds()
		const focusedGroupId = this.editor.getFocusedGroupId()
		const currentPagePoint = this.context.getPagePoint(event)
		const additiveSelectionKey = event.shiftKey || event.ctrlKey || event.metaKey

		const rawHitShapeAtPoint =
			this.editor.getShapeAtPoint(currentPagePoint, {
				hitInside: true,
				margin: this.editor.getHitTestMargin(),
				renderingOnly: true,
			}) ?? initialHitShape
		const hitShapeAtPoint =
			getMaterialInteractionShape(this.editor, rawHitShapeAtPoint) ?? initialHitShape
		const hitShape =
			selectedShapeIds.includes(hitShapeAtPoint.id) &&
			this.editor.hasAncestor(initialHitShape, hitShapeAtPoint.id)
				? initialHitShape
				: hitShapeAtPoint

		if (!this.editor.getShape(hitShape.id)) return

		const selectingShape = this.editor.getOutermostSelectableShape(hitShape) ?? hitShapeForPointerUp

		if (selectingShape?.id === focusedGroupId) {
			if (selectedShapeIds.length > 0) {
				this.editor.markHistoryStoppingPoint('clearing shape ids')
				this.editor.setSelectedShapes([])
			} else {
				this.editor.popFocusedGroupId()
			}
			return
		}

		if (this.info.didSelectOnEnter) return

		const outermostSelectableShape = this.editor.getOutermostSelectableShape(
			hitShape,
			(parent) => !selectedShapeIds.includes(parent.id)
		)

		if (selectedShapeIds.includes(outermostSelectableShape.id)) {
			if (additiveSelectionKey) {
				this.editor.markHistoryStoppingPoint('deselecting on pointer up')
				this.editor.deselect(selectingShape)
			} else if (selectedShapeIds.includes(selectingShape.id)) {
				this.editor.markHistoryStoppingPoint('selecting on pointer up')
				this.editor.select(selectingShape.id)
			} else {
				this.editor.markHistoryStoppingPoint('selecting on pointer up')
				this.editor.select(selectingShape)
			}
			return
		}

		if (additiveSelectionKey) {
			const ancestors = this.editor.getShapeAncestors(outermostSelectableShape)
			const ancestorIds = new Set<TLShapeId>(ancestors.map((ancestor) => ancestor.id))

			this.editor.markHistoryStoppingPoint('shift deselecting on pointer up')
			this.editor.setSelectedShapes([
				...this.editor.getSelectedShapeIds().filter((id) => !ancestorIds.has(id)),
				outermostSelectableShape.id,
			])
			return
		}

		this.editor.markHistoryStoppingPoint('selecting on pointer up')
		this.editor.setSelectedShapes([outermostSelectableShape.id])
	}
}

export class TranslatingState extends VueInteractionState {
	readonly id = 'translating'

	private readonly markId: string
	private readonly snapshot: TranslatingSnapshot | null

	constructor(
		context: VueEditorContext,
		private readonly info: {
			originPagePoint: Vec
			pointerId: number
		}
	) {
		super(context)
		this.markId = context.editor.markHistoryStoppingPoint('translating')
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
		if (!this.snapshot) {
			this.transitionTo(new IdleState(this.context))
			return
		}

		for (const shape of this.snapshot.movingShapes) {
			const current = this.editor.getShape(shape.id)
			if (!current) continue
			this.editor.getShapeUtil(shape).onTranslateCancel?.(shape, current)
		}

		this.editor.bailToMark(this.markId)
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
			reparentDroppedShapesToFrameLikeParents(this.editor, this.snapshot.movingShapes)
		}

		this.transitionTo(new IdleState(this.context))
	}
}
