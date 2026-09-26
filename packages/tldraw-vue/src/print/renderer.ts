import { Box, type Editor, type TLShape, type TLShapeId, type TLShapePartial } from '@tldraw/editor'
import {
	clearVueMaterialPrintTableOverrides,
	setVueMaterialPrintTableOverrides,
	clearVueResumePrintOverrides,
	setVueResumePrintOverrides,
} from '@/editor/vueSvgExport'
import { runWithVueMaterialPrintLayoutUpdates } from '@/editor/extensions/material/vueMaterialShape'
import { resolvePrintPreviewRows } from './dataSource'
import { PrintShapePreviewResolver } from './shapePreviewStrategies'
import {
	createMaterialGridPrintPlan,
	getMaterialGridPageUpdates,
	getMaterialGridTableOverrides,
	type MaterialGridPrintPlan,
} from './materialGrid'
import { createResumePrintPlan, getResumeOverrides, type ResumePrintPlan } from './resume'
import type { PrintJobConfig, PrintPageRenderResult } from './types'

const DEFAULT_PX_PER_MM = 10

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
			index,
			pageNo: index + 1,
			total,
		}
		const updates: TLShapePartial[] = []

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

		if (updates.length && this.editor.getIsReadonly()) {
			clearVueMaterialPrintTableOverrides()
			clearVueResumePrintOverrides()
			throw new Error('Cannot render print updates while the editor is readonly.')
		}

		const updateRestores = createRestoreUpdates(this.editor, updates)
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
			this.applyShapeUpdates(updateRestores)
		}
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
