import {
	SVG_EXPORT_FRAGMENT as Fragment,
	getColorValue,
	svgExportElement as createElement,
	type Editor,
	type SvgExportContext,
	type SvgExportNode,
	type SvgExportChild,
	type TLShapeId,
} from '@tldraw/editor'
import type {
	TLDefaultColorStyle,
	TLDefaultDashStyle,
	TLDefaultFillStyle,
	TLDefaultFontStyle,
	TLDefaultSizeStyle,
} from '@tldraw/tlschema'
import type { VueBoxShape } from './vueBoxShape'
import { getVueBoxMarkSegments, getVueBoxPath } from './vueBoxGeometry'
import { getDashArray, VUE_FONT_SIZE_SCALE, VUE_STROKE_SIZES } from './vueStyleDefs'
import type {
	VueArrowShape,
	VueDrawShape,
	VueImageShape,
	VueLineShape,
	VueTextShape,
} from './vueDefaultShapes'
import type { VueFrameShape } from './extensions/frame/vueFrameShape'
import type { VueTableColumn, VueTableShape } from './extensions/table/vueTableShape'
import {
	getTableMergeBoundaryGaps,
	findTableMerge,
	normalizeTableMergeCells,
} from '../components/shapes/tableStructure'
import {
	clampVueTableRowHeight,
	getVueTableRowLayouts,
} from './extensions/table/tableRowHeight'
import { getVueTableColumnWidths } from './extensions/table/tableSizing'
import type { VueResumeSectionShape, VueResumeShape } from './extensions/resume/vueResumeShape'

const VUE_VISIBLE_BORDER_COLOR = '#111827'
const VUE_MATERIAL_TABLE_BORDER_COLOR = '#111827'
const VUE_MATERIAL_TABLE_GRID_COLOR = '#d1d5db'
const VUE_MATERIAL_PRINT_GRID_COLOR = '#111827'
const VUE_RESUME_BORDER_COLOR = '#cbd5e1'
const VUE_RESUME_ACCENT_COLOR = '#0f766e'

type VueMaterialSvgShape = {
	id: TLShapeId
	props: {
		w: number
		h: number
		name: string
	}
}

type VueMaterialSectionSvgShape = {
	id: TLShapeId
	props: {
		w: number
		h: number
		zone: string
		label: string
		containerList?: boolean
	}
}

export interface VueMaterialPrintTableColumn {
	field?: string
	label: string
	width: number
	type?: string
	formatter?: unknown
	children?: any[]
}

export interface VueMaterialPrintTableCell {
	text: string
	lines: string[]
}

export interface VueMaterialPrintTableRow {
	key: string
	cells: VueMaterialPrintTableCell[]
	height: number
}

export interface VueMaterialPrintTableOverride {
	layout?: 'table' | 'container-list'
	columns: VueMaterialPrintTableColumn[]
	rows: VueMaterialPrintTableRow[]
	headerHeight: number
	fontSize: number
	lineHeight: number
	paddingX: number
	paddingY: number
	renderedHeight: number
	emptyText: string
	listColumnCount?: number
	listItemGap?: number
	listItemWidth?: number
}

let vueMaterialPrintTableOverrides = new Map<TLShapeId, VueMaterialPrintTableOverride>()

export interface VueResumePrintItem {
	name: string
	title: string
	period: string
	description: string
}

export interface VueResumePrintOverride {
	items: VueResumePrintItem[]
	fontSize: number
	lineHeight: number
	itemGap: number
	pageNo: number
	total: number
}

let vueResumePrintOverrides = new Map<TLShapeId, VueResumePrintOverride>()

export function setVueMaterialPrintTableOverrides(
	overrides: Map<TLShapeId, VueMaterialPrintTableOverride>
) {
	vueMaterialPrintTableOverrides = new Map(overrides)
}

export function clearVueMaterialPrintTableOverrides() {
	vueMaterialPrintTableOverrides.clear()
}

export function setVueResumePrintOverrides(overrides: Map<TLShapeId, VueResumePrintOverride>) {
	vueResumePrintOverrides = new Map(overrides)
}

export function clearVueResumePrintOverrides() {
	vueResumePrintOverrides.clear()
}

export function createVueBoxSvg(editor: Editor, shape: VueBoxShape): SvgExportNode {
	const strokeWidth = getVueStrokeWidth(shape.props.size)
	const strokeColor = getVueThemeColor(editor, shape.props.color, 'solid')
	const fill = getVueFill(editor, shape.id, shape.props.color, shape.props.fill)
	const path = getVueBoxPath(
		shape.props.geo,
		shape.props.w,
		shape.props.h,
		shape.props.borderRadius
	)
	const dashArray = getDashArray(shape.props.dash, strokeWidth)

	return createElement(
		'g',
		null,
		fill.def,
		createElement('path', {
			d: path,
			fill: fill.value,
			stroke: strokeColor,
			strokeWidth,
			strokeDasharray: dashArray,
		}),
		createBoxMarkSvg(
			shape.props.geo,
			shape.props.w,
			shape.props.h,
			shape.props.fill === 'solid' ? '#ffffff' : strokeColor
		)
	)
}

export function createVueTextSvg(editor: Editor, shape: VueTextShape): SvgExportNode {
	const fontSize = getVueFontSize(editor, shape.props.size, shape.props.fontSize)
	const lineHeight = Math.max(fontSize, Math.ceil(fontSize * editor.getCurrentTheme().lineHeight))
	const paddingLeft = 1 + Math.max(0, shape.props.paddingLeft)
	const paddingRight = 1 + Math.max(0, shape.props.paddingRight)
	const paddingTop = 1 + Math.max(0, shape.props.paddingTop)
	const paddingBottom = 1 + Math.max(0, shape.props.paddingBottom)
	const lines = wrapVueTextForSvg(
		shape.props.text,
		Math.max(1, shape.props.w - paddingLeft - paddingRight),
		fontSize
	)
	const textX = getVueTextSvgX(shape.props.justifyContent, shape.props.w, paddingLeft, paddingRight)
	const textAnchor = getVueTextSvgAnchor(shape.props.justifyContent)
	const lineHeightTotal = lines.length * lineHeight
	const extraHeight = Math.max(0, shape.props.h - paddingTop - paddingBottom - lineHeightTotal)
	const blockOffset = shape.props.alignItems === 'end'
		? extraHeight
		: shape.props.alignItems === 'center'
			? extraHeight / 2
			: 0
	const firstBaseline = paddingTop + blockOffset + fontSize
	const textChildren = lines.map((line, index) =>
		createElement(
			'tspan',
			{
				x: textX,
				y: firstBaseline + index * lineHeight,
			},
			line || '\u00a0'
		)
	)

	return createElement(
		'g',
		null,
		createElement('rect', {
			width: shape.props.w,
			height: shape.props.h,
			fill: 'transparent',
			...getOptionalBorderSvgProps(shape),
		}),
		createElement(
			'text',
			{
				x: textX,
				textAnchor,
				y: firstBaseline,
				fill: getVueThemeColor(editor, shape.props.color, 'solid'),
				fontFamily: getVueFontFamily(editor, shape.props.font),
				fontSize,
				dominantBaseline: 'alphabetic',
				pointerEvents: 'none',
			},
			textChildren
		)
	)
}

function getVueTextSvgX(
	justifyContent: VueTextShape['props']['justifyContent'],
	width: number,
	paddingLeft: number,
	paddingRight: number
) {
	return justifyContent === 'center' ? width / 2 : justifyContent === 'end' ? width - paddingRight : paddingLeft
}

function getVueTextSvgAnchor(justifyContent: VueTextShape['props']['justifyContent']) {
	return justifyContent === 'center' ? 'middle' : justifyContent === 'end' ? 'end' : 'start'
}

export async function createVueImageSvg(
	editor: Editor,
	shape: VueImageShape,
	ctx: SvgExportContext
): Promise<SvgExportNode> {
	const src = shape.props.assetId
		? (await ctx.resolveAssetUrl(shape.props.assetId, shape.props.w)) ?? shape.props.src
		: shape.props.src

	if (!src) {
		return createElement(
			'g',
			null,
			createElement('rect', {
				width: shape.props.w,
				height: shape.props.h,
				fill: '#f8fafc',
				...getOptionalBorderSvgProps(shape),
			}),
			createCenteredSvgText('IMG', shape.props.w, shape.props.h, {
				fill: '#64748b',
				fontSize: 13,
				fontWeight: 700,
			})
		)
	}

	return createElement(
		'g',
		null,
		createElement('rect', {
			width: shape.props.w,
			height: shape.props.h,
			fill: 'none',
			...getOptionalBorderSvgProps(shape),
		}),
		createElement('image', {
			href: src,
			width: shape.props.w,
			height: shape.props.h,
			preserveAspectRatio: 'xMidYMid meet',
		})
	)
}

export function createVueLineSvg(editor: Editor, shape: VueLineShape): SvgExportNode {
	const strokeWidth = getVueStrokeWidth(shape.props.size)
	return createElement('line', {
		x1: shape.props.start.x,
		y1: shape.props.start.y,
		x2: shape.props.end.x,
		y2: shape.props.end.y,
		fill: 'none',
		stroke: getVueThemeColor(editor, shape.props.color, 'solid'),
		strokeWidth,
		strokeDasharray: getDashArray(shape.props.dash, strokeWidth),
		strokeLinecap: 'round',
		strokeLinejoin: 'round',
	})
}

export function createVueArrowSvg(editor: Editor, shape: VueArrowShape): SvgExportNode {
	const strokeWidth = getVueStrokeWidth(shape.props.size)
	const color = getVueThemeColor(editor, shape.props.color, 'solid')
	const markerId = `vue-arrow-head-${sanitizeSvgId(shape.id)}`

	return createElement(
		'g',
		null,
		createElement(
			'defs',
			null,
			createElement(
				'marker',
				{
					id: markerId,
					markerWidth: 8,
					markerHeight: 8,
					refX: 6,
					refY: 4,
					orient: 'auto',
					markerUnits: 'strokeWidth',
				},
				createElement('path', {
					d: 'M0,0 L8,4 L0,8 Z',
					fill: color,
				})
			)
		),
		createElement('line', {
			x1: shape.props.start.x,
			y1: shape.props.start.y,
			x2: shape.props.end.x,
			y2: shape.props.end.y,
			fill: 'none',
			stroke: color,
			strokeWidth,
			strokeDasharray: getDashArray(shape.props.dash, strokeWidth),
			strokeLinecap: 'round',
			strokeLinejoin: 'round',
			markerEnd: `url(#${markerId})`,
		})
	)
}

export function createVueDrawSvg(editor: Editor, shape: VueDrawShape): SvgExportNode {
	const strokeWidth = getVueStrokeWidth(shape.props.size)
	return createElement('polyline', {
		points: shape.props.points.map((point) => `${point.x},${point.y}`).join(' '),
		fill: 'none',
		stroke: getVueThemeColor(editor, shape.props.color, 'solid'),
		strokeWidth,
		strokeDasharray: getDashArray(shape.props.dash, strokeWidth),
		strokeLinecap: 'round',
		strokeLinejoin: 'round',
	})
}

export function createVueFrameSvg(shape: VueFrameShape): SvgExportNode {
	if (!shape.props.showBorder) return createElement('g', null)

	return createElement(
		'g',
		null,
		createElement('rect', {
			width: shape.props.w,
			height: shape.props.h,
			fill: 'transparent',
			stroke: VUE_VISIBLE_BORDER_COLOR,
			strokeWidth: 1.5,
			rx: 3,
		})
	)
}

export function createVueTableSvg(
	shape: VueTableShape,
	options: { background?: boolean; grid?: boolean } = {}
): SvgExportNode {
	const includeBackground = options.background ?? true
	const includeGrid = options.grid ?? true
	const width = Math.max(1, shape.props.w)
	const height = Math.max(1, shape.props.h)
	const defaultRowHeight = clampVueTableRowHeight(shape.props.rowHeight)
	const columns = shape.props.columns.length
		? shape.props.columns
		: [{ field: 'value', title: 'Value', width }]
	const columnWidths = getVueTableColumnWidths(columns, width)
	const columnOffsets = columnWidths.reduce<number[]>((offsets, columnWidth) => {
		offsets.push((offsets[offsets.length - 1] ?? 0) + columnWidth)
		return offsets
	}, [0])
	const mergeCells = normalizeTableMergeCells(
		shape.props.mergeCells,
		shape.props.rows.length,
		columns.length
	)
	const clipId = `vue-table-clip-${sanitizeSvgId(shape.id)}`
	const children: SvgExportChild[] = []
	if (includeGrid) {
		children.push(
			createElement(
				'defs',
				null,
				createElement(
					'clipPath',
					{ id: clipId },
					createElement('rect', {
						width,
						height,
					})
				)
			)
		)
	}
	if (includeBackground) {
		children.push(
			createElement('rect', {
				width,
				height,
				fill: '#ffffff',
			})
		)
	}

	const gridChildren: SvgExportChild[] = []
	if (!includeGrid) return createElement('g', null, children)
	const allRowLayouts = getVueTableRowLayouts(
		shape.props.rows,
		defaultRowHeight,
		shape.props.rowHeights,
		height
	)
	const rowLayouts = allRowLayouts.filter(layout => layout.y < height)
	let rowY = 0
	for (const layout of rowLayouts) {
		rowY = layout.bottom
		if (layout.bottom < height) {
			const gaps = getTableMergeBoundaryGaps(mergeCells, 'row', layout.index, columnOffsets)
			pushVueTableGridLineSegments(gridChildren, true, layout.bottom, width, gaps)
		}
	}
	for (let y = rowY + defaultRowHeight; y < height; y += defaultRowHeight) {
		pushVueTableGridLineSegments(gridChildren, true, y, width, [])
	}

	const rowOffsets = allRowLayouts.map(layout => layout.y)
	if (allRowLayouts.length) rowOffsets.push(allRowLayouts[allRowLayouts.length - 1].bottom)
	let x = 0
	for (const [columnIndex, columnWidth] of columnWidths.slice(0, -1).entries()) {
		x += columnWidth
		const gaps = getTableMergeBoundaryGaps(mergeCells, 'col', columnIndex, rowOffsets)
		pushVueTableGridLineSegments(gridChildren, false, x, height, gaps)
	}

	for (const merge of mergeCells) {
		const firstRow = rowLayouts[merge.row]
		const lastRow = allRowLayouts[merge.row + merge.rowspan - 1]
		if (!firstRow || !lastRow || firstRow.y >= height) continue
		const left = columnOffsets[merge.col] ?? 0
		const right = columnOffsets[merge.col + merge.colspan] ?? left
		gridChildren.push(createElement('rect', {
			x: left,
			y: firstRow.y,
			width: Math.max(0, right - left),
			height: Math.max(0, lastRow.bottom - firstRow.y),
			fill: 'none',
			stroke: VUE_MATERIAL_TABLE_GRID_COLOR,
			strokeWidth: 1.5,
			vectorEffect: 'non-scaling-stroke',
		}))
	}

	children.push(
		createElement(
			'g',
			{
				clipPath: `url(#${clipId})`,
			},
			gridChildren
		)
	)

	if (shape.props.showBorder) {
		children.push(
			createElement('rect', {
				width,
				height,
				fill: 'none',
				stroke: VUE_MATERIAL_TABLE_BORDER_COLOR,
				strokeWidth: 1.5,
				vectorEffect: 'non-scaling-stroke',
			})
		)
	}

	return createElement('g', null, children)
}

export function createVueMaterialSvg(shape: VueMaterialSvgShape): SvgExportNode {
	const width = Math.max(1, shape.props.w)
	const height = Math.max(1, shape.props.h)

	return createElement(
		'g',
		null,
		createElement('rect', {
			width,
			height,
			fill: '#ffffff',
			stroke: VUE_MATERIAL_TABLE_BORDER_COLOR,
			strokeWidth: 1.5,
		})
	)
}

export function createVueMaterialSectionSvg(shape: VueMaterialSectionSvgShape): SvgExportNode {
	const width = Math.max(1, shape.props.w)
	const height = Math.max(1, shape.props.h)

	if (shape.props.zone !== 'tableBody') return createElement('g', null)

	const override = vueMaterialPrintTableOverrides.get(shape.id)
	if (shape.props.containerList && !override) {
		return createVueMaterialPrintListSvg(shape.id, width, height, {
			layout: 'container-list',
			columns: [],
			rows: [],
			headerHeight: 0,
			fontSize: 12,
			lineHeight: 16,
			paddingX: 8,
			paddingY: 6,
			renderedHeight: height,
			emptyText: '将内容放入列表项 Frame',
		})
	}
	return override
		? override.layout === 'container-list'
			? createVueMaterialPrintListSvg(shape.id, width, height, override)
			: createVueMaterialPrintTableSvg(shape.id, width, height, override)
		: createVueMaterialPlaceholderTableSvg(shape.id, width, height)
}

function createVueMaterialPlaceholderTableSvg(
	shapeId: TLShapeId,
	width: number,
	height: number
): SvgExportNode {
	const headerHeight = Math.min(40, Math.max(24, height))
	const patternId = `vue-material-placeholder-grid-${sanitizeSvgId(shapeId)}`
	const columnLabels = ['Sales order', 'Status', 'Review date', 'Customer']
	const columnWidths = getVueTableColumnWidths(
		[
			{ field: 'salesOrder', title: columnLabels[0], width: width * 0.24 },
			{ field: 'status', title: columnLabels[1], width: width * 0.12 },
			{ field: 'reviewDate', title: columnLabels[2], width: width * 0.2 },
			{ field: 'customer', title: columnLabels[3], width: width * 0.44 },
		],
		width
	)
	const children: SvgExportChild[] = [
		createVueTableGridLine(0, headerHeight, width, headerHeight),
		createElement('rect', {
			y: headerHeight,
			width,
			height: Math.max(0, height - headerHeight),
			fill: `url(#${patternId})`,
			opacity: 0.5,
		}),
		createElement(
			'defs',
			null,
			createElement(
				'pattern',
				{
					id: patternId,
					width: 10,
					height: 10,
					patternUnits: 'userSpaceOnUse',
				},
				createElement('path', {
					d: 'M10 0H0V10',
					fill: 'none',
					stroke: '#e5e7eb',
					strokeWidth: 1,
				})
			)
		),
	]

	let x = 0
	for (const [index, columnWidth] of columnWidths.entries()) {
		if (index > 0) {
			children.push(createVueTableGridLine(x, 0, x, height))
		}
		children.push(
			createElement(
				'text',
				{
					x: x + columnWidth / 2,
					y: headerHeight / 2,
					fill: '#111827',
					fontFamily: 'Inter, Arial, sans-serif',
					fontSize: 13,
					fontWeight: 700,
					textAnchor: 'middle',
					dominantBaseline: 'middle',
					pointerEvents: 'none',
				},
				fitVueTableCellText(columnLabels[index] ?? '', columnWidth, 13, 8)
			)
		)
		x += columnWidth
	}

	children.push(
		createElement(
			'text',
			{
				x: width / 2,
				y: headerHeight + Math.max(0, height - headerHeight) / 2,
				fill: '#d3d7de',
				fontFamily: 'Inter, Arial, sans-serif',
				fontSize: 14,
				fontWeight: 700,
				textAnchor: 'middle',
				dominantBaseline: 'middle',
				pointerEvents: 'none',
			},
			'Auto fill'
		)
	)

	return createElement('g', null, children)
}

function createVueMaterialPrintTableSvg(
	shapeId: TLShapeId,
	width: number,
	height: number,
	override: VueMaterialPrintTableOverride
): SvgExportNode {
	const clipId = `vue-material-table-clip-${sanitizeSvgId(shapeId)}`
	const renderedHeight = Math.min(height, Math.max(0, override.renderedHeight))
	const borderSize = Math.min(1, width / 2, renderedHeight / 2)
	const contentWidth = Math.max(0, width - borderSize * 2)
	const contentHeight = Math.max(0, renderedHeight - borderSize * 2)
	const headerHeight = Math.min(contentHeight, Math.max(0, override.headerHeight))
	const columnWidths = getVueMaterialPrintColumnWidths(override.columns, contentWidth)
	const leafColumns = flattenVueMaterialPrintColumns(override.columns)
	const headerDepth = getVueMaterialPrintColumnDepth(override.columns)
	const headerRowHeight = headerHeight / Math.max(1, headerDepth)
	const defs = createElement(
		'defs',
		null,
		createElement(
			'clipPath',
			{ id: clipId },
			createElement('rect', {
				width: contentWidth,
				height: contentHeight,
			})
		)
	)
	const children: SvgExportChild[] = [
		createElement('rect', {
			width: contentWidth,
			height: contentHeight,
			fill: '#ffffff',
		}),
		createVueTableGridLine(0, headerHeight, contentWidth, headerHeight),
	]

	const headerCells = createVueMaterialPrintHeaderCells(override.columns)
	for (const cell of headerCells) {
		const x = columnWidths.slice(0, cell.start).reduce((sum, value) => sum + value, 0)
		const cellWidth = columnWidths.slice(cell.start, cell.end).reduce((sum, value) => sum + value, 0)
		const y = (cell.depth - 1) * headerRowHeight
		const cellHeight = cell.rowSpan * headerRowHeight
		children.push(createElement('rect', {
			x,
			y,
			width: cellWidth,
			height: cellHeight,
			fill: '#ffffff',
			stroke: VUE_MATERIAL_PRINT_GRID_COLOR,
			strokeWidth: 1,
		}))
		children.push(
			createElement(
				'text',
				{
					x: x + cellWidth / 2,
					y: y + cellHeight / 2,
					fill: '#111827',
					fontFamily: 'Inter, Arial, sans-serif',
					fontSize: Math.max(12, override.fontSize),
					fontWeight: 700,
					textAnchor: 'middle',
					dominantBaseline: 'middle',
					pointerEvents: 'none',
				},
				fitVueTableCellText(cell.label, cellWidth, Math.max(12, override.fontSize), override.paddingX)
			)
		)
	}

	let x = 0
	for (const [columnIndex] of leafColumns.entries()) {
		const columnWidth = columnWidths[columnIndex] ?? 0
		if (columnIndex > 0) children.push(createVueTableGridLine(x, headerHeight, x, contentHeight))
		x += columnWidth
	}

	let rowY = headerHeight
	for (const row of override.rows) {
		const rowHeight = Math.max(1, row.height)
		children.push(createVueTableGridLine(0, rowY + rowHeight, contentWidth, rowY + rowHeight))

		let cellX = 0
		for (const [cellIndex, cell] of row.cells.entries()) {
			const columnWidth = columnWidths[cellIndex] ?? 0
			const maxLines = Math.max(
				1,
				Math.floor((rowHeight - override.paddingY * 2) / Math.max(1, override.lineHeight))
			)
			const lines = cell.lines.slice(0, maxLines)
			const lineChildren = lines.map((line, lineIndex) =>
				createElement(
					'tspan',
					{
						x: cellX + override.paddingX,
						dy: lineIndex === 0 ? 0 : override.lineHeight,
					},
						fitVueTableCellText(line, columnWidth, override.fontSize, override.paddingX)
				)
			)

			children.push(
				createElement(
					'text',
					{
						x: cellX + override.paddingX,
						y: rowY + override.paddingY + override.fontSize,
						fill: '#111827',
						fontFamily: 'Inter, Arial, sans-serif',
						fontSize: override.fontSize,
						pointerEvents: 'none',
					},
					lineChildren
				)
			)
			cellX += columnWidth
		}
		rowY += rowHeight
	}

	return createElement(
		'g',
		null,
		defs,
		createElement(
			'g',
			{
				clipPath: `url(#${clipId})`,
				transform: `translate(${borderSize} ${borderSize})`,
			},
			children
		),
		createElement('rect', {
			x: 0.5,
			y: 0.5,
			width: Math.max(0, width - 1),
			height: Math.max(0, renderedHeight - 1),
			fill: 'none',
			stroke: VUE_MATERIAL_TABLE_BORDER_COLOR,
			strokeWidth: 1,
			strokeDasharray: 'none',
			vectorEffect: 'non-scaling-stroke',
		})
	)
}

function createVueMaterialPrintListSvg(
	shapeId: TLShapeId,
	width: number,
	height: number,
	override: VueMaterialPrintTableOverride,
): SvgExportNode {
	const renderedHeight = Math.min(height, Math.max(0, override.renderedHeight))
	const borderSize = Math.min(1, width / 2, renderedHeight / 2)
	const contentWidth = Math.max(0, width - borderSize * 2)
	const contentHeight = Math.max(0, renderedHeight - borderSize * 2)
	const gap = Math.max(0, override.listItemGap ?? 12)
	const columnCount = Math.max(1, Math.floor(override.listColumnCount ?? 1))
	const itemWidth = Math.max(
		1,
		override.listItemWidth ?? (contentWidth - gap * (columnCount - 1)) / columnCount,
	)
	const leafColumns = flattenVueMaterialPrintColumns(override.columns)
	const clipId = `vue-material-list-clip-${sanitizeSvgId(shapeId)}`
	const children: SvgExportChild[] = [
		createElement('rect', {
			width: contentWidth,
			height: contentHeight,
			fill: '#ffffff',
		}),
	]

	if (!override.rows.length) {
		children.push(
			createElement('text', {
				x: contentWidth / 2,
				y: contentHeight / 2,
				fill: '#9ca3af',
				fontFamily: 'Inter, Arial, sans-serif',
				fontSize: Math.max(12, override.fontSize),
				textAnchor: 'middle',
				dominantBaseline: 'middle',
			},
				override.emptyText,
			)
		)
	} else {
		let x = 0
		let y = 0
		let rowHeight = 0
		for (const row of override.rows) {
			const cardHeight = Math.max(72, row.height + override.paddingY * 2 + override.lineHeight)
			if (x > 0 && x + itemWidth > contentWidth + 0.01) {
				x = 0
				y += rowHeight + gap
				rowHeight = 0
			}
			if (y >= contentHeight) break
			const cardWidth = Math.min(itemWidth, contentWidth - x)
			children.push(
				createElement('rect', {
					x,
					y,
					width: cardWidth,
					height: Math.min(cardHeight, contentHeight - y),
					fill: '#ffffff',
					stroke: '#cbd5e1',
					strokeWidth: 1,
					rx: 3,
				})
			)

			let textY = y + override.paddingY + override.fontSize
			for (const [cellIndex, cell] of row.cells.entries()) {
				if (textY > contentHeight) break
				const label = leafColumns[cellIndex]?.label ?? ''
				const value = cell.lines[0] ?? cell.text
				const text = label ? `${label}: ${value}` : value
				children.push(
					createElement('text', {
						x: x + override.paddingX,
						y: textY,
						fill: '#111827',
						fontFamily: 'Inter, Arial, sans-serif',
						fontSize: override.fontSize,
					},
						fitVueTableCellText(text, Math.max(1, cardWidth - override.paddingX * 2), override.fontSize, override.paddingX),
					)
				)
				textY += override.lineHeight
			}
			x += itemWidth + gap
			rowHeight = Math.max(rowHeight, cardHeight)
		}
	}

	const defs = createElement(
		'defs',
		null,
		createElement(
			'clipPath',
			{ id: clipId },
			createElement('rect', { width: contentWidth, height: contentHeight }),
		),
	)
	return createElement(
		'g',
		null,
		defs,
		createElement(
			'g',
			{ clipPath: `url(#${clipId})`, transform: `translate(${borderSize} ${borderSize})` },
			children,
		),
		createElement('rect', {
			x: 0.5,
			y: 0.5,
			width: Math.max(0, width - 1),
			height: Math.max(0, renderedHeight - 1),
			fill: 'none',
			stroke: VUE_MATERIAL_TABLE_BORDER_COLOR,
			strokeWidth: 1,
		}),
	)
}

function getVueMaterialPrintColumnWidths(
	columns: readonly VueMaterialPrintTableColumn[],
	width: number
) {
	const leafColumns = flattenVueMaterialPrintColumns(columns)
	if (!leafColumns.length) return [width]

	const total = leafColumns.reduce((sum, column) => sum + Math.max(36, column.width), 0)
	if (total <= 0) return leafColumns.map(() => width / leafColumns.length)

	const widths = leafColumns.map((column) => (Math.max(36, column.width) / total) * width)
	const diff = width - widths.reduce((sum, columnWidth) => sum + columnWidth, 0)
	widths[widths.length - 1] += diff
	return widths
}

function flattenVueMaterialPrintColumns(
	columns: readonly VueMaterialPrintTableColumn[],
	result: VueMaterialPrintTableColumn[] = [],
) {
	columns.forEach((column) => {
		if (column.children?.length) {
			flattenVueMaterialPrintColumns(column.children as VueMaterialPrintTableColumn[], result)
		} else {
			result.push(column)
		}
	})
	return result
}

function getVueMaterialPrintColumnDepth(columns: readonly VueMaterialPrintTableColumn[]): number {
	if (!columns.length) return 1
	return Math.max(1, ...columns.map((column) =>
		column.children?.length
			? 1 + getVueMaterialPrintColumnDepth(column.children as VueMaterialPrintTableColumn[])
			: 1
	))
}

function createVueMaterialPrintHeaderCells(columns: readonly VueMaterialPrintTableColumn[]) {
	const maxDepth = getVueMaterialPrintColumnDepth(columns)
	const cells: Array<{
		label: string
		start: number
		end: number
		depth: number
		rowSpan: number
	}> = []
	let leafIndex = 0

	function visit(items: readonly VueMaterialPrintTableColumn[], depth: number) {
		items.forEach((column) => {
			const children = column.children?.length
				? column.children as VueMaterialPrintTableColumn[]
				: []
			const start = leafIndex
			if (children.length) visit(children, depth + 1)
			else leafIndex += 1
			cells.push({
				label: column.label,
				start,
				end: leafIndex,
				depth,
				rowSpan: children.length ? 1 : maxDepth - depth + 1,
			})
		})
	}

	visit(columns, 1)
	return cells
}

function getVueThemeColor(
	editor: Editor,
	color: TLDefaultColorStyle | string,
	variant: 'solid' | 'semi' | 'fill' | 'pattern'
) {
	return getColorValue(editor.getCurrentTheme().colors[editor.getColorMode()], color, variant)
}

function getVueFill(
	editor: Editor,
	shapeId: string,
	color: TLDefaultColorStyle,
	fill: TLDefaultFillStyle
) {
	if (fill === 'none') return { value: 'transparent', def: null }
	if (fill === 'semi') return { value: getVueThemeColor(editor, color, 'semi'), def: null }
	if (fill === 'solid') return { value: getVueThemeColor(editor, color, 'fill'), def: null }

	const patternId = `vue-pattern-${sanitizeSvgId(shapeId)}`
	const patternColor = getVueThemeColor(editor, color, 'pattern')
	return {
		value: `url(#${patternId})`,
		def: createElement(
			'defs',
			null,
			createElement(
				'pattern',
				{
					id: patternId,
					width: 12,
					height: 12,
					patternUnits: 'userSpaceOnUse',
					patternTransform: 'rotate(135)',
				},
				createElement('rect', {
					width: 12,
					height: 12,
					fill: getVueThemeColor(editor, color, 'semi'),
				}),
				createElement('rect', {
					x: 6,
					width: 1,
					height: 12,
					fill: patternColor,
				})
			)
		),
	}
}

function getVueStrokeWidth(size: TLDefaultSizeStyle) {
	return VUE_STROKE_SIZES[size]
}

function getVueFontSize(editor: Editor, size: TLDefaultSizeStyle, override?: number) {
	const configuredFontSize = Number(override)
	return Number.isFinite(configuredFontSize) && configuredFontSize > 0
		? configuredFontSize
		: Math.round(editor.getCurrentTheme().fontSize * VUE_FONT_SIZE_SCALE[size])
}

function getVueFontFamily(editor: Editor, font: TLDefaultFontStyle) {
	const theme = editor.getCurrentTheme()
	const themeFont = theme.fonts[font as keyof typeof theme.fonts]
	return themeFont?.fontFamily ?? 'sans-serif'
}

function createCenteredSvgText(
	text: string,
	width: number,
	height: number,
	style: {
		fill: string
		fontSize: number
		fontWeight: number
	}
) {
	return createElement(
		'text',
		{
			x: width / 2,
			y: height / 2,
			fill: style.fill,
			fontFamily: 'sans-serif',
			fontSize: style.fontSize,
			fontWeight: style.fontWeight,
			textAnchor: 'middle',
			dominantBaseline: 'middle',
			pointerEvents: 'none',
		},
		text
	)
}

function getOptionalBorderSvgProps(shape: {
	props: {
		showBorder?: boolean
	}
}) {
	return shape.props.showBorder
		? {
				stroke: VUE_VISIBLE_BORDER_COLOR,
				strokeWidth: 1,
			}
		: {
				stroke: 'none',
				strokeWidth: 0,
			}
}

function createVueTableGridLine(x1: number, y1: number, x2: number, y2: number) {
	return createElement('line', {
		x1,
		y1,
		x2,
		y2,
		stroke: VUE_MATERIAL_PRINT_GRID_COLOR,
		strokeWidth: 1.5,
		strokeDasharray: 'none',
		vectorEffect: 'non-scaling-stroke',
	})
}

function pushVueTableGridLineSegments(
	children: SvgExportChild[],
	horizontal: boolean,
	position: number,
	length: number,
	gaps: Array<{ start: number; end: number }>
) {
	let cursor = 0
	for (const gap of gaps.sort((a, b) => a.start - b.start)) {
		const gapStart = Math.max(0, Math.min(length, gap.start))
		const gapEnd = Math.max(0, Math.min(length, gap.end))
		if (gapStart > cursor) {
			children.push(horizontal
				? createVueTableGridLine(cursor, position, gapStart, position)
				: createVueTableGridLine(position, cursor, position, gapStart))
		}
		cursor = Math.max(cursor, gapEnd)
	}
	if (cursor < length) {
		children.push(horizontal
			? createVueTableGridLine(cursor, position, length, position)
			: createVueTableGridLine(position, cursor, position, length))
	}
}

function wrapVueTextForSvg(text: string, width: number, fontSize: number) {
	const lines: string[] = []

	for (const paragraph of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
		if (!paragraph) {
			lines.push('')
			continue
		}

		let line = ''
		for (const character of paragraph) {
			const candidate = `${line}${character}`
			if (line && getApproximateSvgTextWidth(candidate, fontSize) > width) {
				lines.push(line)
				line = character
			} else {
				line = candidate
			}
		}
		lines.push(line)
	}

	return lines.length ? lines : ['']
}

function getApproximateSvgTextWidth(text: string, fontSize: number) {
	let width = 0
	for (const character of text) {
		if (/\s/u.test(character)) width += fontSize * 0.33
		else if (/^[\x00-\x7F]$/u.test(character)) width += fontSize * 0.56
		else width += fontSize
	}
	return width
}

function fitVueTableCellText(value: string, width: number, fontSize = 12, paddingX = 8) {
	const text = String(value ?? '')
	const availableWidth = Math.max(0, width - paddingX * 2 - 2)
	if (!text || availableWidth <= 0) return ''
	if (getApproximateSvgTextWidth(text, fontSize) <= availableWidth) return text

	const ellipsis = '...'
	const ellipsisWidth = getApproximateSvgTextWidth(ellipsis, fontSize)
	if (availableWidth <= ellipsisWidth) return ''

	let fitted = ''
	for (const character of text) {
		const candidate = `${fitted}${character}`
		if (getApproximateSvgTextWidth(`${candidate}${ellipsis}`, fontSize) > availableWidth) break
		fitted = candidate
	}
	return fitted ? `${fitted}${ellipsis}` : ''
}

function createBoxMarkSvg(
	geo: VueBoxShape['props']['geo'],
	width: number,
	height: number,
	stroke: string
) {
	const segments = getVueBoxMarkSegments(geo, width, height)
	if (!segments.length) return null

	return createElement(
		Fragment,
		null,
		...segments.map((segment) => createElement('line', {
			...segment,
			stroke,
			strokeWidth: 3,
			strokeLinecap: 'round',
			strokeLinejoin: 'round',
		}))
	)
}

export function createVueResumeSvg(shape: VueResumeShape): SvgExportNode {
	return createElement('g', null, createElement('rect', {
		width: Math.max(1, shape.props.w), height: Math.max(1, shape.props.h), fill: '#ffffff', stroke: VUE_RESUME_BORDER_COLOR, strokeWidth: 1.5,
	}))
}

export function createVueResumeSectionSvg(shape: VueResumeSectionShape): SvgExportNode {
	const width = Math.max(1, shape.props.w)
	const height = Math.max(1, shape.props.h)
	const override = vueResumePrintOverrides.get(shape.id)
	const children: SvgExportChild[] = [createElement('rect', {
		width, height, fill: '#ffffff', stroke: VUE_RESUME_BORDER_COLOR, strokeWidth: 1,
	})]

	if (shape.props.zone === 'pageHeader') {
		children.push(createElement('line', { x1: 0, y1: Math.min(height - 1, 58), x2: width, y2: Math.min(height - 1, 58), stroke: VUE_RESUME_ACCENT_COLOR, strokeWidth: 2 }))
		children.push(createElement('text', { x: 20, y: Math.min(height - 18, 38), fill: '#0f172a', fontFamily: 'Arial, sans-serif', fontSize: 24, fontWeight: 700 }, 'RESUME'))
	} else if (shape.props.zone === 'pageFooter') {
		const footerText = override ? `第 ${override.pageNo} / ${override.total} 页` : '简历分页组件'
		children.push(createElement('text', { x: width - 16, y: Math.max(18, height / 2), fill: '#64748b', fontFamily: 'Arial, sans-serif', fontSize: 11, textAnchor: 'end', dominantBaseline: 'middle' }, footerText))
	} else if (override) {
		children.push(...createVueResumeItemsSvg(override.items, width, height, override))
	}

	return createElement('g', null, children)
}

function createVueResumeItemsSvg(items: readonly VueResumePrintItem[], width: number, height: number, options: VueResumePrintOverride): SvgExportChild[] {
	const result: SvgExportChild[] = []
	let y = 26
	for (const item of items) {
		if (y >= height - 8) break
		result.push(createElement('text', { x: 18, y, fill: '#0f172a', fontFamily: 'Arial, sans-serif', fontSize: options.fontSize, fontWeight: 700 }, fitSvgText(item.name || item.title, width - 36, options.fontSize)))
		if (item.title || item.period) {
			result.push(createElement('text', { x: width - 18, y, fill: '#64748b', fontFamily: 'Arial, sans-serif', fontSize: Math.max(10, options.fontSize - 1), textAnchor: 'end' }, fitSvgText([item.title, item.period].filter(Boolean).join(' · '), width * 0.52, options.fontSize)))
		}
		y += options.lineHeight
		for (const line of wrapSvgText(item.description, width - 36, options.fontSize)) {
			if (y >= height - 8) break
			result.push(createElement('text', { x: 18, y, fill: '#334155', fontFamily: 'Arial, sans-serif', fontSize: options.fontSize }, line))
			y += options.lineHeight
		}
		y += options.itemGap
	}
	return result
}

function fitSvgText(text: string, width: number, fontSize: number) {
	const maxChars = Math.max(1, Math.floor(width / Math.max(5, fontSize * 0.56)))
	return text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1))}…`
}

function wrapSvgText(text: string, width: number, fontSize: number) {
	const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
	if (!normalized) return []
	const maxChars = Math.max(1, Math.floor(width / Math.max(5, fontSize * 0.56)))
	const lines: string[] = []
	for (let index = 0; index < normalized.length; index += maxChars) lines.push(normalized.slice(index, index + maxChars))
	return lines
}

function sanitizeSvgId(id: string) {
	return id.replace(/[^a-zA-Z0-9_-]/g, '-')
}
