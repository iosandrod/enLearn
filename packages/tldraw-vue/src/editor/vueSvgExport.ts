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

const XHTML_NAMESPACE = 'http://www.w3.org/1999/xhtml'
const VUE_VISIBLE_BORDER_COLOR = '#111827'
const VUE_MATERIAL_TABLE_BORDER_COLOR = '#111827'
const VUE_MATERIAL_TABLE_GRID_COLOR = '#d1d5db'

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

export function setVueMaterialPrintTableOverrides(
	overrides: Map<TLShapeId, VueMaterialPrintTableOverride>
) {
	vueMaterialPrintTableOverrides = new Map(overrides)
}

export function clearVueMaterialPrintTableOverrides() {
	vueMaterialPrintTableOverrides.clear()
}

export function createVueBoxSvg(editor: Editor, shape: VueBoxShape): SvgExportNode {
	const strokeWidth = getVueStrokeWidth(shape.props.size)
	const strokeColor = getVueThemeColor(editor, shape.props.color, 'solid')
	const fill = getVueFill(editor, shape.id, shape.props.color, shape.props.fill)
	const path = getBoxPath(shape.props.geo, shape.props.w, shape.props.h)
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
		createCenteredSvgText('Vue shape', shape.props.w, shape.props.h, {
			fill: shape.props.fill === 'solid' ? '#ffffff' : strokeColor,
			fontSize: 13,
			fontWeight: 700,
		}),
		createBoxMarkSvg(shape.props.geo, shape.props.w, shape.props.h)
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

function getBoxPath(geo: VueBoxShape['props']['geo'], width: number, height: number) {
	switch (geo) {
		case 'ellipse':
		case 'oval':
			return ellipsePath(width, height)
		case 'triangle':
			return `M${width / 2},0 L${width},${height} L0,${height} Z`
		case 'diamond':
		case 'rhombus':
			return `M${width / 2},0 L${width},${height / 2} L${width / 2},${height} L0,${height / 2} Z`
		case 'hexagon':
			return `M${width * 0.25},0 L${width * 0.75},0 L${width},${height / 2} L${width * 0.75},${height} L${width * 0.25},${height} L0,${height / 2} Z`
		case 'star':
			return pointsToPath([
				[0.5, 0],
				[0.61, 0.34],
				[0.98, 0.35],
				[0.68, 0.57],
				[0.79, 0.91],
				[0.5, 0.7],
				[0.21, 0.91],
				[0.32, 0.57],
				[0.02, 0.35],
				[0.39, 0.34],
			], width, height)
		case 'heart':
			return pointsToPath([
				[0.5, 0.92],
				[0.11, 0.57],
				[0.03, 0.33],
				[0.17, 0.09],
				[0.39, 0.09],
				[0.5, 0.24],
				[0.61, 0.09],
				[0.83, 0.09],
				[0.97, 0.33],
				[0.89, 0.57],
			], width, height)
		case 'arrow-left':
			return pointsToPath([
				[0.05, 0.5],
				[0.42, 0.1],
				[0.42, 0.32],
				[0.95, 0.32],
				[0.95, 0.68],
				[0.42, 0.68],
				[0.42, 0.9],
			], width, height)
		case 'arrow-up':
			return pointsToPath([
				[0.5, 0.05],
				[0.9, 0.42],
				[0.68, 0.42],
				[0.68, 0.95],
				[0.32, 0.95],
				[0.32, 0.42],
				[0.1, 0.42],
			], width, height)
		case 'arrow-down':
			return pointsToPath([
				[0.5, 0.95],
				[0.9, 0.58],
				[0.68, 0.58],
				[0.68, 0.05],
				[0.32, 0.05],
				[0.32, 0.58],
				[0.1, 0.58],
			], width, height)
		case 'arrow-right':
			return pointsToPath([
				[0.95, 0.5],
				[0.58, 0.1],
				[0.58, 0.32],
				[0.05, 0.32],
				[0.05, 0.68],
				[0.58, 0.68],
				[0.58, 0.9],
			], width, height)
		case 'cloud':
			return roundedRectPath(width, height, Math.min(width, height) * 0.28)
		case 'x-box':
		case 'check-box':
		case 'rectangle':
		default:
			return roundedRectPath(width, height, 8)
	}
}

function createBoxMarkSvg(geo: VueBoxShape['props']['geo'], width: number, height: number) {
	if (geo === 'x-box') {
		return createElement(
			Fragment,
			null,
			createElement('line', markLineProps(width * 0.35, height * 0.22, width * 0.65, height * 0.78)),
			createElement('line', markLineProps(width * 0.65, height * 0.22, width * 0.35, height * 0.78))
		)
	}

	if (geo === 'check-box') {
		return createElement('polyline', {
			points: `${width * 0.27},${height * 0.48} ${width * 0.42},${height * 0.64} ${width * 0.73},${height * 0.3}`,
			fill: 'none',
			stroke: 'rgba(255,255,255,0.95)',
			strokeWidth: 3,
			strokeLinecap: 'round',
			strokeLinejoin: 'round',
		})
	}

	return null
}

function markLineProps(x1: number, y1: number, x2: number, y2: number) {
	return {
		x1,
		y1,
		x2,
		y2,
		stroke: 'rgba(255,255,255,0.95)',
		strokeWidth: 3,
		strokeLinecap: 'round',
	}
}

function pointsToPath(points: [number, number][], width: number, height: number) {
	return `${points
		.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x * width},${y * height}`)
		.join(' ')} Z`
}

function ellipsePath(width: number, height: number) {
	return `M${width / 2},0 A${width / 2},${height / 2} 0 1,1 ${width / 2},${height} A${width / 2},${height / 2} 0 1,1 ${width / 2},0 Z`
}

function roundedRectPath(width: number, height: number, radius: number) {
	const r = Math.min(radius, width / 2, height / 2)
	return `M${r},0 H${width - r} Q${width},0 ${width},${r} V${height - r} Q${width},${height} ${width - r},${height} H${r} Q0,${height} 0,${height - r} V${r} Q0,0 ${r},0 Z`
}

function sanitizeSvgId(id: string) {
	return id.replace(/[^a-zA-Z0-9_-]/g, '-')
}
