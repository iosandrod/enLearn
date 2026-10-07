import { Box, createShapeId, type Editor, type TLShape, type TLShapeId, type TLShapePartial } from '@tldraw/editor'
import {
	clearVueMaterialPrintTableOverrides,
	setVueMaterialPrintTableOverrides,
	clearVueResumePrintOverrides,
	setVueResumePrintOverrides,
} from '@/editor/vueSvgExport'
import {
	getVueMaterialHiddenShapeIds,
	runWithVueMaterialPrintLayoutUpdates,
} from '@/editor/extensions/material/vueMaterialShape'
import { DEFAULT_PX_PER_MM } from '@/editor/interactions/WorkspaceBoundsManager'
import { normalizeWorkspaceBackgroundOpacity } from '@/editor/templateStore'
import { resolvePrintPreviewRows } from './dataSource'
import { PrintShapePreviewResolver } from './shapePreviewStrategies'
import {
	createMaterialGridPrintPlan,
	getMaterialGridPageUpdates,
	getMaterialGridTableOverrides,
	type MaterialGridPrintPlan,
} from './materialGrid'
import { createResumePrintPlan, getResumeOverrides, type ResumePrintPlan } from './resume'
import type { PrintExpressionContext, PrintJobConfig, PrintPageRenderResult } from './types'

export interface PrintRenderJob {
	row: Record<string, unknown>
	materialGridPlan?: MaterialGridPrintPlan
	materialGridPageIndex?: number
	resumePlan?: ResumePrintPlan
	resumePageIndex?: number
}

export class PrintRenderer {
	private readonly previewResolver = new PrintShapePreviewResolver()

	constructor(private readonly editor: Editor) {}

	createRenderJobs(config: PrintJobConfig): PrintRenderJob[] {
		const shapeIds = this.getTemplateShapeIds(config)
		const materialGridPlan = createMaterialGridPrintPlan(this.editor, config, shapeIds)
		const resumePlan = createResumePrintPlan(this.editor, config, shapeIds)

		if (!materialGridPlan && !resumePlan) {
			const rows = resolvePrintPreviewRows(config.dataSource, config.data) ?? config.data ?? []
			return rows.map((row) => ({ row }))
		}
		if (resumePlan) {
			const contextRow = config.data?.[0] ?? {}
			return Array.from({ length: resumePlan.pageCount }, (_, pageIndex) => ({ row: contextRow, resumePlan, resumePageIndex: pageIndex }))
		}

		if (!materialGridPlan) return []
		const contextRow = config.data?.[0] ?? {}
		const jobs: PrintRenderJob[] = []

		for (let pageIndex = 0; pageIndex < materialGridPlan.pageCount; pageIndex++) {
			jobs.push({
				row: contextRow,
				materialGridPlan,
				materialGridPageIndex: pageIndex,
			})
		}

		return jobs
	}

	async renderPage(
		config: PrintJobConfig,
		row: Record<string, unknown>,
		index: number,
		total: number,
		options: {
			materialGridPlan?: MaterialGridPrintPlan
			materialGridPageIndex?: number
			resumePlan?: ResumePrintPlan
			resumePageIndex?: number
		} = {}
	): Promise<PrintPageRenderResult> {
		const shapeIds = this.getTemplateShapeIds(config)
		const context = {
			row,
			data: config.data ?? [],
			currentTable: getCurrentTablesData(options.materialGridPlan, options.materialGridPageIndex ?? index),
			currentTables: getCurrentTablesData(options.materialGridPlan, options.materialGridPageIndex ?? index),
			dataSource: config.dataSource,
			index,
			pageNo: index + 1,
			total,
		}
		const updates: TLShapePartial[] = []
		const temporaryListFrameShapes = options.materialGridPlan
			? this.createContainerListFrameShapes(options.materialGridPlan, options.materialGridPageIndex ?? index, context, config)
			: []
		const temporaryListFrameIds = temporaryListFrameShapes.map((shape) => shape.id)

		for (const shape of this.getShapesForExpressionPass(shapeIds)) {
			const update = this.previewResolver.resolve(shape, context, config.expression)
			if (update) updates.push(update)
		}

		if (options.materialGridPlan) {
			const materialGridPageIndex = options.materialGridPageIndex ?? index
			updates.push(...getMaterialGridPageUpdates(options.materialGridPlan, materialGridPageIndex))
			setVueMaterialPrintTableOverrides(
				getMaterialGridTableOverrides(options.materialGridPlan, materialGridPageIndex)
			)
		}
		if (options.resumePlan) {
			setVueResumePrintOverrides(getResumeOverrides(options.resumePlan, options.resumePageIndex ?? index))
		}

		updates.push(
			...getVueMaterialHiddenShapeIds(this.editor, shapeIds).flatMap((shapeId) => {
				const shape = this.editor.getShape(shapeId)
				if (!shape) return []
				return [{
					id: shapeId,
					type: shape.type,
					opacity: 0,
				} as TLShapePartial]
			})
		)

		if ((updates.length || temporaryListFrameShapes.length) && this.editor.getIsReadonly()) {
			clearVueMaterialPrintTableOverrides()
			clearVueResumePrintOverrides()
			throw new Error('Cannot render print updates while the editor is readonly.')
		}

		const updateRestores = createRestoreUpdates(this.editor, updates)
		if (temporaryListFrameShapes.length) {
			this.editor.run(() => runWithVueMaterialPrintLayoutUpdates(() => {
				this.editor.createShapes(temporaryListFrameShapes)
			}), { history: 'ignore', ignoreShapeLock: true })
		}
		try {
			this.applyShapeUpdates(updates)
			const exportBounds = this.getExportBounds(config)
			const pixelRatio = config.export?.pixelRatio ?? 2
			const backgroundStyle = config.page.backgroundStyle
			const sourceBackgroundUrl = backgroundStyle?.imageUrl?.trim() ?? ''
			const resolvedBackgroundUrl = await resolvePreviewImageUrl(backgroundStyle?.imageUrl)
			// The local preview renders this URL as a real bottom image layer. Keep
			// the original URL as a fallback because it may load in <img> even when
			// fetch/canvas access is blocked by CORS.
			const previewBackgroundUrl = resolvedBackgroundUrl || sourceBackgroundUrl
			const backgroundUrl = await createPreviewBackgroundImage(
				resolvedBackgroundUrl,
				exportBounds.width * pixelRatio,
				exportBounds.height * pixelRatio,
				backgroundStyle,
			)
			const content = shapeIds.length
			? await this.editor.toImageDataUrl(shapeIds, {
					format: config.export?.format ?? 'png',
					quality: config.export?.quality,
					pixelRatio,
					background: false,
					padding: config.export?.padding ?? 0,
					bounds: exportBounds,
				})
			: null
			// debugger//
			const image = await composePreviewPageImage({
				width: exportBounds.width * pixelRatio,
				height: exportBounds.height * pixelRatio,
				backgroundUrl,
				contentUrl: content?.url,
				color: backgroundStyle?.color ?? (config.page.background ? '#ffffff' : undefined),
				style: backgroundStyle,
				format: config.export?.format ?? 'png',
				quality: config.export?.quality,
				pixelRatio,
				fallbackBackgroundUrl: sourceBackgroundUrl,
			})

			return {
				dataUrl: image.url,
				width: image.width,
				height: image.height,
				pageNo: index + 1,
				index,
				row,
				backgroundUrl: previewBackgroundUrl || undefined,
				contentUrl: content?.url ?? image.contentUrl,
				backgroundColor: backgroundStyle?.color ?? (config.page.background ? '#ffffff' : undefined),
				backgroundStyle,
			}
		} finally {
			clearVueMaterialPrintTableOverrides()
			clearVueResumePrintOverrides()
			if (temporaryListFrameIds.length) {
				this.editor.run(() => runWithVueMaterialPrintLayoutUpdates(() => {
					this.editor.deleteShapes(temporaryListFrameIds)
				}), { history: 'ignore', ignoreShapeLock: true })
			}
			this.applyShapeUpdates(updateRestores)
		}
	}

	private createContainerListFrameShapes(
		plan: MaterialGridPrintPlan,
		pageIndex: number,
		context: PrintExpressionContext,
		config: PrintJobConfig,
	): TLShapePartial[] {
		const partials: TLShapePartial[] = []

		for (const materialPlan of plan.materials) {
			const frame = materialPlan.listFrame
			if (!frame) continue
			const page = materialPlan.pages[Math.min(pageIndex, materialPlan.pages.length - 1)] ?? materialPlan.pages[0]
			if (!page?.data.length) continue

			const sourceIds = this.editor.getShapeAndDescendantIds([frame.id])
			const sourceShapes = [...sourceIds]
				.map((shapeId) => this.editor.getShape(shapeId))
				.filter((shape): shape is TLShape => Boolean(shape))
				.sort((left, right) => getShapeDepth(this.editor, left, frame.id) - getShapeDepth(this.editor, right, frame.id))
			const itemWidth = page.tableOverride.listItemWidth ?? frame.props.w
			const itemGap = page.tableOverride.listItemGap ?? 0
			const columnCount = Math.max(1, page.tableOverride.listColumnCount ?? 1)

			page.data.forEach((row, rowIndex) => {
				const cloneIds = new Map<TLShapeId, TLShapeId>()
				const itemX = (rowIndex % columnCount) * (itemWidth + itemGap)
				const itemY = Math.floor(rowIndex / columnCount) * (frame.props.h + itemGap)
				const rowContext: PrintExpressionContext = {
					...context,
					row,
					index: rowIndex,
				}

				for (const source of sourceShapes) {
					const cloneId = createShapeId()
					cloneIds.set(source.id, cloneId)
					const resolved = this.previewResolver.resolve(source, rowContext, config.expression)
					const isFrame = source.id === frame.id
					const partial = {
						...source,
						id: cloneId,
						parentId: isFrame
							? materialPlan.tableBody.id
							: cloneIds.get(source.parentId as TLShapeId) ?? materialPlan.tableBody.id,
						x: isFrame ? itemX : source.x,
						y: isFrame ? itemY : source.y,
						props: resolved?.props ?? source.props,
						meta: { ...source.meta, __printContainerListClone: true },
					} as TLShapePartial
					partials.push(partial)
				}
			})
		}

		return partials
	}

	private getTemplateShapeIds(config: PrintJobConfig): TLShapeId[] {
		return config.template?.shapeIds?.length
			? [...config.template.shapeIds]
			: this.editor.getCurrentPageShapeIdsSorted()
	}

	private getShapesForExpressionPass(shapeIds: TLShapeId[]): TLShape[] {
		const shapeIdSet = this.editor.getShapeAndDescendantIds(shapeIds)
		return [...shapeIdSet]
			.map((shapeId) => this.editor.getShape(shapeId))
			.filter((shape): shape is TLShape => Boolean(shape))
	}

	private getExportBounds(config: PrintJobConfig) {
		const bounds = config.template?.pageBounds
		if (bounds) return new Box(bounds.x, bounds.y, bounds.w, bounds.h)

		const pxPerMm = config.template?.pxPerMm ?? DEFAULT_PX_PER_MM
		return new Box(0, 0, config.page.widthMm * pxPerMm, config.page.heightMm * pxPerMm)
	}

	private applyShapeUpdates(updates: TLShapePartial[]) {
		if (!updates.length) return
		this.editor.run(() => runWithVueMaterialPrintLayoutUpdates(() => this.editor.updateShapes(updates)), {
			history: 'ignore',
			ignoreShapeLock: true,
		})
	}
}

function createBlankPrintImage(width: number, height: number, color = '#ffffff') {
	if (typeof document === 'undefined') {
		throw new Error('Blank print pages require a browser document.')
	}
	const canvas = document.createElement('canvas')
	canvas.width = Math.max(1, Math.round(width))
	canvas.height = Math.max(1, Math.round(height))
	const context = canvas.getContext('2d')
	if (context && color.trim()) {
		context.fillStyle = color
		context.fillRect(0, 0, canvas.width, canvas.height)
	}
	return {
		url: canvas.toDataURL('image/png'),
		width: canvas.width,
		height: canvas.height,
	}
}

const previewImageDataCache = new Map<string, Promise<string>>()

async function resolvePreviewImageUrl(value: string | undefined) {
	const url = value?.trim() ?? ''
	if (!url || url.startsWith('data:') || typeof fetch !== 'function') return url
	const cached = previewImageDataCache.get(url)
	if (cached) return cached
	const request = fetch(url)
		.then(async (response) => {
			if (!response.ok) throw new Error(`Background image request failed: ${response.status}`)
			const blob = await response.blob()
			const bytes = new Uint8Array(await blob.arrayBuffer())
			const mimeType = getPreviewImageMimeType(blob.type, bytes)
			const imageBlob = blob.type === mimeType ? blob : new Blob([bytes], { type: mimeType })
			return readPreviewBlobAsDataUrl(imageBlob)
		})
	previewImageDataCache.set(url, request)
	try {
		return await request
	} catch {
		previewImageDataCache.delete(url)
		// Do not put a remote URL into the SVG fallback. It is commonly
		// blocked when the browser resolves an image nested inside a data SVG.
		return ''
	}
}

function readPreviewBlobAsDataUrl(blob: Blob) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader()
		reader.addEventListener('load', () => resolve(String(reader.result ?? '')))
		reader.addEventListener('error', () => reject(reader.error ?? new Error('Background image read failed')))
		reader.readAsDataURL(blob)
	})
}

async function composePreviewPageImage(options: {
	width: number
	height: number
	backgroundUrl: string
	contentUrl?: string
	color?: string
	style?: PrintJobConfig['page']['backgroundStyle']
	format: 'png' | 'jpeg' | 'webp'
	quality?: number
	pixelRatio: number
	fallbackBackgroundUrl?: string
}): Promise<PreviewImage> {
	if (typeof document === 'undefined') {
		return createBlankPrintImage(options.width, options.height, options.color)
	}
	const canvas = document.createElement('canvas')
	canvas.width = Math.max(1, Math.round(options.width))
	canvas.height = Math.max(1, Math.round(options.height))
	const context = canvas.getContext('2d')
	if (!context) return createBlankPrintImage(options.width, options.height, options.color)
	if (options.color?.trim()) {
		context.fillStyle = options.color
		context.fillRect(0, 0, canvas.width, canvas.height)
	}
	if (!options.backgroundUrl && options.fallbackBackgroundUrl) {
		return createPreviewFallbackImage(options)
	}
	let backgroundLoaded = false
	for (const source of [options.backgroundUrl, options.contentUrl ?? '']) {
		if (!source) continue
		const image = await loadPreviewImage(source)
		if (!image) {
			if (source === options.backgroundUrl) {
				return createPreviewFallbackImage(options)
			}
			continue
		}
		if (source === options.backgroundUrl) backgroundLoaded = true
		context.drawImage(image, 0, 0, canvas.width, canvas.height)
	}
	try {
		const mimeType = `image/${options.format}`
		return {
			url: canvas.toDataURL(mimeType, options.quality),
			width: canvas.width / options.pixelRatio,
			height: canvas.height / options.pixelRatio,
		}
	} catch {
		// A remote image can render in an <img> but taint a canvas. Keep the
		// background as a separate preview layer instead of embedding the
		// remote URL in a data SVG (which produces a broken image icon).
		if (backgroundLoaded || options.backgroundUrl || options.fallbackBackgroundUrl) {
			return createPreviewFallbackImage(options)
		}
		return createBlankPrintImage(options.width, options.height, options.color)
	}
}

interface PreviewImage {
	url: string
	width: number
	height: number
	backgroundUrl?: string
	contentUrl?: string
	backgroundColor?: string
	backgroundStyle?: PrintJobConfig['page']['backgroundStyle']
}

function createPreviewFallbackImage(options: {
	width: number
	height: number
	backgroundUrl: string
	contentUrl?: string
	color?: string
	style?: PrintJobConfig['page']['backgroundStyle']
	pixelRatio: number
	fallbackBackgroundUrl?: string
}): PreviewImage {
	const safeImage = createPreviewSvgImage({
		...options,
		backgroundUrl: '',
	})
	return {
		...safeImage,
		backgroundUrl: options.fallbackBackgroundUrl || undefined,
		contentUrl: options.contentUrl || undefined,
		backgroundColor: options.color,
		backgroundStyle: options.style,
	}
}

function createPreviewSvgImage(options: {
	width: number
	height: number
	backgroundUrl: string
	contentUrl?: string
	color?: string
	pixelRatio: number
	style?: PrintJobConfig['page']['backgroundStyle']
}) {
	const backgroundPosition = parsePreviewBackgroundPosition(options.style?.imagePosition)
	const preserveAspectRatio = options.style?.imageSize === 'contain'
		? 'xMidYMid meet'
		: options.style?.imageSize === 'auto'
			? 'none'
			: toSvgPreserveAspectRatio(backgroundPosition)
	const background = options.backgroundUrl
		? options.backgroundUrl.startsWith('data:')
			? `<image href="${escapeSvgAttribute(options.backgroundUrl)}" x="0" y="0" width="${options.width}" height="${options.height}" opacity="${normalizeWorkspaceBackgroundOpacity(options.style?.opacity) / 100}" preserveAspectRatio="${preserveAspectRatio}"/>`
			: ''
		: ''
	const content = options.contentUrl
		? options.contentUrl.startsWith('data:')
			? `<image href="${escapeSvgAttribute(options.contentUrl)}" x="0" y="0" width="${options.width}" height="${options.height}" preserveAspectRatio="none"/>`
			: ''
		: ''
	const color = options.color?.trim() ? `<rect width="100%" height="100%" fill="${escapeSvgAttribute(options.color)}"/>` : ''
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}">${color}${background}${content}</svg>`
	return {
		url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
		width: options.width / options.pixelRatio,
		height: options.height / options.pixelRatio,
	}
}

function toSvgPreserveAspectRatio(position: { x: number; y: number }) {
	const x = position.x <= 0 ? 'xMin' : position.x >= 1 ? 'xMax' : 'xMid'
	const y = position.y <= 0 ? 'YMin' : position.y >= 1 ? 'YMax' : 'YMid'
	return `${x}${y} slice`
}

function escapeSvgAttribute(value: string) {
	return value.replace(/[&<>"']/g, (character) => {
		switch (character) {
			case '&': return '&amp;'
			case '<': return '&lt;'
			case '>': return '&gt;'
			case '"': return '&quot;'
			default: return '&apos;'
		}
	})
}

function loadPreviewImage(src: string) {
	return new Promise<HTMLImageElement | null>((resolve) => {
		const image = document.createElement('img')
		image.onload = () => resolve(image)
		image.onerror = () => resolve(null)
		image.src = src
	})
}

async function createPreviewBackgroundImage(
	value: string,
	width: number,
	height: number,
	style?: PrintJobConfig['page']['backgroundStyle'],
) {
	const url = value?.trim() ?? ''
	if (!url || typeof document === 'undefined') return url

	const image = document.createElement('img')
	if (!url.startsWith('data:')) image.crossOrigin = 'anonymous'
	const loaded = await new Promise<boolean>((resolve) => {
		image.onload = () => resolve(true)
		image.onerror = () => resolve(false)
		image.src = url
		if (image.complete) resolve(image.naturalWidth > 0)
	})
	if (!loaded || !image.naturalWidth || !image.naturalHeight) return ''

	const canvas = document.createElement('canvas')
	canvas.width = Math.max(1, Math.round(width))
	canvas.height = Math.max(1, Math.round(height))
	const context = canvas.getContext('2d')
	if (!context) return ''

	const mode = style?.imageSize ?? 'cover'
	const scale = mode === 'contain'
		? Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight)
		: mode === 'auto'
			? 1
			: Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight)
	const drawWidth = image.naturalWidth * scale
	const drawHeight = image.naturalHeight * scale
	const position = parsePreviewBackgroundPosition(style?.imagePosition)
	const drawX = (canvas.width - drawWidth) * position.x
	const drawY = (canvas.height - drawHeight) * position.y

	if (style?.color) {
		context.fillStyle = style.color
		context.fillRect(0, 0, canvas.width, canvas.height)
	}
	context.globalAlpha = normalizeWorkspaceBackgroundOpacity(style?.opacity) / 100
	context.drawImage(image, drawX, drawY, drawWidth, drawHeight)
	context.globalAlpha = 1

	try {
		return canvas.toDataURL('image/png')
	} catch {
		return ''
	}
}

function parsePreviewBackgroundPosition(value: string | undefined) {
	const tokens = (value ?? 'center').trim().toLowerCase().split(/\s+/).filter(Boolean)
	let x = 0.5
	let y = 0.5
	let xSet = false
	let ySet = false
	for (const token of tokens) {
		const percent = token.match(/^(-?\d+(?:\.\d+)?)%$/)
		if (percent) {
			if (!xSet) {
				x = Number(percent[1]) / 100
				xSet = true
			} else {
				y = Number(percent[1]) / 100
				ySet = true
			}
		} else if (token === 'left') {
			x = 0
			xSet = true
		} else if (token === 'right') {
			x = 1
			xSet = true
		} else if (token === 'top') {
			y = 0
			ySet = true
		} else if (token === 'bottom') {
			y = 1
			ySet = true
		} else if (token === 'center') {
			if (!xSet) {
				x = 0.5
				xSet = true
			} else if (!ySet) {
				y = 0.5
				ySet = true
			}
		}
	}
	return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
}

function getPreviewImageMimeType(contentType: string | null, bytes: Uint8Array) {
	const declared = contentType?.split(';', 1)[0]?.trim().toLowerCase()
	if (declared?.startsWith('image/')) return declared
	if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
	if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
	if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
	if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp'
	if (bytes[0] === 0x3c || (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf && bytes[3] === 0x3c)) return 'image/svg+xml'
	return declared || 'application/octet-stream'
}

function getShapeDepth(editor: Editor, shape: TLShape, rootId: TLShapeId) {
	let depth = 0
	let current: TLShape | undefined = shape
	while (current && current.id !== rootId) {
		depth += 1
		current = editor.getShape(current.parentId as TLShapeId)
	}
	return depth
}

function getCurrentTablesData(plan: MaterialGridPrintPlan | undefined, pageIndex: number) {
	if (!plan) return {}
	return Object.fromEntries(plan.materials.flatMap((material) => {
		const page = material.pages[Math.min(pageIndex, material.pages.length - 1)] ?? material.pages[0]
		const key = String(material.material.props.dataSourceField ?? '').trim()
		if (!key) return []
		return [[key, {
			data: page?.data ?? [],
			columns: page?.tableOverride.columns ?? [],
			rowCount: page?.data.length ?? 0,
		}]]
	}))
}

function createRestoreUpdates(editor: Editor, updates: readonly TLShapePartial[]) {
	const restoresById = new Map<TLShapeId, TLShapePartial>()

	for (const update of updates) {
		const shape = editor.getShape(update.id)
		if (!shape) continue

		const restore = restoresById.get(shape.id) ?? ({
			id: shape.id,
			type: shape.type,
		} as TLShapePartial)

		if (hasOwn(update, 'x')) restore.x = shape.x
		if (hasOwn(update, 'y')) restore.y = shape.y
		if (hasOwn(update, 'rotation')) restore.rotation = shape.rotation
		if (hasOwn(update, 'opacity')) restore.opacity = shape.opacity
		if (hasOwn(update, 'isLocked')) restore.isLocked = shape.isLocked
		if (hasOwn(update, 'props')) restore.props = shape.props
		if (hasOwn(update, 'meta')) restore.meta = shape.meta

		restoresById.set(shape.id, restore)
	}

	return [...restoresById.values()]
}

function hasOwn(value: object, key: string) {
	return Object.prototype.hasOwnProperty.call(value, key)
}
