import { Vec, type Editor, type TLShapePartial, type VecLike } from '@tldraw/editor'

export interface WorkspacePageBounds {
	x: number
	y: number
	w: number
	h: number
}

export interface WorkspacePageSizeMm {
	w: number
	h: number
}

export interface WorkspaceViewportSize {
	w: number
	h: number
}

export interface WorkspaceCamera {
	x: number
	y: number
	z: number
}

export type RulerAxis = 'x' | 'y'

export interface RulerTick {
	id: string
	label: string | null
	position: number
	strength: 'minor' | 'middle' | 'major'
}

const DEFAULT_CAMERA_MARGIN_PX = 96
const DEFAULT_MIN_SHAPE_SIZE = 28
const DEFAULT_PX_PER_MM = 10
const TARGET_MAJOR_TICK_PX = 80
const MIN_PAGE_SIZE_MM = 10
const MAX_PAGE_SIZE_MM = 1000

export const DEFAULT_WORKSPACE_PAGE_SIZE_MM: WorkspacePageSizeMm = {
	w: 80,
	h: 80,
}

export class WorkspaceBoundsManager {
	private pageBounds: WorkspacePageBounds
	private pageSizeMm: WorkspacePageSizeMm

	constructor(
		pageSizeMm: WorkspacePageSizeMm = DEFAULT_WORKSPACE_PAGE_SIZE_MM,
		private readonly options = {
			cameraMarginPx: DEFAULT_CAMERA_MARGIN_PX,
			minShapeSize: DEFAULT_MIN_SHAPE_SIZE,
			pxPerMm: DEFAULT_PX_PER_MM,
		}
	) {
		this.pageSizeMm = normalizePageSizeMm(pageSizeMm)
		this.pageBounds = this.createPageBounds(this.pageSizeMm)
	}

	getPageBounds(): WorkspacePageBounds {
		return { ...this.pageBounds }
	}

	getPageSizeMm(): WorkspacePageSizeMm {
		return { ...this.pageSizeMm }
	}

	getPxPerMm() {
		return this.options.pxPerMm
	}

	setPageSizeMm(size: WorkspacePageSizeMm) {
		this.pageSizeMm = normalizePageSizeMm(size)
		this.pageBounds = this.createPageBounds(this.pageSizeMm)
	}

	containsPoint(point: VecLike) {
		const { x, y, w, h } = this.pageBounds
		return point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h
	}

	clampPoint(point: VecLike) {
		const { x, y, w, h } = this.pageBounds
		return new Vec(clamp(point.x, x, x + w), clamp(point.y, y, y + h))
	}

	clampRect(rect: WorkspacePageBounds, minW = this.options.minShapeSize, minH = minW) {
		const page = this.pageBounds
		const w = Math.min(Math.max(rect.w, minW), page.w)
		const h = Math.min(Math.max(rect.h, minH), page.h)

		return {
			x: clamp(rect.x, page.x, page.x + page.w - w),
			y: clamp(rect.y, page.y, page.y + page.h - h),
			w,
			h,
		}
	}

	clampDeltaForBounds(bounds: WorkspacePageBounds, delta: VecLike) {
		const page = this.pageBounds
		const minX = page.x - bounds.x
		const maxX = page.x + page.w - (bounds.x + bounds.w)
		const minY = page.y - bounds.y
		const maxY = page.y + page.h - (bounds.y + bounds.h)

		return new Vec(
			clampWithCollapsedRange(delta.x, minX, maxX),
			clampWithCollapsedRange(delta.y, minY, maxY)
		)
	}

	clampCamera(camera: WorkspaceCamera, viewport: WorkspaceViewportSize): WorkspaceCamera {
		if (viewport.w <= 0 || viewport.h <= 0 || camera.z <= 0) return camera

		const page = this.pageBounds
		const margin = this.options.cameraMarginPx / camera.z
		const minX = viewport.w / camera.z - (page.x + page.w + margin)
		const maxX = -page.x + margin
		const minY = viewport.h / camera.z - (page.y + page.h + margin)
		const maxY = -page.y + margin

		return {
			x: clampWithCollapsedRange(camera.x, minX, maxX),
			y: clampWithCollapsedRange(camera.y, minY, maxY),
			z: camera.z,
		}
	}

	getCenteredCamera(viewport: WorkspaceViewportSize, zoom = 1): WorkspaceCamera {
		const page = this.pageBounds
		return this.clampCamera(
			{
				x: viewport.w / (2 * zoom) - (page.x + page.w / 2),
				y: viewport.h / (2 * zoom) - (page.y + page.h / 2),
				z: zoom,
			},
			viewport
		)
	}

	clampShapePartial(editor: Editor, partial: TLShapePartial): TLShapePartial {
		const shape = editor.getShape(partial.id)
		if (!shape) return partial

		const shapeProps = shape.props as { w?: number; h?: number }
		if (typeof shapeProps.w !== 'number' || typeof shapeProps.h !== 'number') return partial

		const partialProps = (partial.props ?? {}) as Partial<{ w: number; h: number }>
		const rect = this.clampRect({
			x: partial.x ?? shape.x,
			y: partial.y ?? shape.y,
			w: partialProps.w ?? shapeProps.w,
			h: partialProps.h ?? shapeProps.h,
		})

		return {
			...partial,
			x: rect.x,
			y: rect.y,
			props: {
				...(partial.props as object | undefined),
				w: rect.w,
				h: rect.h,
			},
		} as TLShapePartial
	}

	mmToPageUnits(value: number) {
		return value * this.options.pxPerMm
	}

	pageUnitsToMm(value: number) {
		return value / this.options.pxPerMm
	}

	getRulerMajorStepMm(camera: WorkspaceCamera) {
		if (camera.z <= 0) return 10
		return getNiceStep(TARGET_MAJOR_TICK_PX / (camera.z * this.options.pxPerMm))
	}

	getRulerTicks(
		axis: RulerAxis,
		camera: WorkspaceCamera,
		viewport: WorkspaceViewportSize,
		rulerSize: number,
		majorStepMm = this.getRulerMajorStepMm(camera)
	): RulerTick[] {
		const viewportLength = axis === 'x' ? viewport.w : viewport.h
		if (viewportLength <= rulerSize || camera.z <= 0) return []

		const cameraOffset = axis === 'x' ? camera.x : camera.y
		const pageStartMm = this.pageUnitsToMm(rulerSize / camera.z - cameraOffset)
		const pageEndMm = this.pageUnitsToMm(viewportLength / camera.z - cameraOffset)
		const minorStepMm = majorStepMm / 10
		const minorStepPageUnits = this.mmToPageUnits(minorStepMm)
		const startIndex = Math.floor(pageStartMm / minorStepMm)
		const endIndex = Math.ceil(pageEndMm / minorStepMm)
		const ticks: RulerTick[] = []

		for (let index = startIndex; index <= endIndex; index++) {
			const rounded = roundTickValue(index * minorStepMm)
			const minorIndex = positiveModulo(index, 10)
			const isMajor = minorIndex === 0
			const isMiddle = !isMajor && minorIndex === 5
			const pageValue = index * minorStepPageUnits
			const position = (pageValue + cameraOffset) * camera.z - rulerSize

			ticks.push({
				id: `${axis}:${index}`,
				label: isMajor ? this.formatRulerLabel(rounded) : null,
				position,
				strength: isMajor ? 'major' : isMiddle ? 'middle' : 'minor',
			})
		}

		return ticks
	}

	private formatRulerLabel(value: number) {
		if (Math.abs(value) < 0.0001) return '0'
		if (Math.abs(Math.round(value) - value) < 0.0001) return String(Math.round(value))
		return value.toFixed(1)
	}

	private createPageBounds(size: WorkspacePageSizeMm): WorkspacePageBounds {
		return {
			x: 0,
			y: 0,
			w: this.mmToPageUnits(size.w),
			h: this.mmToPageUnits(size.h),
		}
	}
}

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value))
}

function clampWithCollapsedRange(value: number, min: number, max: number) {
	if (min > max) return (min + max) / 2
	return clamp(value, min, max)
}

function getNiceStep(rawStep: number) {
	const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
	const normalized = rawStep / magnitude
	const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
	return nice * magnitude
}

function positiveModulo(value: number, divisor: number) {
	return ((value % divisor) + divisor) % divisor
}

function roundTickValue(value: number) {
	return Math.round(value * 100000) / 100000
}

function normalizePageSizeMm(size: WorkspacePageSizeMm): WorkspacePageSizeMm {
	return {
		w: clamp(Math.round(size.w * 10) / 10, MIN_PAGE_SIZE_MM, MAX_PAGE_SIZE_MM),
		h: clamp(Math.round(size.h * 10) / 10, MIN_PAGE_SIZE_MM, MAX_PAGE_SIZE_MM),
	}
}
