import {
	SVG_EXPORT_FRAGMENT as Fragment,
	getColorValue,
	svgExportElement as createElement,
	type Editor,
	type SvgExportContext,
	type SvgExportNode,
	type SvgExportStyle,
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
import type { VueResumeSectionShape, VueResumeShape } from './extensions/resume/vueResumeShape'

const XHTML_NAMESPACE = 'http://www.w3.org/1999/xhtml'
const VUE_VISIBLE_BORDER_COLOR = '#111827'
const VUE_MATERIAL_TABLE_BORDER_COLOR = '#111827'
const VUE_MATERIAL_TABLE_GRID_COLOR = '#d1d5db'
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
	}
}

export interface VueMaterialPrintTableColumn {
	field?: string
	label: string
	width: number
	type?: string
	formatter?: unknown
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
	columns: VueMaterialPrintTableColumn[]
	rows: VueMaterialPrintTableRow[]
	headerHeight: number
	fontSize: number
	lineHeight: number
	paddingX: number
	paddingY: number
	renderedHeight: number
	emptyText: string
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
	const path = getVueBoxPath(shape.props.geo, shape.props.w, shape.props.h)
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
	const fontSize = getVueFontSize(editor, shape.props.size)
	const textStyle: SvgExportStyle = {
		boxSizing: 'border-box',
		display: 'block',
		width: `${shape.props.w}px`,
		height: `${shape.props.h}px`,
		padding: '0',
		color: getVueThemeColor(editor, shape.props.color, 'solid'),
		fontFamily: getVueFontFamily(editor, shape.props.font),
		fontSize: `${fontSize}px`,
		lineHeight: String(editor.getCurrentTheme().lineHeight),
		whiteSpace: 'pre-wrap',
		wordBreak: 'break-word',
		overflowWrap: 'anywhere',
		overflow: 'hidden',
	}

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
			'foreignObject',
			{
				width: shape.props.w,
				height: shape.props.h,
			},
			createElement('div', { xmlns: XHTML_NAMESPACE, style: textStyle }, shape.props.text)
		)
	)
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
			fill: '#ffffff',
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

export function createVueTableSvg(shape: VueTableShape): SvgExportNode {
	const width = Math.max(1, shape.props.w)
	const height = Math.max(1, shape.props.h)
	const rowHeight = Math.min(72, Math.max(22, shape.props.rowHeight))
	const columns = shape.props.columns.length
		? shape.props.columns
		: [{ field: 'value', title: 'Value', width }]
	const columnWidths = getVueTableColumnWidths(columns, width)
	const clipId = `vue-table-clip-${sanitizeSvgId(shape.id)}`
	const children: SvgExportChild[] = [
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
		),
		createElement('rect', {
			width,
			height,
			fill: '#ffffff',
			stroke: shape.props.showBorder ? '#111827' : 'none',
			strokeWidth: shape.props.showBorder ? 1 : 0,
		}),
	]

	const gridChildren: SvgExportChild[] = []
	for (let y = rowHeight; y < height; y += rowHeight) {
		gridChildren.push(createVueTableGridLine(0, y, width, y))
	}

	let x = 0
	for (const columnWidth of columnWidths.slice(0, -1)) {
		x += columnWidth
		gridChildren.push(createVueTableGridLine(x, 0, x, height))
	}

	const visibleRowCount = Math.min(shape.props.rows.length, Math.ceil(height / rowHeight))
	for (let rowIndex = 0; rowIndex < visibleRowCount; rowIndex++) {
		const row = shape.props.rows[rowIndex]
		let cellX = 0
		for (const [columnIndex, column] of columns.entries()) {
			const cellWidth = columnWidths[columnIndex] ?? 0
			const text = fitVueTableCellText(row?.[column.field] ?? '', cellWidth)
			if (text) {
				gridChildren.push(
					createElement(
						'text',
						{
							x: cellX + 8,
							y: rowIndex * rowHeight + rowHeight / 2,
							fill: '#111827',
							fontFamily: 'Inter, Arial, sans-serif',
							fontSize: 12,
							dominantBaseline: 'middle',
							pointerEvents: 'none',
						},
						text
					)
				)
			}
			cellX += cellWidth
		}
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
	const zone = shape.props.zone
	const isTableBody = zone === 'tableBody'
	const children: SvgExportChild[] = [
		createElement('rect', {
			width,
			height,
			fill: '#ffffff',
			stroke: VUE_MATERIAL_TABLE_BORDER_COLOR,
			strokeWidth: 1,
		}),
	]

	if (isTableBody) {
		const override = vueMaterialPrintTableOverrides.get(shape.id)
		children.push(
			override
				? createVueMaterialPrintTableSvg(shape.id, width, height, override)
				: createVueMaterialPlaceholderTableSvg(shape.id, width, height)
		)
	} else {
		children.push(
			createCenteredSvgText(shape.props.label, width, height, {
				fill: '#9aa1ac',
				fontSize: 15,
				fontWeight: 500,
			})
		)
	}

	return createElement('g', null, children)
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
				fitVueTableCellText(columnLabels[index] ?? '', columnWidth)
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
	const headerHeight = Math.min(renderedHeight, Math.max(0, override.headerHeight))
	const columnWidths = getVueMaterialPrintColumnWidths(override.columns, width)
	const defs = createElement(
		'defs',
		null,
		createElement(
			'clipPath',
			{ id: clipId },
			createElement('rect', {
				width,
				height: renderedHeight,
			})
		)
	)
	const children: SvgExportChild[] = [
		createElement('rect', {
			width,
			height: renderedHeight,
			fill: '#ffffff',
		}),
		createVueTableGridLine(0, headerHeight, width, headerHeight),
	]

	let x = 0
	for (const [columnIndex, column] of override.columns.entries()) {
		const columnWidth = columnWidths[columnIndex] ?? 0
		if (columnIndex > 0) {
			children.push(createVueTableGridLine(x, 0, x, renderedHeight))
		}
		children.push(
			createElement(
				'text',
				{
					x: x + override.paddingX,
					y: headerHeight / 2,
					fill: '#111827',
					fontFamily: 'Inter, Arial, sans-serif',
					fontSize: override.fontSize,
					fontWeight: 700,
					dominantBaseline: 'middle',
					pointerEvents: 'none',
				},
				fitVueTableCellText(column.label, columnWidth)
			)
		)
		x += columnWidth
	}

	let rowY = headerHeight
	for (const row of override.rows) {
		const rowHeight = Math.max(1, row.height)
		children.push(createVueTableGridLine(0, rowY + rowHeight, width, rowY + rowHeight))

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
					fitVueTableCellText(line, columnWidth)
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

	if (override.rows.length === 0) {
		children.push(
			createElement(
				'text',
				{
					x: width / 2,
					y: headerHeight + Math.max(0, renderedHeight - headerHeight) / 2,
					fill: '#9aa4b2',
					fontFamily: 'Inter, Arial, sans-serif',
					fontSize: override.fontSize,
					fontWeight: 600,
					textAnchor: 'middle',
					dominantBaseline: 'middle',
					pointerEvents: 'none',
				},
				override.emptyText
			)
		)
	}

	return createElement(
		'g',
		null,
		defs,
		createElement(
			'g',
			{
				clipPath: `url(#${clipId})`,
			},
			children
		)
	)
}

function getVueMaterialPrintColumnWidths(
	columns: readonly VueMaterialPrintTableColumn[],
	width: number
) {
	if (!columns.length) return [width]

	const total = columns.reduce((sum, column) => sum + Math.max(24, column.width), 0)
	if (total <= 0) return columns.map(() => width / columns.length)

	const widths = columns.map((column) => (Math.max(24, column.width) / total) * width)
	const diff = width - widths.reduce((sum, columnWidth) => sum + columnWidth, 0)
	widths[widths.length - 1] += diff
	return widths
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

function getVueFontSize(editor: Editor, size: TLDefaultSizeStyle) {
	return Math.round(editor.getCurrentTheme().fontSize * VUE_FONT_SIZE_SCALE[size])
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

function getVueTableColumnWidths(columns: readonly VueTableColumn[], width: number) {
	const rawTotal = columns.reduce((total, column) => total + Math.max(24, column.width), 0)
	if (rawTotal <= 0) return columns.map(() => width / Math.max(1, columns.length))

	const widths = columns.map((column) => (Math.max(24, column.width) / rawTotal) * width)
	const diff = width - widths.reduce((total, columnWidth) => total + columnWidth, 0)
	if (widths.length) widths[widths.length - 1] += diff
	return widths
}

function createVueTableGridLine(x1: number, y1: number, x2: number, y2: number) {
	return createElement('line', {
		x1,
		y1,
		x2,
		y2,
		stroke: VUE_MATERIAL_TABLE_GRID_COLOR,
		strokeWidth: 1,
		vectorEffect: 'non-scaling-stroke',
	})
}

function fitVueTableCellText(value: string, width: number) {
	const maxChars = Math.max(0, Math.floor((width - 12) / 7))
	if (maxChars <= 0) return ''
	if (value.length <= maxChars) return value
	if (maxChars <= 3) return value.slice(0, maxChars)
	return `${value.slice(0, maxChars - 3)}...`
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
