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
		this.applyShapeUpdates(updates)
		try {
			const image = await this.editor.toImageDataUrl(shapeIds, {
				format: config.export?.format ?? 'png',
				quality: config.export?.quality,
				pixelRatio: config.export?.pixelRatio ?? 2,
				background: config.page.background ?? true,
				padding: config.export?.padding ?? 0,
				bounds: this.getExportBounds(config),
			})

			return {
				dataUrl: image.url,
				width: image.width,
				height: image.height,
				pageNo: index + 1,
				index,
				row,
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
