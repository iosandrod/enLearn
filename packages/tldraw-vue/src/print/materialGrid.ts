import type { Editor, TLShapeId, TLShapePartial } from '@tldraw/editor'
import {
	getVueMaterialSections,
	getVueMaterialContainerFrame,
	isVueMaterialShape,
	type VueMaterialSectionShape,
	type VueMaterialShape,
} from '@/editor/extensions/material/vueMaterialShape'
import type { VueFrameShape } from '@/editor/extensions/frame/vueFrameShape'
import type {
	VueMaterialPrintTableCell,
	VueMaterialPrintTableColumn,
	VueMaterialPrintTableOverride,
	VueMaterialPrintTableRow,
} from '@/editor/vueSvgExport'
import type {
	PrintDataRow,
	PrintJobConfig,
	PrintMaterialGridColumn,
	PrintMaterialGridConfig,
	PrintMaterialGridInstance,
} from './types'
import { getPrintCodeCellType, getPrintCodeCellValue } from './codeCell'

export interface MaterialGridPrintPlan {
	pageCount: number
	materials: MaterialGridMaterialPlan[]
}

export interface MaterialGridMaterialPlan {
	material: VueMaterialShape
	tableBody: VueMaterialSectionShape
	tableFooter: VueMaterialSectionShape | null
	listFrame: VueFrameShape | null
	pages: MaterialGridPage[]
}

export interface MaterialGridPage {
	tableOverride: VueMaterialPrintTableOverride
	updates: TLShapePartial[]
	data: readonly PrintDataRow[]
}

const DEFAULT_HEADER_HEIGHT = 34
const DEFAULT_MIN_ROW_HEIGHT = 28
const DEFAULT_FONT_SIZE = 12
const DEFAULT_LINE_HEIGHT = 16
const DEFAULT_CELL_PADDING_X = 8
const DEFAULT_CELL_PADDING_Y = 6
const PRINT_EMPTY_TEXT = '\u6682\u65e0\u6570\u636e'
const DEFAULT_LIST_ITEM_MIN_WIDTH = 180
const DEFAULT_LIST_ITEM_GAP = 12

export function createMaterialGridPrintPlan(
	editor: Editor,
	config: PrintJobConfig,
	shapeIds: readonly TLShapeId[]
): MaterialGridPrintPlan | null {
	const materialShapes = getTemplateMaterialShapes(editor, shapeIds)
	if (!materialShapes.length) return null
	const gridConfigs = resolveMaterialGridConfigs(config, materialShapes)
	const materialPlans = materialShapes.map((material) => {
		const gridConfig = gridConfigs.get(material.id)
		if (!gridConfig) {
			throw new Error(material.props.containerList
				? '检测到物料列表节点，请传入 vxe-grid 实例或 data/columns 列表数据。'
				: '检测到物料表格节点，请传入 vxe-grid 实例或 data/columns 表格数据。')
		}
		const plan = createMaterialGridMaterialPlan(editor, material, gridConfig)
		if (!plan) throw new Error('物料表格节点缺少可打印的表体区域。')
		return plan
	})

	return {
		pageCount: Math.max(...materialPlans.map((plan) => plan.pages.length), 1),
		materials: materialPlans,
	}
}

export function getMaterialGridPageUpdates(plan: MaterialGridPrintPlan, pageIndex: number) {
	const updates: TLShapePartial[] = []
	for (const material of plan.materials) {
		const page = getMaterialGridPage(material, pageIndex)
		updates.push(...page.updates)
	}
	return updates
}

export function getMaterialGridTableOverrides(
	plan: MaterialGridPrintPlan,
	pageIndex: number
): Map<TLShapeId, VueMaterialPrintTableOverride> {
	const overrides = new Map<TLShapeId, VueMaterialPrintTableOverride>()
	for (const material of plan.materials) {
		const page = getMaterialGridPage(material, pageIndex)
		overrides.set(material.tableBody.id, page.tableOverride)
	}
	return overrides
}

function getMaterialGridPage(material: MaterialGridMaterialPlan, pageIndex: number) {
	return material.pages[Math.min(pageIndex, material.pages.length - 1)] ?? material.pages[0]
}

function createMaterialGridMaterialPlan(
	editor: Editor,
	material: VueMaterialShape,
	gridConfig: PrintMaterialGridConfig
): MaterialGridMaterialPlan | null {
	const sections = getVueMaterialSections(editor, material.id)
	const tableBody = sections.find((section) => section.props.zone === 'tableBody') ?? null
	if (!tableBody) return null

	const tableFooter = sections.find((section) => section.props.zone === 'tableFooter') ?? null
	const options = getGridRenderOptions(gridConfig)
	const columns = resolveGridColumns(
		material.props.columns !== undefined ? { ...gridConfig, columns: material.props.columns } : gridConfig,
		tableBody.props.w,
	)
	const rows = resolveGridData(gridConfig)
	const isContainerList = material.props.containerList === true
	const headerHeight = isContainerList ? 0 : options.headerHeight * getPrintColumnDepth(columns)
	const listFrame = isContainerList ? getVueMaterialContainerFrame(editor, tableBody.id) : undefined
	const listLayout = isContainerList
		? getListLayout(tableBody.props.w, listFrame?.props.w, listFrame?.props.h)
		: null
	const pageRows = isContainerList
		? paginateListRows(rows, columns, tableBody.props.h, options, listLayout!)
		: paginateGridRows(rows, columns, tableBody.props.h, { ...options, headerHeight })

	return {
		material,
		tableBody,
		tableFooter,
		listFrame: listFrame ?? null,
		pages: pageRows.map((rowsForPage) =>
			createMaterialGridPage(
				material,
				tableBody,
				tableFooter,
				columns,
				rowsForPage,
				rows,
				options,
				headerHeight,
				listLayout,
				Boolean(listLayout && listFrame),
			)
		),
	}
}

function createMaterialGridPage(
	_material: VueMaterialShape,
	tableBody: VueMaterialSectionShape,
	tableFooter: VueMaterialSectionShape | null,
	columns: VueMaterialPrintTableColumn[],
	rows: VueMaterialPrintTableRow[],
	data: readonly PrintDataRow[],
	options: GridRenderOptions,
	headerHeight: number,
	listLayout: ListLayout | null,
	listUsesFrame: boolean,
): MaterialGridPage {
	const contentHeight = rows.reduce((total, row) => total + row.height, 0)
	// Keep the full table-body height so the preview has the same blank area and
	// footer position as the canvas when the current page has fewer rows.
	const renderedHeight = Math.max(0, tableBody.props.h)
	const unusedHeight = Math.max(0, tableBody.props.h - Math.min(
		tableBody.props.h,
		Math.max(headerHeight + contentHeight, headerHeight)
	))
	const updates: TLShapePartial[] = []

	if (tableFooter && unusedHeight > 0) {
		const footerY = tableBody.y + renderedHeight
		updates.push({
			id: tableFooter.id,
			type: 'vue-material-section',
			y: footerY,
		})
	}

	return {
		tableOverride: {
			columns,
			rows,
			headerHeight,
			fontSize: options.fontSize,
			lineHeight: options.lineHeight,
			paddingX: options.cellPaddingX,
			paddingY: options.cellPaddingY,
			renderedHeight,
			emptyText: options.emptyText,
			layout: listLayout ? 'container-list' : 'table',
			listColumnCount: listLayout?.columnCount,
			listItemGap: listLayout?.gap,
			listItemWidth: listLayout?.itemWidth,
			listUsesFrame,
			showBorder: _material.props.showBorder !== false,
		},
		updates,
		data: rows.map((row) => data[Number(row.key.slice(4))]).filter(Boolean),
	}
}

interface ListLayout {
	columnCount: number
	itemWidth: number
	itemHeight: number
	gap: number
}

function getListLayout(width: number, frameWidth?: number, frameHeight?: number): ListLayout {
	const safeWidth = Math.max(1, width)
	const gap = DEFAULT_LIST_ITEM_GAP
	const hasFrameWidth = Number.isFinite(frameWidth) && (frameWidth ?? 0) > 0
	const minimumItemWidth = hasFrameWidth
		? frameWidth as number
		: DEFAULT_LIST_ITEM_MIN_WIDTH
	const columnCount = Math.max(1, Math.floor((safeWidth + gap) / (minimumItemWidth + gap)))
	return {
		columnCount,
		itemWidth: hasFrameWidth
			? minimumItemWidth
			: Math.max(1, (safeWidth - gap * (columnCount - 1)) / columnCount),
		itemHeight: Number.isFinite(frameHeight) && (frameHeight ?? 0) > 0 ? frameHeight as number : 96,
		gap,
	}
}

function paginateListRows(
	data: readonly PrintDataRow[],
	columns: readonly VueMaterialPrintTableColumn[],
	tableBodyHeight: number,
	options: GridRenderOptions,
	layout: ListLayout,
) {
	const availableHeight = Math.max(layout.itemHeight, tableBodyHeight)
	const measuredRows = data.map((row, rowIndex) => {
		const item = createPrintTableRow(row, rowIndex, columns, options)
		return {
			...item,
			height: layout.itemHeight,
		}
	})
	if (!measuredRows.length) return [[]]

	const pages: VueMaterialPrintTableRow[][] = []
	let pageRows: VueMaterialPrintTableRow[] = []
	let pageHeight = 0
	for (let index = 0; index < measuredRows.length; index += layout.columnCount) {
		const line = measuredRows.slice(index, index + layout.columnCount)
		const lineHeight = Math.max(...line.map((row) => row.height))
		const nextPageHeight = pageHeight + (pageRows.length ? layout.gap : 0) + lineHeight
		if (pageRows.length && nextPageHeight > availableHeight) {
			pages.push(pageRows)
			pageRows = []
			pageHeight = 0
		}
		pageRows.push(...line)
		pageHeight += (pageRows.length > line.length ? layout.gap : 0) + lineHeight
	}

	if (pageRows.length) pages.push(pageRows)
	return pages
}

function paginateGridRows(
	data: readonly PrintDataRow[],
	columns: readonly VueMaterialPrintTableColumn[],
	tableBodyHeight: number,
	options: GridRenderOptions
) {
	const availableRowsHeight = Math.max(
		options.minRowHeight,
		tableBodyHeight - options.headerHeight
	)
	const measuredRows = data.map((row, rowIndex) =>
		createPrintTableRow(row, rowIndex, columns, options)
	)

	if (!measuredRows.length) return [[]]

	const pages: VueMaterialPrintTableRow[][] = []
	let pageRows: VueMaterialPrintTableRow[] = []
	let pageHeight = 0

	for (const row of measuredRows) {
		const rowHeight = Math.min(row.height, availableRowsHeight)
		const nextRow = rowHeight === row.height ? row : { ...row, height: rowHeight }
		if (pageRows.length > 0 && pageHeight + nextRow.height > availableRowsHeight) {
			pages.push(pageRows)
			pageRows = []
			pageHeight = 0
		}

		pageRows.push(nextRow)
		pageHeight += nextRow.height
	}

	if (pageRows.length > 0) pages.push(pageRows)
	return pages
}

function createPrintTableRow(
	row: PrintDataRow,
	rowIndex: number,
	columns: readonly VueMaterialPrintTableColumn[],
	options: GridRenderOptions
): VueMaterialPrintTableRow {
	const cells = flattenPrintColumns(columns).map((column, columnIndex) =>
		createPrintTableCell(row, rowIndex, column, columnIndex, options)
	)
	const maxLines = Math.max(1, ...cells.map((cell) => Math.max(1, cell.lines.length)))
	return {
		key: `row:${rowIndex}`,
		cells,
		height: Math.max(
			options.minRowHeight,
			options.cellPaddingY * 2 + maxLines * options.lineHeight
				+ (cells.some((cell) => cell.codeType) ? 36 : 0)
		),
	}
}

function flattenPrintColumns(
	columns: readonly VueMaterialPrintTableColumn[],
	result: VueMaterialPrintTableColumn[] = [],
) {
	columns.forEach((column) => {
		if (column.children?.length) {
			flattenPrintColumns(column.children as VueMaterialPrintTableColumn[], result)
		} else {
			result.push(column)
		}
	})
	return result
}

function createPrintTableCell(
	row: PrintDataRow,
	rowIndex: number,
	column: VueMaterialPrintTableColumn,
	columnIndex: number,
	options: GridRenderOptions
): VueMaterialPrintTableCell {
	const rawValue = getCellValue(row, column, rowIndex, columnIndex)
	const text = stringifyCellValue(rawValue)
	const maxWidth = Math.max(8, column.width - options.cellPaddingX * 2)
	return {
		text,
		lines: wrapText(text, maxWidth, options.fontSize),
		codeType: column.codeType ?? getPrintCodeCellType(column as unknown as Record<string, unknown>),
	}
}

function getCellValue(
	row: PrintDataRow,
	column: VueMaterialPrintTableColumn,
	rowIndex: number,
	columnIndex: number
) {
	if (column.type === 'seq') return rowIndex + 1

	const field = column.field
	const cellValue = getPrintCodeCellValue(row, field)
	const formatter = column.formatter
	if (typeof formatter === 'function') {
		try {
			return formatter({
				cellValue,
				row,
				column,
				rowIndex,
				columnIndex,
			})
		} catch {
			return cellValue
		}
	}
	return cellValue
}

function resolveMaterialGridConfigs(config: PrintJobConfig, materials: readonly VueMaterialShape[]) {
	const materialIds = new Set(materials.map((material) => material.id))
	const result = new Map<TLShapeId, PrintMaterialGridConfig>()
	const materialGrid = config.template?.materialGrid
	if (materialGrid && materials.length === 1) {
		result.set(materials[0].id, normalizeMaterialGridConfig(materialGrid))
	}

	const materialGrids = config.template?.materialGrids
	if (!materialGrids) return result

	if (Array.isArray(materialGrids)) {
		for (const item of materialGrids) {
			const normalized = normalizeMaterialGridConfig(item)
			const materialId = normalized.materialId ?? (materials.length === 1 ? materials[0].id : undefined)
			if (!materialId || !materialIds.has(materialId)) continue
			result.set(materialId, normalized)
		}
		return result
	}

	for (const [key, value] of Object.entries(materialGrids)) {
		const normalized = normalizeMaterialGridConfig(value)
		const materialId = (normalized.materialId ?? key) as TLShapeId
		if (!materialIds.has(materialId)) continue
		result.set(materialId, { ...normalized, materialId })
	}

	return result
}

function normalizeMaterialGridConfig(
	value: PrintMaterialGridConfig | PrintMaterialGridInstance
): PrintMaterialGridConfig {
	if (isMaterialGridConfig(value)) return value
	return { grid: value }
}

function isMaterialGridConfig(value: unknown): value is PrintMaterialGridConfig {
	if (!isRecord(value)) return false
	return 'grid' in value || 'data' in value || 'columns' in value || 'materialId' in value
}

function resolveGridData(config: PrintMaterialGridConfig): PrintDataRow[] {
	if (config.data) return config.data.map(normalizeDataRow)

	const grid = config.grid
	const tableData = asRecord(callMethod(grid, 'getTableData'))
	const fromTableData = firstArray(
		tableData?.visibleData,
		tableData?.tableData,
		tableData?.fullData,
		tableData?.data
	)
	if (fromTableData) return fromTableData.map(normalizeDataRow)

	const directData = firstArray(
		callMethod(grid, 'getData'),
		callMethod(grid, 'getFullData'),
		tableData?.fullData,
		getPath(grid, ['reactData', 'tableData']),
		getPath(grid, ['internalData', 'tableData']),
		getPath(grid, ['props', 'data']),
		getPath(grid, ['$props', 'data'])
	)

	return directData?.map(normalizeDataRow) ?? []
}

function resolveGridColumns(
	config: PrintMaterialGridConfig,
	tableWidth: number
): VueMaterialPrintTableColumn[] {
	const tableColumn = asRecord(callMethod(config.grid, 'getTableColumn'))
	const rawColumns: PrintMaterialGridColumn[] = config.columns
		? [...config.columns]
		: (firstArray(
				callMethod(config.grid, 'getColumns'),
				callMethod(config.grid, 'getVisibleColumns'),
				tableColumn?.visibleColumn,
				tableColumn?.fullColumn,
				getPath(config.grid, ['reactData', 'tableColumn', 'visibleColumn']),
				getPath(config.grid, ['internalData', 'visibleColumn']),
				getPath(config.grid, ['internalData', 'tableColumn', 'visibleColumn'])
			) ?? [])
				.filter(isRecord)
				.map((column) => column as PrintMaterialGridColumn)

	const visibleColumns = rawColumns.filter((column) => isVisibleColumn(column))
	const fallbackColumns =
		visibleColumns.length > 0 ? visibleColumns : [{ field: 'value', title: 'Value' }]
	const leafColumns = flattenGridColumns(fallbackColumns)
	const rawWidths = leafColumns.map(getColumnWidth)
	const explicitWidthTotal = rawWidths.reduce<number>((total, width) => total + (width ?? 0), 0)
	const missingWidthCount = rawWidths.filter((width) => width === null).length
	const fallbackWidth = Math.max(
		40,
		(tableWidth - explicitWidthTotal) / Math.max(1, missingWidthCount || fallbackColumns.length)
	)
	const totalWidth =
		explicitWidthTotal + (missingWidthCount > 0 ? missingWidthCount * fallbackWidth : 0)
	let widthCursor = 0

	const leafWidths = leafColumns.map((column, index) => {
		const rawWidth = rawWidths[index] ?? fallbackWidth
		const width =
			index === leafColumns.length - 1
				? Math.max(24, tableWidth - widthCursor)
				: Math.max(24, (rawWidth / totalWidth) * tableWidth)
		widthCursor += width
		return width
	})
	let leafIndex = 0
	return fallbackColumns.map((column) => normalizeGridColumn(column, leafWidths, () => leafIndex++))
}

function flattenGridColumns(
	columns: readonly PrintMaterialGridColumn[],
	result: PrintMaterialGridColumn[] = [],
) {
	columns.forEach((column) => {
		const children = Array.isArray(column.children)
			? column.children.filter(isRecord).filter(isVisibleColumn) as PrintMaterialGridColumn[]
			: []
		if (children.length) flattenGridColumns(children, result)
		else if (isVisibleColumn(column)) result.push(column)
	})
	return result
}

function normalizeGridColumn(
	column: PrintMaterialGridColumn,
	leafWidths: readonly number[],
	nextLeafIndex: () => number,
): VueMaterialPrintTableColumn {
	const children = Array.isArray(column.children)
		? column.children
			.filter(isRecord)
			.filter(isVisibleColumn)
			.map((child) => normalizeGridColumn(child as PrintMaterialGridColumn, leafWidths, nextLeafIndex))
		: []
	if (children.length) {
		return {
			field: getColumnField(column),
			label: getColumnLabel(column),
			width: children.reduce((sum, child) => sum + child.width, 0),
			children,
		}
	}
	return {
		field: getColumnField(column),
		label: getColumnLabel(column),
		width: leafWidths[nextLeafIndex()] ?? 24,
		type: column.type,
		codeType: getPrintCodeCellType(column as unknown as Record<string, unknown>),
		formatter: isRecord(column) ? column.formatter : undefined,
	}
}

function getPrintColumnDepth(columns: readonly VueMaterialPrintTableColumn[]): number {
	if (!columns.length) return 1
	return Math.max(1, ...columns.map((column) =>
		column.children?.length ? 1 + getPrintColumnDepth(column.children as VueMaterialPrintTableColumn[]) : 1
	))
}

function getGridRenderOptions(config: PrintMaterialGridConfig): GridRenderOptions {
	const fontSize = getFiniteNumber(config.fontSize, DEFAULT_FONT_SIZE)
	const lineHeight = getFiniteNumber(config.lineHeight, Math.ceil(fontSize * 1.35))
	return {
		headerHeight: getFiniteNumber(config.headerHeight, DEFAULT_HEADER_HEIGHT),
		minRowHeight: getFiniteNumber(config.minRowHeight, DEFAULT_MIN_ROW_HEIGHT),
		fontSize,
		lineHeight,
		cellPaddingX: getFiniteNumber(config.cellPaddingX, DEFAULT_CELL_PADDING_X),
		cellPaddingY: getFiniteNumber(config.cellPaddingY, DEFAULT_CELL_PADDING_Y),
		emptyText: config.emptyText ?? PRINT_EMPTY_TEXT,
	}
}

function getTemplateMaterialShapes(editor: Editor, shapeIds: readonly TLShapeId[]) {
	const ids = editor.getShapeAndDescendantIds([...shapeIds])
	return [...ids]
		.map((shapeId) => editor.getShape<VueMaterialShape>(shapeId))
		.filter(isVueMaterialShape)
}

function getColumnField(column: PrintMaterialGridColumn) {
	return column.field ?? column.property ?? column.prop ?? column.key
}

function getColumnLabel(column: PrintMaterialGridColumn) {
	return (
		column.title ??
		column.label ??
		column.name ??
		getColumnField(column) ??
		(column.type ? String(column.type) : '')
	)
}

function getColumnWidth(column: PrintMaterialGridColumn) {
	return (
		parseColumnWidth(column.renderWidth) ??
		parseColumnWidth(column.resizeWidth) ??
		parseColumnWidth(column.width) ??
		parseColumnWidth(column.minWidth)
	)
}

function isVisibleColumn(column: PrintMaterialGridColumn) {
	return column.visible !== false
}

function parseColumnWidth(value: unknown) {
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
	if (typeof value !== 'string') return null
	const match = value.match(/^\s*(\d+(?:\.\d+)?)/)
	if (!match) return null
	const parsed = Number(match[1])
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function normalizeDataRow(value: unknown): PrintDataRow {
	if (isRecord(value)) return value as PrintDataRow
	return { value }
}

function stringifyCellValue(value: unknown) {
	if (value === null || value === undefined) return ''
	if (value instanceof Date) return value.toLocaleString()
	if (typeof value === 'object') return JSON.stringify(value)
	return String(value)
}

function wrapText(text: string, maxWidth: number, fontSize: number) {
	const normalized = text.replace(/\s+/g, ' ').trim()
	if (!normalized) return ['']

	const measure = createTextMeasure(fontSize)
	const words = normalized.includes(' ') ? normalized.split(' ') : [...normalized]
	const lines: string[] = []
	let currentLine = ''

	for (const word of words) {
		const candidate = currentLine ? `${currentLine}${normalized.includes(' ') ? ' ' : ''}${word}` : word
		if (measure(candidate) <= maxWidth || !currentLine) {
			currentLine = candidate
			continue
		}
		lines.push(currentLine)
		currentLine = word
	}

	if (currentLine) lines.push(currentLine)
	return lines.length ? lines : ['']
}

function createTextMeasure(fontSize: number) {
	if (typeof document !== 'undefined') {
		const canvas = document.createElement('canvas')
		const ctx = canvas.getContext('2d')
		if (ctx) {
			ctx.font = `${fontSize}px sans-serif`
			return (text: string) => ctx.measureText(text).width
		}
	}

	return (text: string) => text.length * fontSize * 0.56
}

function callMethod(target: unknown, method: string) {
	const unwrapped = unwrapRef(target)
	if (!isRecord(unwrapped)) return undefined
	const fn = unwrapped[method]
	if (typeof fn !== 'function') return undefined
	try {
		return unwrapRef(fn.call(unwrapped))
	} catch {
		return undefined
	}
}

function firstArray(...values: unknown[]) {
	for (const value of values) {
		const unwrapped = unwrapRef(value)
		if (Array.isArray(unwrapped)) return unwrapped
	}
	return undefined
}

function asRecord(value: unknown) {
	const unwrapped = unwrapRef(value)
	return isRecord(unwrapped) ? unwrapped : undefined
}

function getPath(target: unknown, path: readonly string[]) {
	let value = unwrapRef(target)
	for (const key of path) {
		if (!isRecord(value)) return undefined
		value = unwrapRef(value[key])
	}
	return value
}

function unwrapRef(value: unknown): unknown {
	if (isRecord(value) && 'value' in value && Object.keys(value).length <= 3) {
		return value.value
	}
	return value
}

function getFiniteNumber(value: unknown, fallback: number) {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

interface GridRenderOptions {
	headerHeight: number
	minRowHeight: number
	fontSize: number
	lineHeight: number
	cellPaddingX: number
	cellPaddingY: number
	emptyText: string
}
