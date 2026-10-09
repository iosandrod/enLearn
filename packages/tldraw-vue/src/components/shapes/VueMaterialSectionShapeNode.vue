<script setup lang="ts">
import type { TLShapePartial } from '@tldraw/editor'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
	getPrintDataSourceDetailColumns,
	getPrintDataSourceDetailRows,
} from '@/editor/dataSourceForm'
import {
	getVueMaterialSectionDefinition,
	getVueMaterialSections,
	isVueMaterialShape,
	normalizeVueMaterialSections,
	type VueMaterialSectionShape,
} from '@/editor/extensions/material/vueMaterialShape'
import { vueMaterialRowDefaults } from '@/editor/defaults'
import { getEditorPrintDataSource } from '@/editor/workspaceDataSource'
import {
	areMaterialColumnsSiblings,
	getMaterialColumns,
	moveMaterialColumn,
	updateMaterialColumns,
} from '@/editor/materialColumnOperations'
import { useEditorValue } from '@/vue/useEditorValue'
import type { VueShapeNodeProps } from './types'
import {
	createPrintCodeDataUrl,
	getPrintCodeCellType,
	getPrintCodeCellValue,
	type PrintCodeCellType,
} from '@/print/codeCell'

const props = defineProps<VueShapeNodeProps<VueMaterialSectionShape>>()

const isTableBody = computed(() => props.shape.props.zone === 'tableBody')
const selectedColumnField = ref('')
const draggingColumnField = ref('')
const dropTargetField = ref('')
const dropPosition = ref<'before' | 'after'>('before')
const printDataSource = getEditorPrintDataSource(props.editor)
const materialShape = useEditorValue(
	`material parent shape:${props.shape.id}`,
	() => props.editor.getShape(props.shape.parentId)
)
const dataSourceField = computed(() =>
	isVueMaterialShape(materialShape.value) ? materialShape.value.props.dataSourceField : ''
)
const availableDataSourceFields = computed(() => {
	const source = printDataSource.value
	if (!source || source.type !== 'inline') return []
	const tableFields = Array.isArray(source.detailTables)
		? source.detailTables
			.map((table) => (typeof table?.field === 'string' ? table.field : ''))
			.filter(Boolean)
		: []
	if (tableFields.length) return tableFields
	return typeof source.detailField === 'string' && source.detailField ? [source.detailField] : []
})
const hasConfiguredDataSource = computed(() =>
	printDataSource.value?.type === 'inline' &&
	Boolean(printDataSource.value.formCode) &&
	Boolean(dataSourceField.value) &&
	availableDataSourceFields.value.includes(dataSourceField.value)
)
const previewColumns = computed(() =>
	hasConfiguredDataSource.value
		? getPrintDataSourceDetailColumns(printDataSource.value, dataSourceField.value)
		: []
)
const previewLeafColumns = computed(() => flattenDetailColumns(previewColumns.value))
const previewHeaderCells = computed(() => createPreviewHeaderCells(previewColumns.value))
const previewHeaderDepth = computed(() => getColumnDepth(previewColumns.value))
const previewHeaderRowHeight = computed(() => getPositiveRowHeight(
	isVueMaterialShape(materialShape.value) ? materialShape.value.props.headerRowHeight : undefined,
	vueMaterialRowDefaults.headerRowHeight,
))
const previewBodyRowHeight = computed(() => getPositiveRowHeight(
	isVueMaterialShape(materialShape.value) ? materialShape.value.props.bodyRowHeight : undefined,
	vueMaterialRowDefaults.bodyRowHeight,
))
const previewHeaderHeight = computed(() => Math.max(1, previewHeaderDepth.value) * previewHeaderRowHeight.value)
const previewTableWidth = computed(() => Math.max(1, props.shape.props.w - 2 / (props.zoom || 1)))
const previewLeafWidths = computed(() => normalizeColumnWidths(
	previewLeafColumns.value,
	previewTableWidth.value,
))
const previewLeafLayouts = computed(() => previewLeafColumns.value.map((column, index) => ({
	...column,
	width: previewLeafWidths.value[index],
})))
const previewHeaderRows = computed(() => createPreviewHeaderRows(
	previewHeaderCells.value,
	previewLeafLayouts.value,
	previewHeaderDepth.value,
	previewHeaderRowHeight.value,
))
const previewRows = computed(() =>
	hasConfiguredDataSource.value
		? getPrintDataSourceDetailRows(printDataSource.value, dataSourceField.value)
		: []
)//计算类型
const visiblePreviewRows = computed(() => {
	const availableHeight = Math.max(0, props.shape.props.h - previewHeaderHeight.value)
	const maxRows = Math.max(1, Math.floor(availableHeight / previewBodyRowHeight.value))
	return previewRows.value.slice(0, maxRows)
})
const canResizeBottom = computed(() => {
	const parent = props.editor.getShape(props.shape.parentId)
	if (!isVueMaterialShape(parent)) return false
	const sections = getVueMaterialSections(props.editor, parent.id)
	return sections.findIndex((section) => section.id === props.shape.id) < sections.length - 1
})

let resizeState:
	| {
		current: VueMaterialSectionShape
		next: VueMaterialSectionShape
		originClientY: number
		pointerId: number
	}
	| null = null
let columnResizeState: {
	index: number
	widths: number[]
	originClientX: number
	pointerId: number
} | null = null
let columnDragState: {
	field: string
	originClientX: number
	originClientY: number
	pointerId: number
	didMove: boolean
} | null = null

function handleMaterialColumnSelection(event: Event) {
	const detail = (event as CustomEvent<{ materialShapeId?: unknown; field?: unknown }>).detail
	if (detail?.materialShapeId !== materialShape.value?.id) return
	selectedColumnField.value = typeof detail.field === 'string' ? detail.field : ''
}

onMounted(() => {
	window.addEventListener('enlearn:material-column-select', handleMaterialColumnSelection)
	if (!isTableBody.value || !isContainerList.value) return
	const material = materialShape.value
	if (isVueMaterialShape(material)) normalizeVueMaterialSections(props.editor, material.id)
})
onBeforeUnmount(() => window.removeEventListener('enlearn:material-column-select', handleMaterialColumnSelection))

const MIN_COLUMN_WIDTH = 36

function normalizeColumnWidths(
	columns: readonly { width?: number }[],
	totalWidth: number,
) {
	if (!columns.length) return []
	const minimum = Math.min(MIN_COLUMN_WIDTH, totalWidth / columns.length)
	const rawWidths = columns.map((column) => Math.max(minimum, Number(column.width) || 100))
	const rawTotal = rawWidths.reduce((sum, width) => sum + width, 0)
	if (rawTotal <= totalWidth) {
		const scale = totalWidth / rawTotal
		return fillLastWidth(rawWidths.map((width) => width * scale), totalWidth)
	}
	const available = Math.max(totalWidth - minimum * columns.length, 0)
	const flexibleTotal = rawWidths.reduce((sum, width) => sum + Math.max(0, width - minimum), 0)
	return fillLastWidth(rawWidths.map((width) =>
		minimum + (flexibleTotal ? Math.max(0, width - minimum) / flexibleTotal * available : 0)
	), totalWidth)
}

function fillLastWidth(widths: number[], totalWidth: number) {
	if (widths.length < 2) return widths.length ? [totalWidth] : []
	widths[widths.length - 1] = totalWidth - widths.slice(0, -1).reduce((sum, width) => sum + width, 0)
	return widths
}

function onColumnResizePointerDown(event: PointerEvent, index: number) {
	if (event.button !== 0 || index >= previewLeafWidths.value.length - 1) return
	event.preventDefault()
	event.stopPropagation()
	columnResizeState = {
		index,
		widths: [...previewLeafWidths.value],
		originClientX: event.clientX,
		pointerId: event.pointerId,
	}
	props.editor.markHistoryStoppingPoint('resize material column')
	if (event.currentTarget instanceof Element) {
		try {
			event.currentTarget.setPointerCapture(event.pointerId)
		} catch {
			// Window listeners below keep the drag alive if capture is unavailable.
		}
	}
	document.body.style.cursor = 'col-resize'
	document.body.style.userSelect = 'none'
	window.addEventListener('pointermove', onColumnResizePointerMove, true)
	window.addEventListener('pointerup', onColumnResizePointerUp, true)
	window.addEventListener('pointercancel', onColumnResizePointerUp, true)
}

function onColumnDragPointerDown(event: PointerEvent, field: string | undefined) {
	if (event.button !== 0 || !field || props.editor.getIsReadonly()) return
	event.preventDefault()
	event.stopPropagation()
	selectMaterialColumn(event, field)
	columnDragState = {
		field,
		originClientX: event.clientX,
		originClientY: event.clientY,
		pointerId: event.pointerId,
		didMove: false,
	}
	draggingColumnField.value = field
	if (event.currentTarget instanceof Element) {
		try {
			event.currentTarget.setPointerCapture(event.pointerId)
		} catch {
			// Window listeners below keep the drag alive if capture is unavailable.
		}
	}
	document.body.style.userSelect = 'none'
	window.addEventListener('pointermove', onColumnDragPointerMove, true)
	window.addEventListener('pointerup', onColumnDragPointerUp, true)
	window.addEventListener('pointercancel', onColumnDragPointerCancel, true)
}

function onColumnDragPointerMove(event: PointerEvent) {
	const state = columnDragState
	if (!state || event.pointerId !== state.pointerId) return
	event.preventDefault()
	event.stopPropagation()
	if (!state.didMove && Math.hypot(
		event.clientX - state.originClientX,
		event.clientY - state.originClientY,
	) < 4) return
	state.didMove = true
	document.body.style.cursor = 'grabbing'
	const target = document.elementFromPoint(event.clientX, event.clientY)
		?.closest<HTMLElement>('[data-material-column-field]')
	const targetField = target?.dataset.materialColumnField ?? ''
	const targetShapeId = target?.dataset.materialShapeId ?? ''
	const parent = materialShape.value
	if (
		!target ||
		!targetField ||
		targetField === state.field ||
		targetShapeId !== parent?.id ||
		!areMaterialColumnsSiblings(previewColumns.value, state.field, targetField)
	) {
		dropTargetField.value = ''
		return
	}
	const bounds = target.getBoundingClientRect()
	dropTargetField.value = targetField
	dropPosition.value = event.clientX < bounds.left + bounds.width / 2 ? 'before' : 'after'
}

function onColumnDragPointerUp(event: PointerEvent) {
	const state = columnDragState
	if (!state || event.pointerId !== state.pointerId) return
	event.preventDefault()
	event.stopPropagation()
	if (state.didMove && dropTargetField.value) {
		const source = printDataSource.value
		const field = dataSourceField.value
		if (source?.type === 'inline' && field) {
			const moved = moveMaterialColumn(
				getMaterialColumns(source, field),
				state.field,
				dropTargetField.value,
				dropPosition.value,
			)
			if (moved) {
				props.editor.markHistoryStoppingPoint('reorder material column')
				printDataSource.value = updateMaterialColumns(source, field, () => moved)
			}
		}
	}
	clearColumnDrag()
}

function onColumnDragPointerCancel(event: PointerEvent) {
	if (!columnDragState || event.pointerId !== columnDragState.pointerId) return
	clearColumnDrag()
}

function clearColumnDrag() {
	columnDragState = null
	draggingColumnField.value = ''
	dropTargetField.value = ''
	document.body.style.cursor = ''
	document.body.style.userSelect = ''
	window.removeEventListener('pointermove', onColumnDragPointerMove, true)
	window.removeEventListener('pointerup', onColumnDragPointerUp, true)
	window.removeEventListener('pointercancel', onColumnDragPointerCancel, true)
}

function onColumnResizePointerMove(event: PointerEvent) {
	const state = columnResizeState
	if (!state || event.pointerId !== state.pointerId) return
	event.preventDefault()
	event.stopPropagation()
	const zoom = props.editor.getCamera().z || 1
	const rawDelta = (event.clientX - state.originClientX) / zoom
	const minimum = Math.min(MIN_COLUMN_WIDTH, previewTableWidth.value / state.widths.length)
	const leftWidth = state.widths[state.index]
	const rightWidth = state.widths[state.index + 1]
	const delta = Math.min(
		Math.max(rawDelta, minimum - leftWidth),
		rightWidth - minimum,
	)
	if (!delta) return
	const nextWidths = [...state.widths]
	nextWidths[state.index] += delta
	nextWidths[state.index + 1] -= delta
	updateDataSourceColumnWidths(nextWidths)
}

function onColumnResizePointerUp(event: PointerEvent) {
	if (!columnResizeState || event.pointerId !== columnResizeState.pointerId) return
	columnResizeState = null
	document.body.style.cursor = ''
	document.body.style.userSelect = ''
	window.removeEventListener('pointermove', onColumnResizePointerMove, true)
	window.removeEventListener('pointerup', onColumnResizePointerUp, true)
	window.removeEventListener('pointercancel', onColumnResizePointerUp, true)
}

function updateDataSourceColumnWidths(widths: readonly number[]) {
	const source = printDataSource.value
	const field = dataSourceField.value
	if (!source || source.type !== 'inline' || !field) return
	let widthIndex = 0
	const updateColumns = (columns: readonly any[]): any[] => columns.map((column) => {
		if (Array.isArray(column.children) && column.children.length) {
			return { ...column, children: updateColumns(column.children) }
		}
		const width = widths[widthIndex++]
		return width === undefined ? { ...column } : { ...column, width }
	})
	const detailTables = Array.isArray(source.detailTables) ? source.detailTables : []
	const nextTables = detailTables.map((table) =>
		table.field === field ? { ...table, columns: updateColumns(table.columns) } : table,
	)
	const nextColumns = detailTables.length
		? source.detailColumns
		: updateColumns(Array.isArray(source.detailColumns) ? source.detailColumns : [])
	printDataSource.value = {
		...source,
		...(nextTables ? { detailTables: nextTables } : {}),
		...(nextColumns ? { detailColumns: nextColumns } : {}),
	}
}

function onResizePointerDown(event: PointerEvent) {
	if (event.button !== 0) return

	const parent = props.editor.getShape(props.shape.parentId)
	if (!isVueMaterialShape(parent)) return

	const sections = getVueMaterialSections(props.editor, parent.id)
	const index = sections.findIndex((section) => section.id === props.shape.id)
	const current = sections[index]
	const next = sections[index + 1]
	if (!current || !next) return

	event.stopPropagation()
	event.preventDefault()

	resizeState = {
		current,
		next,
		originClientY: event.clientY,
		pointerId: event.pointerId,
	}

	props.editor.markHistoryStoppingPoint('resize material section')
	props.editor.select(parent.id)

	const target = event.currentTarget
	if (target instanceof Element) {
		try {
			target.setPointerCapture(event.pointerId)
		} catch {
			// Window listeners below keep the drag alive if capture is unavailable.
		}
	}

	window.addEventListener('pointermove', onWindowPointerMove, true)
	window.addEventListener('pointerup', onWindowPointerUp, true)
	window.addEventListener('pointercancel', onWindowPointerUp, true)
}

function onWindowPointerMove(event: PointerEvent) {
	const state = resizeState
	if (!state || event.pointerId !== state.pointerId) return

	event.stopPropagation()
	event.preventDefault()

	const current = props.editor.getShape<VueMaterialSectionShape>(state.current.id)
	const next = props.editor.getShape<VueMaterialSectionShape>(state.next.id)
	if (!current || !next) return

	const zoom = props.editor.getCamera().z || 1
	const rawDelta = (event.clientY - state.originClientY) / zoom
	const currentMin = getVueMaterialSectionDefinition(state.current.props.zone).minHeight
	const nextMin = getVueMaterialSectionDefinition(state.next.props.zone).minHeight
	const minDelta = currentMin - state.current.props.h
	const maxDelta = state.next.props.h - nextMin
	const delta = Math.min(Math.max(rawDelta, minDelta), maxDelta)

	const changes: TLShapePartial<VueMaterialSectionShape>[] = [
		{
			id: current.id,
			type: 'vue-material-section',
			props: {
				h: state.current.props.h + delta,
			},
		},
		{
			id: next.id,
			type: 'vue-material-section',
			y: state.next.y + delta,
			props: {
				h: state.next.props.h - delta,
			},
		},
	]

	props.editor.updateShapes(changes)
}

function onWindowPointerUp(event: PointerEvent) {
	const state = resizeState
	if (!state || event.pointerId !== state.pointerId) return

	resizeState = null
	window.removeEventListener('pointermove', onWindowPointerMove, true)
	window.removeEventListener('pointerup', onWindowPointerUp, true)
	window.removeEventListener('pointercancel', onWindowPointerUp, true)
}

onBeforeUnmount(() => {
	resizeState = null
	window.removeEventListener('pointermove', onWindowPointerMove, true)
	window.removeEventListener('pointerup', onWindowPointerUp, true)
	window.removeEventListener('pointercancel', onWindowPointerUp, true)
	if (columnResizeState) onColumnResizePointerUp({ pointerId: columnResizeState.pointerId } as PointerEvent)
	clearColumnDrag()
})

function formatPreviewValue(row: Record<string, unknown>, field: string) {
	const value = getPrintCodeCellValue(row, field)
	if (value === undefined || value === null || value === '') return '—'
	if (typeof value === 'object') {
		try {
			return JSON.stringify(value)
		} catch {
			return String(value)
		}
	}
	return String(value)
}

function previewCodeType(column: Record<string, unknown>): PrintCodeCellType | undefined {
	return getPrintCodeCellType(column)
}

function previewCodeUrl(row: Record<string, unknown>, column: Record<string, unknown>) {
	const type = previewCodeType(column)
	return type ? createPrintCodeDataUrl(type, getPrintCodeCellValue(row, String(column.field ?? ''))) : ''
}

function getPositiveRowHeight(value: unknown, fallback: number) {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function selectMaterialColumn(event: MouseEvent | PointerEvent, field: string | undefined) {
	event.stopPropagation()
	if (!field) return
	const parent = materialShape.value
	if (!isVueMaterialShape(parent)) return
	props.editor.select(parent.id)
	window.dispatchEvent(new CustomEvent('enlearn:material-column-select', {
		detail: { materialShapeId: parent.id, field },
	}))
}

function flattenDetailColumns(columns: readonly { field: string; children?: readonly any[] }[]) {
	const result: { field: string; title: string; width?: number }[] = []
	columns.forEach((column) => {
		if (column.children?.length) result.push(...flattenDetailColumns(column.children))
		else if (column.field) result.push(column as { field: string; title: string; width?: number })
	})
	return result
}

function getColumnDepth(columns: readonly { children?: readonly any[] }[]): number {
	if (!columns.length) return 1
	return Math.max(1, ...columns.map((column) =>
		column.children?.length ? 1 + getColumnDepth(column.children) : 1
	))
}

function createPreviewHeaderCells(
	columns: readonly { field: string; title: string; children?: readonly any[] }[],
) {
	const maxDepth = getColumnDepth(columns)
	const cells: Array<{
		key: string
		title: string
		field?: string
		start: number
		span: number
		row: number
		rowSpan: number
	}> = []
	let start = 1

	function visit(items: readonly { field: string; title: string; children?: readonly any[] }[], depth: number, path: string) {
		items.forEach((column, index) => {
			const children = column.children ?? []
			const leafCount = children.length ? countLeafColumns(children) : 1
			cells.push({
				key: `${path}-${index}`,
				title: column.title || column.field,
				field: column.field,
				start,
				span: leafCount,
				row: depth,
				rowSpan: children.length ? 1 : maxDepth - depth + 1,
			})
			if (children.length) visit(children, depth + 1, `${path}-${index}`)
			else start += 1
		})
	}

	visit(columns, 1, 'column')
	return cells
}

function countLeafColumns(columns: readonly { children?: readonly any[] }[]): number {
	return columns.reduce((count, column) => count + (column.children?.length ? countLeafColumns(column.children) : 1), 0)
}

function createPreviewHeaderRows(
	cells: readonly { key: string; title: string; field?: string; start: number; span: number; row: number; rowSpan: number }[],
	leafColumns: readonly { field: string; width: number }[],
	depth: number,
	rowHeight: number,
) {
	const usedResizeBoundaries = new Set<number>()
	return Array.from({ length: depth }, (_, rowIndex) => {
		const row = rowIndex + 1
		const result: Array<{
			key: string
			title: string
			field?: string
			width: number
			height: number
			leafIndex?: number
			spacer?: boolean
			continuation?: boolean
			spansRows?: boolean
			resizeIndex?: number
			resizeSide?: 'left' | 'right'
		}> = []
		let cursor = 1
		while (cursor <= leafColumns.length) {
			const cell = cells.find((item) =>
				item.start === cursor && item.row <= row && item.row + item.rowSpan > row
			)
			if (cell) {
				const continuation = cell.row < row
				const isLeaf = cell.span === 1
				const hasResizeBoundary = cell.start + cell.span < leafColumns.length + 1
				let resizeIndex: number | undefined
				let resizeSide: 'left' | 'right' | undefined
				if (!continuation && hasResizeBoundary) {
					const boundaryIndex = isLeaf && cursor > 1 ? cursor - 2 : cursor + cell.span - 2
					if (!usedResizeBoundaries.has(boundaryIndex)) {
						resizeIndex = boundaryIndex
						resizeSide = isLeaf && cursor > 1 ? 'left' : 'right'
						usedResizeBoundaries.add(boundaryIndex)
					}
				}
				result.push({
					key: `${cell.key}-${row}`,
					title: cell.row === row ? cell.title : '',
					field: cell.row === row ? cell.field : undefined,
					width: leafColumns.slice(cursor - 1, cursor - 1 + cell.span)
						.reduce((total, column) => total + column.width, 0),
					height: cell.row === row ? cell.rowSpan * rowHeight : rowHeight,
					leafIndex: cell.span === 1 && cell.row === row ? cursor - 1 : undefined,
					continuation,
					spansRows: cell.rowSpan > 1,
					resizeIndex,
					resizeSide,
				})
				cursor += cell.span
				continue
			}
			result.push({
				key: `spacer-${row}-${cursor}`,
				title: '',
				width: leafColumns[cursor - 1].width,
				height: rowHeight,
				spacer: true,
			})
			cursor += 1
		}
		return result
	})
}
const isContainerList = computed(() => {
	const material = materialShape.value
	return isVueMaterialShape(material) && material.props.containerList === true
})
const _showBorder = computed(() => {
	const material:any = materialShape.value//
	let showBorder = material.props.showBorder
	let borderLeft = material.props.borderLeft
	let borderRight = material.props.borderRight
	let borderTop = material.props.borderTop
	let borderBottom = material.props.borderBottom//
	if(Boolean(borderLeft) || Boolean(borderRight) || Boolean(borderTop) || Boolean(borderBottom)){
		showBorder = true
	}
	return showBorder
})
const borderObj=computed(()=>{
	const material:any = materialShape.value
	let borderLeft = material.props.borderLeft
	let borderRight = material.props.borderRight
	let borderTop = material.props.borderTop
	let borderBottom = material.props.borderBottom//
	let obj= {
	} as any
	if(Boolean(borderLeft)==false){
		obj.borderLeft = 'none'
	}
	if(Boolean(borderRight)==false){
		obj.borderRight = 'none'
	}
	if(Boolean(borderTop)==false){
		obj.borderTop = 'none'
	}
	if(Boolean(borderBottom)==false){
		obj.borderBottom = 'none'
	}
	if(!Boolean(borderLeft)&&!Boolean(borderRight)&&!Boolean(borderTop)&&!Boolean(borderBottom)){
		obj={}//
	}
	return obj
})
</script>

<template>
	<div class="vue-material-section-shape" :class="[
		_showBorder ? 'has-visible-border' : '',
		`vue-material-section-shape--${shape.props.zone}`,
		{ 'is-selected': selected, 'is-table-body': isTableBody, 'is-zero-height': shape.props.h <= 0 },
	]"
	 :data-shape-id="shape.id" :style="{
		width: `${shape.props.w}px`,
		height: `${shape.props.h}px`,
		transform: pageTransform,
		opacity: shape.opacity,
		'--inverse-zoom': String(1 / zoom),
		...borderObj
	}">

		<template v-if="isTableBody">
			<template v-if="isContainerList">
				<!-- The real vue-frame is a child of this section and is rendered by the canvas. -->
			</template>
			<template v-else>
				<div class="vue-material-table-columns" :style="{
					height: `${previewHeaderHeight}px`,
				}">
					<div v-for="(row, rowIndex) in previewHeaderRows" :key="`header-row-${rowIndex}`"
						class="vue-material-table-header-row"
						:style="{ flex: `0 0 ${previewHeaderRowHeight}px`, height: `${previewHeaderRowHeight}px` }">
						<div v-for="cell in row" :key="cell.key" class="vue-material-table-header-cell" :class="{
							'has-column-resize': cell.resizeIndex !== undefined,
							'is-header-continuation': cell.continuation,
							'is-header-rowspan': cell.spansRows,
							'is-column-selected': cell.field === selectedColumnField,
							'is-column-dragging': cell.field === draggingColumnField,
							'is-drop-before': cell.field === dropTargetField && dropPosition === 'before',
							'is-drop-after': cell.field === dropTargetField && dropPosition === 'after',
						}" :data-material-column-field="cell.field || undefined"
							:data-material-shape-id="cell.field ? materialShape?.id : undefined"
							:style="{ flex: `0 0 ${cell.width}px`, height: `${cell.height}px` }">
							<div v-if="cell.resizeIndex !== undefined && cell.resizeSide === 'left'"
								class="vue-material-table-column-resize"
								@pointerdown="onColumnResizePointerDown($event, cell.resizeIndex)" />
							<span @pointerdown="selectMaterialColumn($event, cell.field)"
								@click="selectMaterialColumn($event, cell.field)">{{ cell.title }}</span>
							<button v-if="cell.field" type="button" class="vue-material-table-column-drag"
								:aria-label="`拖动${cell.title || cell.field}列排序`"
								:title="`拖动${cell.title || cell.field}列排序`"
								@pointerdown="onColumnDragPointerDown($event, cell.field)">
								<i class="ri-drag-move-2-line" aria-hidden="true" />
							</button>
							<div v-if="cell.resizeIndex !== undefined && cell.resizeSide === 'right'"
								class="vue-material-table-column-resize is-right"
								@pointerdown="onColumnResizePointerDown($event, cell.resizeIndex)" />
						</div>
					</div>
				</div>
				<div v-if="visiblePreviewRows.length" class="vue-material-table-rows">
					<div v-for="(row, rowIndex) in visiblePreviewRows" :key="String(row._rowId ?? rowIndex)"
						class="vue-material-table-row" :style="{ minHeight: `${previewBodyRowHeight}px` }">
						<div v-for="column in previewLeafLayouts" :key="column.field"
							:style="{ width: `${column.width}px`, flex: `0 0 ${column.width}px` }">
							<img v-if="previewCodeType(column) && previewCodeUrl(row, column)"
								class="vue-material-table-code"
								:class="{ 'is-barcode': previewCodeType(column) === 'barCode' }"
								:src="previewCodeUrl(row, column)" :alt="formatPreviewValue(row, column.field)" />
							<span v-else>{{ formatPreviewValue(row, column.field) }}</span>
						</div>
					</div>
				</div>
				<div v-else class="vue-material-table-fill">
					<span>{{ hasConfiguredDataSource ? '' : '' }}</span>
				</div>
			</template>
		</template>
		<div v-else class="vue-material-section-label">{{ shape.props.label }}</div>
		<button v-if="canResizeBottom" type="button" class="vue-material-section-resize-handle"
			aria-label="Resize section height" title="Resize section height" @pointerdown="onResizePointerDown" />
	</div>
</template>
