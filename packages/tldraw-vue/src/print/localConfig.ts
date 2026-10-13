import type { Editor } from '@tldraw/editor'
import type { VueTemplateWorkspaceConfig } from '@/editor/templateStore'
import { DEFAULT_PX_PER_MM } from '@/editor/interactions/WorkspaceBoundsManager'
import { isVueMaterialShape } from '@/editor/extensions/material/vueMaterialShape'
import { getMaterialColumns } from '@/editor/materialColumnOperations'
import { vueMaterialRowDefaults } from '@/editor/defaults'
import type { PrintDataSourceConfig, PrintExpressionConfig, PrintJobConfig, PrintMaterialGridConfig } from './types'

/** Shared by local print preview and the formula builder's sample pagination. */
export function createLocalPrintJobConfig(
	editor: Editor,
	workspace: VueTemplateWorkspaceConfig | undefined,
	dataSource: PrintDataSourceConfig | undefined,
	expression?: PrintExpressionConfig,
): PrintJobConfig {
	const shapeIds = editor.getCurrentPageShapeIdsSorted()
	const pxPerMm = workspace?.pxPerMm ?? DEFAULT_PX_PER_MM
	const size = workspace?.pageSizeMm ?? (workspace?.pageBounds
		? { w: workspace.pageBounds.w / pxPerMm, h: workspace.pageBounds.h / pxPerMm }
		: { w: 80, h: 80 })
	const materialGrids: Record<string, PrintMaterialGridConfig> = {}
	const sourceRow = dataSource?.type === 'inline'
		? (dataSource as Extract<PrintDataSourceConfig, { type: 'inline' }>).rows[0] : undefined
	for (const id of shapeIds) {
		const shape = editor.getShape(id)
		if (!isVueMaterialShape(shape)) continue
		const field = shape.props.dataSourceField?.trim() ?? ''
		const detail = sourceRow?.[field]
		materialGrids[id] = {
			data: Array.isArray(detail) ? detail.filter(row => row && typeof row === 'object' && !Array.isArray(row)) : [],
			columns: getMaterialColumns(dataSource, field, shape.props.columns),
			headerHeight: Number.isFinite(shape.props.headerRowHeight) && shape.props.headerRowHeight! > 0
				? shape.props.headerRowHeight : vueMaterialRowDefaults.headerRowHeight,
			minRowHeight: Number.isFinite(shape.props.bodyRowHeight) && shape.props.bodyRowHeight! > 0
				? shape.props.bodyRowHeight : vueMaterialRowDefaults.bodyRowHeight,
			fontSize: 12, lineHeight: 14, cellPaddingX: 6, cellPaddingY: 5, emptyText: '',
		}
	}
	return {
		previewSettings: workspace?.previewSettings,
		template: {
			shapeIds, pxPerMm,
			pageBounds: workspace?.pageBounds ?? { x: 0, y: 0, w: size.w * pxPerMm, h: size.h * pxPerMm },
			materialGrids: Object.keys(materialGrids).length ? materialGrids : undefined,
		},
		data: [{}], dataSource, expression,
		page: { widthMm: size.w, heightMm: size.h, copies: 1, background: true, backgroundStyle: workspace?.background },
		export: { format: 'png', pixelRatio: 2, padding: 0 },
		printer: { type: 'browser', title: '打印预览' },
	}
}
