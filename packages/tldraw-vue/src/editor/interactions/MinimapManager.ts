import {
	Box,
	ComputedCache,
	Vec,
	clamp,
	react,
	type Editor,
	type TLShape,
} from '@tldraw/editor'

interface MinimapColors {
	background: string
	shapeFill: string
	selectedFill: string
	viewportFill: string
	viewportStroke: string
}

const FALLBACK_COLORS: MinimapColors = {
	background: '#d9dddf',
	shapeFill: '#646a70',
	selectedFill: '#2563eb',
	viewportFill: 'rgba(248, 250, 252, 0.55)',
	viewportStroke: 'rgba(15, 23, 42, 0.18)',
}

export class MinimapManager {
	private readonly ctx: CanvasRenderingContext2D
	private readonly disposables: (() => void)[] = []
	private readonly shapeRectCache: ComputedCache<Box | null, TLShape>
	private colors: MinimapColors

	originPagePoint = new Vec()
	originPageCenter = new Vec()
	isInViewport = false

	constructor(
		public readonly editor: Editor,
		public readonly elem: HTMLCanvasElement,
		public readonly container: HTMLElement
	) {
		const ctx = elem.getContext('2d')
		if (!ctx) throw new Error('Minimap: could not get 2D canvas context')

		this.ctx = ctx
		this.colors = this.getColors()
		this.shapeRectCache = editor.store.createComputedCache<Box | null, TLShape>(
			'vue-minimap-shape-rect',
			(shape) => {
				const util = editor.getShapeUtil(shape.type)
				if (util.hideInMinimap?.(shape)) return null
				return editor.getShapeMaskedPageBounds(shape.id) ?? null
			}
		)

		this.disposables.push(this.listenForCanvasResize(), react('vue minimap render', this.render))
	}

	close = () => {
		this.disposables.forEach((dispose) => dispose())
		this.disposables.length = 0
	}

	updateColors() {
		this.colors = this.getColors()
	}

	getContentPageBounds() {
		const viewportPageBounds = this.editor.getViewportPageBounds()
		const commonShapeBounds = this.editor.getCurrentPageBounds()
		return commonShapeBounds
			? Box.Expand(commonShapeBounds, viewportPageBounds)
			: viewportPageBounds
	}

	getCanvasPageBounds() {
		const canvasScreenBounds = this.getCanvasScreenBounds()
		const contentPageBounds = this.getContentPageBounds()
		const aspectRatio = canvasScreenBounds.width / canvasScreenBounds.height

		let targetWidth = contentPageBounds.width
		let targetHeight = targetWidth / aspectRatio
		if (targetHeight < contentPageBounds.height) {
			targetHeight = contentPageBounds.height
			targetWidth = targetHeight * aspectRatio
		}

		const box = new Box(0, 0, targetWidth, targetHeight)
		box.center = contentPageBounds.center
		return box
	}

	getZoom() {
		return this.getCanvasScreenBounds().width / this.getCanvasPageBounds().width
	}

	getMinimapPagePoint(clientX: number, clientY: number) {
		const canvasPageBounds = this.getCanvasPageBounds()
		const canvasScreenBounds = this.getCanvasScreenBounds()

		let x = clientX - canvasScreenBounds.x
		let y = clientY - canvasScreenBounds.y

		x *= canvasPageBounds.width / canvasScreenBounds.width
		y *= canvasPageBounds.height / canvasScreenBounds.height

		x += canvasPageBounds.minX
		y += canvasPageBounds.minY

		return new Vec(x, y, 1)
	}

	minimapScreenPointToPagePoint(x: number, y: number, shiftKey = false, clampToBounds = false) {
		const viewportPageBounds = this.editor.getViewportPageBounds()
		let { x: px, y: py } = this.getMinimapPagePoint(x, y)

		if (clampToBounds) {
			const shapesPageBounds = this.editor.getCurrentPageBounds() ?? new Box()
			const minX = shapesPageBounds.minX - viewportPageBounds.width / 2
			const maxX = shapesPageBounds.maxX + viewportPageBounds.width / 2
			const minY = shapesPageBounds.minY - viewportPageBounds.height / 2
			const maxY = shapesPageBounds.maxY + viewportPageBounds.height / 2

			const lx = Math.max(0, minX + viewportPageBounds.width - px)
			const rx = Math.max(0, -(maxX - viewportPageBounds.width - px))
			const ly = Math.max(0, minY + viewportPageBounds.height - py)
			const ry = Math.max(0, -(maxY - viewportPageBounds.height - py))

			px += (lx - rx) / 2
			py += (ly - ry) / 2
			px = clamp(px, minX, maxX)
			py = clamp(py, minY, maxY)
		}

		if (shiftKey) {
			const dx = Math.abs(px - this.originPagePoint.x)
			const dy = Math.abs(py - this.originPagePoint.y)
			if (dx > dy) {
				py = this.originPagePoint.y
			} else {
				px = this.originPagePoint.x
			}
		}

		return new Vec(px, py)
	}

	render = () => {
		const canvasSize = this.getCanvasSize()
		if (canvasSize.x <= 0 || canvasSize.y <= 0) return

		const { ctx, elem, editor } = this
		this.colors = this.getColors()
		const canvasPageBounds = this.getCanvasPageBounds()
		const dpr = this.getDpr()
		const zoom = this.getZoom()

		if (elem.width !== canvasSize.x || elem.height !== canvasSize.y) {
			elem.width = canvasSize.x
			elem.height = canvasSize.y
		}

		ctx.resetTransform()
		ctx.fillStyle = this.colors.background
		ctx.fillRect(0, 0, canvasSize.x, canvasSize.y)

		ctx.scale(dpr * zoom, dpr * zoom)
		ctx.translate(-canvasPageBounds.minX, -canvasPageBounds.minY)

		const { shapes, selected } = this.getShapePaths()
		ctx.fillStyle = this.colors.shapeFill
		ctx.fill(shapes)
		ctx.fillStyle = this.colors.selectedFill
		ctx.fill(selected)

		const viewport = editor.getViewportPageBounds()
		const { minX: vx, minY: vy, width: vw, height: vh } = viewport
		const radius = Math.min(vw / 4, vh / 4, 4 / zoom)

		ctx.beginPath()
		if (radius * zoom < 1) {
			ctx.rect(vx, vy, vw, vh)
		} else {
			ctx.roundRect(vx, vy, vw, vh, radius)
		}
		ctx.fillStyle = this.colors.viewportFill
		ctx.fill()
		ctx.strokeStyle = this.colors.viewportStroke
		ctx.lineWidth = 1 / zoom
		ctx.stroke()

		for (const { util, overlays } of editor.overlays.getActiveOverlayEntries()) {
			ctx.save()
			util.renderMinimap(ctx, overlays, zoom)
			ctx.restore()
		}
	}

	private getShapePaths() {
		const selectedIds = new Set<string>(this.editor.getSelectedShapeIds())
		const shapes = new Path2D()
		const selected = new Path2D()

		for (const shapeId of this.editor.getCurrentPageShapeIdsSorted()) {
			const bounds = this.shapeRectCache.get(shapeId)
			if (!bounds) continue
			const target = selectedIds.has(shapeId) ? selected : shapes
			target.rect(bounds.x, bounds.y, bounds.w, bounds.h)
		}

		return { shapes, selected }
	}

	private getCanvasScreenBounds() {
		const { x, y, width, height } = this.elem.getBoundingClientRect()
		return new Box(x, y, width, height)
	}

	private getCanvasSize() {
		const rect = this.getCanvasScreenBounds()
		const dpr = this.getDpr()
		return new Vec(rect.width * dpr, rect.height * dpr)
	}

	private getDpr() {
		return this.editor.getInstanceState().devicePixelRatio || window.devicePixelRatio || 1
	}

	private listenForCanvasResize() {
		const observer = new ResizeObserver(() => this.render())
		observer.observe(this.elem)
		observer.observe(this.container)
		return () => observer.disconnect()
	}

	private getColors(): MinimapColors {
		const style = this.editor.getContainerWindow().getComputedStyle(this.elem)
		return {
			background: this.getCssColor(style, '--vue-minimap-background', FALLBACK_COLORS.background),
			shapeFill: this.getCssColor(style, '--vue-minimap-shape-fill', FALLBACK_COLORS.shapeFill),
			selectedFill: this.getCssColor(
				style,
				'--vue-minimap-selected-fill',
				FALLBACK_COLORS.selectedFill
			),
			viewportFill: this.getCssColor(
				style,
				'--vue-minimap-viewport-fill',
				FALLBACK_COLORS.viewportFill
			),
			viewportStroke: this.getCssColor(
				style,
				'--vue-minimap-viewport-stroke',
				FALLBACK_COLORS.viewportStroke
			),
		}
	}

	private getCssColor(style: CSSStyleDeclaration, name: string, fallback: string) {
		const value = style.getPropertyValue(name).trim()
		return value || fallback
	}
}
