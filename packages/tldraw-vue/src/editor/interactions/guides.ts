import {
	Box,
	Vec,
	type PointsSnapIndicator,
	type SelectionCorner,
	type SelectionEdge,
	type SnapIndicator,
	type VecLike,
} from '@tldraw/editor'
import type { WorkspaceCamera, WorkspacePageBounds, WorkspaceViewportSize } from './WorkspaceBoundsManager'

export type GuideAxis = 'x' | 'y'

export interface WorkspaceGuide {
	axis: GuideAxis
	id: string
	position: number
}

export interface GuideLineSegment {
	axis: GuideAxis
	id: string
	x1: number
	x2: number
	y1: number
	y2: number
}

export interface GuideScreenMarker {
	axis: GuideAxis
	id: string
	label: string
	left: number
	top: number
}

export interface GuideSnapResult {
	hasX: boolean
	hasY: boolean
	indicators: GuideSnapIndicator[]
	nudge: Vec
}

export interface GuideSnapIndicator {
	axis: GuideAxis
	indicator: PointsSnapIndicator
}

type ResizeHandleForGuides = SelectionCorner | SelectionEdge

const GUIDE_ID_PRECISION = 1000
const GUIDE_LABEL_PRECISION = 10
const SNAP_AXIS_EPSILON = 0.0001

export function createGuideId(axis: GuideAxis, position: number) {
	return `guide:${axis}:${Math.round(position * GUIDE_ID_PRECISION)}`
}

export function isGuideInsidePage(guide: Pick<WorkspaceGuide, 'axis' | 'position'>, page: WorkspacePageBounds) {
	return guide.axis === 'x'
		? guide.position >= page.x && guide.position <= page.x + page.w
		: guide.position >= page.y && guide.position <= page.y + page.h
}

export function getViewportPageBounds(camera: WorkspaceCamera, viewport: WorkspaceViewportSize): WorkspacePageBounds {
	if (camera.z <= 0) return { x: -camera.x, y: -camera.y, w: 0, h: 0 }
	return {
		x: -camera.x,
		y: -camera.y,
		w: viewport.w / camera.z,
		h: viewport.h / camera.z,
	}
}

export function getGuideLineSegments(
	guides: readonly WorkspaceGuide[],
	camera: WorkspaceCamera,
	viewport: WorkspaceViewportSize
): GuideLineSegment[] {
	const visible = getViewportPageBounds(camera, viewport)
	return guides.map((guide) =>
		guide.axis === 'x'
			? {
					axis: guide.axis,
					id: guide.id,
					x1: guide.position,
					x2: guide.position,
					y1: visible.y,
					y2: visible.y + visible.h,
				}
			: {
					axis: guide.axis,
					id: guide.id,
					x1: visible.x,
					x2: visible.x + visible.w,
					y1: guide.position,
					y2: guide.position,
				}
	)
}

export function getGuideScreenMarkers({
	camera,
	guides,
	pxPerMm,
	rulerSize,
	viewport,
}: {
	camera: WorkspaceCamera
	guides: readonly WorkspaceGuide[]
	pxPerMm: number
	rulerSize: number
	viewport: WorkspaceViewportSize
}): GuideScreenMarker[] {
	return guides
		.map((guide): GuideScreenMarker | null => {
			const label = formatGuideLabel(guide.position / pxPerMm)
			if (guide.axis === 'x') {
				const left = (guide.position + camera.x) * camera.z
				if (left < rulerSize || left > viewport.w) return null
				return {
					axis: guide.axis,
					id: guide.id,
					label,
					left,
					top: rulerSize + 2,
				}
			}

			const top = (guide.position + camera.y) * camera.z
			if (top < rulerSize || top > viewport.h) return null
			return {
				axis: guide.axis,
				id: guide.id,
				label,
				left: rulerSize + 2,
				top,
			}
		})
		.filter((marker): marker is GuideScreenMarker => marker !== null)
}

export function snapTranslateToGuides({
	dragDelta,
	guides,
	initialSelectionSnapPoints,
	lockedAxis,
	threshold,
	viewportPageBounds,
}: {
	dragDelta: VecLike
	guides: readonly WorkspaceGuide[]
	initialSelectionSnapPoints: readonly VecLike[]
	lockedAxis: GuideAxis | null
	threshold: number
	viewportPageBounds: WorkspacePageBounds
}): GuideSnapResult {
	const selectionSnapPoints = initialSelectionSnapPoints.map((point) => ({
		x: point.x + dragDelta.x,
		y: point.y + dragDelta.y,
	}))
	return snapPointsToGuides({
		guides,
		lockedAxis,
		selectionSnapPoints,
		threshold,
		viewportPageBounds,
	})
}

export function snapResizeToGuides({
	dragDelta,
	guides,
	handle: originalHandle,
	initialSelectionPageBounds,
	isAspectRatioLocked,
	isResizingFromCenter,
	threshold,
	viewportPageBounds,
}: {
	dragDelta: VecLike
	guides: readonly WorkspaceGuide[]
	handle: ResizeHandleForGuides
	initialSelectionPageBounds: Box
	isAspectRatioLocked: boolean
	isResizingFromCenter: boolean
	threshold: number
	viewportPageBounds: WorkspacePageBounds
}): GuideSnapResult {
	const {
		box: unsnappedResizedPageBounds,
		scaleX,
		scaleY,
	} = Box.Resize(
		initialSelectionPageBounds,
		originalHandle,
		isResizingFromCenter ? dragDelta.x * 2 : dragDelta.x,
		isResizingFromCenter ? dragDelta.y * 2 : dragDelta.y,
		isAspectRatioLocked
	)

	let handle = originalHandle
	if (scaleX < 0) handle = flipResizeHandleX(handle)
	if (scaleY < 0) handle = flipResizeHandleY(handle)

	if (isResizingFromCenter) {
		unsnappedResizedPageBounds.center = initialSelectionPageBounds.center
	}

	const isXLocked = handle === 'top' || handle === 'bottom'
	const isYLocked = handle === 'left' || handle === 'right'
	const snap = snapPointsToGuides({
		guides,
		lockedAxis: null,
		selectionSnapPoints: getResizeSnapPointsForGuideHandle(handle, unsnappedResizedPageBounds),
		threshold,
		viewportPageBounds,
	})

	if (isXLocked) {
		snap.hasX = false
		snap.nudge.x = 0
	}
	if (isYLocked) {
		snap.hasY = false
		snap.nudge.y = 0
	}

	if (isAspectRatioLocked && isGuideResizeCorner(handle) && (snap.hasX || snap.hasY)) {
		const primaryAxis: GuideAxis =
			snap.hasX && snap.hasY
				? Math.abs(snap.nudge.x) <= Math.abs(snap.nudge.y)
					? 'x'
					: 'y'
				: snap.hasX
					? 'x'
					: 'y'
		const ratio = initialSelectionPageBounds.aspectRatio

		if (primaryAxis === 'x') {
			snap.hasY = false
			snap.indicators = snap.indicators.filter(({ axis }) => axis === 'x')
			snap.nudge.y = snap.nudge.x / ratio
			if (handle === 'bottom_left' || handle === 'top_right') {
				snap.nudge.y = -snap.nudge.y
			}
		} else {
			snap.hasX = false
			snap.indicators = snap.indicators.filter(({ axis }) => axis === 'y')
			snap.nudge.x = snap.nudge.y * ratio
			if (handle === 'bottom_left' || handle === 'top_right') {
				snap.nudge.x = -snap.nudge.x
			}
		}
	}

	return snap
}

export function resolveGuideSnap({
	guideSnap,
	shapeIndicators,
	shapeNudge,
}: {
	guideSnap: GuideSnapResult
	shapeIndicators: readonly SnapIndicator[]
	shapeNudge: Vec
}) {
	const activeShapeAxes = getSnapIndicatorAxes(shapeIndicators)
	const nudge = shapeNudge.clone()
	const guideAxes = new Set<GuideAxis>()

	if (
		guideSnap.hasX &&
		(!activeShapeAxes.has('x') || Math.abs(guideSnap.nudge.x) <= Math.abs(shapeNudge.x))
	) {
		nudge.x = guideSnap.nudge.x
		guideAxes.add('x')
	}

	if (
		guideSnap.hasY &&
		(!activeShapeAxes.has('y') || Math.abs(guideSnap.nudge.y) <= Math.abs(shapeNudge.y))
	) {
		nudge.y = guideSnap.nudge.y
		guideAxes.add('y')
	}

	return {
		guideIndicators: guideSnap.indicators
			.filter(({ axis }) => guideAxes.has(axis))
			.map(({ indicator }) => indicator),
		nudge,
	}
}

function snapPointsToGuides({
	guides,
	lockedAxis,
	selectionSnapPoints,
	threshold,
	viewportPageBounds,
}: {
	guides: readonly WorkspaceGuide[]
	lockedAxis: GuideAxis | null
	selectionSnapPoints: readonly VecLike[]
	threshold: number
	viewportPageBounds: WorkspacePageBounds
}): GuideSnapResult {
	let snapX: GuideAxisSnap | null = null
	let snapY: GuideAxisSnap | null = null

	for (const guide of guides) {
		if (guide.axis === 'x' && lockedAxis !== 'x') {
			for (const point of selectionSnapPoints) {
				const nudge = guide.position - point.x
				const distance = Math.abs(nudge)
				if (distance <= threshold && (!snapX || distance < snapX.distance)) {
					snapX = { distance, guide, nudge }
				}
			}
		}

		if (guide.axis === 'y' && lockedAxis !== 'y') {
			for (const point of selectionSnapPoints) {
				const nudge = guide.position - point.y
				const distance = Math.abs(nudge)
				if (distance <= threshold && (!snapY || distance < snapY.distance)) {
					snapY = { distance, guide, nudge }
				}
			}
		}
	}

	return {
		hasX: snapX !== null,
		hasY: snapY !== null,
		indicators: [snapX, snapY]
			.filter((snap): snap is GuideAxisSnap => snap !== null)
			.map((snap) => ({
				axis: snap.guide.axis,
				indicator: createGuideSnapIndicator(snap.guide, viewportPageBounds),
			})),
		nudge: new Vec(snapX?.nudge ?? 0, snapY?.nudge ?? 0),
	}
}

interface GuideAxisSnap {
	distance: number
	guide: WorkspaceGuide
	nudge: number
}

function createGuideSnapIndicator(
	guide: WorkspaceGuide,
	viewportPageBounds: WorkspacePageBounds
): PointsSnapIndicator {
	return {
		id: `guide-snap:${guide.id}`,
		type: 'points',
		points:
			guide.axis === 'x'
				? [
						{ x: guide.position, y: viewportPageBounds.y },
						{ x: guide.position, y: viewportPageBounds.y + viewportPageBounds.h },
					]
				: [
						{ x: viewportPageBounds.x, y: guide.position },
						{ x: viewportPageBounds.x + viewportPageBounds.w, y: guide.position },
					],
	}
}

function getResizeSnapPointsForGuideHandle(handle: ResizeHandleForGuides, bounds: Box): VecLike[] {
	const { minX, maxX, minY, maxY } = bounds
	const result: VecLike[] = []

	switch (handle) {
		case 'top':
		case 'left':
		case 'top_left':
			result.push({ x: minX, y: minY })
			break
	}

	switch (handle) {
		case 'top':
		case 'right':
		case 'top_right':
			result.push({ x: maxX, y: minY })
			break
	}

	switch (handle) {
		case 'bottom':
		case 'right':
		case 'bottom_right':
			result.push({ x: maxX, y: maxY })
			break
	}

	switch (handle) {
		case 'bottom':
		case 'left':
		case 'bottom_left':
			result.push({ x: minX, y: maxY })
			break
	}

	return result
}

function getSnapIndicatorAxes(indicators: readonly SnapIndicator[]) {
	const axes = new Set<GuideAxis>()

	for (const indicator of indicators) {
		if (indicator.type === 'gaps') {
			axes.add(indicator.direction === 'horizontal' ? 'x' : 'y')
			continue
		}

		if (indicator.points.length < 2) continue
		const first = indicator.points[0]
		const sameX = indicator.points.every((point) => Math.abs(point.x - first.x) < SNAP_AXIS_EPSILON)
		const sameY = indicator.points.every((point) => Math.abs(point.y - first.y) < SNAP_AXIS_EPSILON)
		if (sameX) axes.add('x')
		if (sameY) axes.add('y')
	}

	return axes
}

function flipResizeHandleX(handle: ResizeHandleForGuides): ResizeHandleForGuides {
	switch (handle) {
		case 'left':
			return 'right'
		case 'right':
			return 'left'
		case 'top_left':
			return 'top_right'
		case 'top_right':
			return 'top_left'
		case 'bottom_right':
			return 'bottom_left'
		case 'bottom_left':
			return 'bottom_right'
		default:
			return handle
	}
}

function flipResizeHandleY(handle: ResizeHandleForGuides): ResizeHandleForGuides {
	switch (handle) {
		case 'top':
			return 'bottom'
		case 'bottom':
			return 'top'
		case 'top_left':
			return 'bottom_left'
		case 'top_right':
			return 'bottom_right'
		case 'bottom_right':
			return 'top_right'
		case 'bottom_left':
			return 'top_left'
		default:
			return handle
	}
}

function isGuideResizeCorner(handle: ResizeHandleForGuides): handle is SelectionCorner {
	return (
		handle === 'top_left' ||
		handle === 'top_right' ||
		handle === 'bottom_right' ||
		handle === 'bottom_left'
	)
}

function formatGuideLabel(value: number) {
	const rounded = Math.round(value * GUIDE_LABEL_PRECISION) / GUIDE_LABEL_PRECISION
	return Math.abs(Math.round(rounded) - rounded) < 0.0001 ? String(Math.round(rounded)) : String(rounded)
}
