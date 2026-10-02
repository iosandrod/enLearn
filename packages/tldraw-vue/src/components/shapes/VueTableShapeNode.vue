<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
	VUE_TABLE_ROW_ID_FIELD,
	type VueTableColumn,
	type VueTableRow,
	type VueTableShape,
} from '@/editor/extensions/table/vueTableShape'
import { getVueTableRowId, getVueTableRowLayouts } from '@/editor/extensions/table/tableRowHeight'
import type { VueShapeNodeProps } from './types'
import {
	expandSelectionToTableMerges,
	findTableMerge,
	insertTableMergeAxis,
	normalizeTableMergeCells,
	normalizeTableSelection,
	removeTableMergeAxis,
	tableMergesIntersecting,
	type TableSelection,
} from './tableStructure'
import { getZoomAdjustedResizeValue } from './tableResize'

const props = defineProps<VueShapeNodeProps<VueTableShape>>()
const tableRoot = ref<HTMLElement | null>(null)
const selectionStart = ref<{ row: number; col: number } | null>(null)
const selectionEnd = ref<{ row: number; col: number } | null>(null)
const contextMenu = ref<{ x: number; y: number } | null>(null)
const resizePreview = ref<{ axis: 'column' | 'row'; position: number; value: number } | null>(null)
let activeResizeCleanup: (() => void) | null = null
let activeSelectionCleanup: (() => void) | null = null
let rowSeed = 0
let columnSeed = 0

interface TableCellView {
	row: number
	col: number
	rowspan: number
	colspan: number
	value: string
}

const tableRows = computed(() => props.shape.props.rows.map((row, index) => normalizeTableRow(row, index)))
const rowHeight = computed(() => props.shape.props.rowHeight)
const tableWidth = computed(() => props.shape.props.columns.reduce(
	(total, column) => total + column.width,
	0
))
const tableRowLayouts = computed(() => getVueTableRowLayouts(
	props.shape.props.rows,
	rowHeight.value,
	props.shape.props.rowHeights
))
const tableMerges = computed(() => normalizeTableMergeCells(
	props.shape.props.mergeCells,
	tableRows.value.length,
	props.shape.props.columns.length
))
const activeSelection = computed<TableSelection | null>(() => {
	if (!selectionStart.value || !selectionEnd.value) return null
	return expandSelectionToTableMerges(normalizeTableSelection(
		selectionStart.value.row,
		selectionStart.value.col,
		selectionEnd.value.row,
		selectionEnd.value.col
	), tableMerges.value)
})
const tableCells = computed(() => tableRows.value.map((row, rowIndex) => {
	const cells: TableCellView[] = []
	props.shape.props.columns.forEach((column, colIndex) => {
		const merge = findTableMerge(tableMerges.value, rowIndex, colIndex)
		if (merge && (merge.row !== rowIndex || merge.col !== colIndex)) return
		cells.push({
			row: rowIndex,
			col: colIndex,
			rowspan: merge?.rowspan ?? 1,
			colspan: merge?.colspan ?? 1,
			value: row[column.field] ?? '',
		})
	})
	return cells
}))
const selectionStyle = computed(() => {
	const selection = activeSelection.value
	if (!selection) return undefined
	const left = props.shape.props.columns.slice(0, selection.colStart)
		.reduce((sum, column) => sum + column.width, 0)
	const width = props.shape.props.columns.slice(selection.colStart, selection.colEnd + 1)
		.reduce((sum, column) => sum + column.width, 0)
	const top = tableRowLayouts.value[selection.rowStart]?.y ?? 0
	const bottom = tableRowLayouts.value[selection.rowEnd]?.bottom ?? top
	return { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${bottom - top}px` }
})
const columnResizeHandles = computed(() => {
	let position = 0
	return props.shape.props.columns.map((column, index) => {
		position += column.width
		return { index, position }
	}).filter(handle => handle.position > 0 && handle.position <= props.shape.props.w)
})
const rowResizeHandles = computed(() => tableRowLayouts.value.map(layout => ({
	index: layout.index,
	position: layout.bottom,
	value: layout.height,
})).filter(handle => handle.position > 0 && handle.position <= props.shape.props.h))
const selectedRowCount = computed(() => activeSelection.value
	? activeSelection.value.rowEnd - activeSelection.value.rowStart + 1 : 0)
const selectedColumnCount = computed(() => activeSelection.value
	? activeSelection.value.colEnd - activeSelection.value.colStart + 1 : 0)
const canRemoveRows = computed(() => selectedRowCount.value > 0 && selectedRowCount.value < tableRows.value.length)
const canRemoveColumns = computed(() => selectedColumnCount.value > 0 && selectedColumnCount.value < props.shape.props.columns.length)
const canMerge = computed(() => Boolean(activeSelection.value) &&
	(selectedRowCount.value > 1 || selectedColumnCount.value > 1))
const canSplit = computed(() => Boolean(activeSelection.value &&
	tableMergesIntersecting(tableMerges.value, activeSelection.value).length))

watch(() => props.selected, selected => {
	if (!selected) {
		selectionStart.value = null
		selectionEnd.value = null
		closeContextMenu()
	}
})

onMounted(() => {
	document.addEventListener('pointerdown', onDocumentPointerDown, true)
	document.addEventListener('keydown', onDocumentKeyDown, true)
	window.addEventListener('blur', closeContextMenu)
})
onBeforeUnmount(() => {
	document.removeEventListener('pointerdown', onDocumentPointerDown, true)
	document.removeEventListener('keydown', onDocumentKeyDown, true)
	window.removeEventListener('blur', closeContextMenu)
	activeResizeCleanup?.()
	activeSelectionCleanup?.()
})

function normalizeTableRow(row: VueTableRow, index: number): VueTableRow {
	return { ...row, [VUE_TABLE_ROW_ID_FIELD]: row[VUE_TABLE_ROW_ID_FIELD] || `row-${index + 1}` }
}

function updateTableProps(nextProps: Partial<VueTableShape['props']>) {
	props.editor.updateShape({ id: props.shape.id, type: props.shape.type, props: nextProps } as never)
}

function getCellFromPoint(clientX: number, clientY: number) {
	const target = document.elementFromPoint(clientX, clientY)
	const cell = target instanceof Element ? target.closest<HTMLElement>('[data-table-cell="true"]') : null
	if (!cell || !tableRoot.value?.contains(cell)) return null
	const row = Number(cell.dataset.row)
	const col = Number(cell.dataset.col)
	return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null
}

function isCellSelected(row: number, col: number) {
	const selection = activeSelection.value
	return Boolean(selection && row >= selection.rowStart && row <= selection.rowEnd &&
		col >= selection.colStart && col <= selection.colEnd)
}

function startCellSelection(event: PointerEvent, row: number, col: number) {
	if (!props.selected || event.button !== 0) return
	event.preventDefault()
	event.stopPropagation()
	closeContextMenu()
	focusShape(event)
	activeSelectionCleanup?.()
	selectionStart.value = { row, col }
	selectionEnd.value = { row, col }
	const pointerId = event.pointerId
	const updateSelection = (moveEvent: PointerEvent) => {
		if (moveEvent.pointerId !== pointerId) return
		const cell = getCellFromPoint(moveEvent.clientX, moveEvent.clientY)
		if (cell) selectionEnd.value = cell
	}
	const cleanup = () => {
		window.removeEventListener('pointermove', updateSelection, true)
		window.removeEventListener('pointerup', finishSelection, true)
		window.removeEventListener('pointercancel', finishSelection, true)
		if (activeSelectionCleanup === cleanup) activeSelectionCleanup = null
	}
	const finishSelection = (upEvent: PointerEvent) => {
		if (upEvent.pointerId !== pointerId) return
		updateSelection(upEvent)
		cleanup()
	}
	activeSelectionCleanup = cleanup
	window.addEventListener('pointermove', updateSelection, { capture: true, passive: false })
	window.addEventListener('pointerup', finishSelection, { capture: true, passive: false })
	window.addEventListener('pointercancel', finishSelection, { capture: true, passive: false })
}

function openContextMenu(event: MouseEvent, row: number, col: number) {
	if (!props.selected) return
	event.preventDefault()
	event.stopPropagation()
	if (!isCellSelected(row, col)) {
		selectionStart.value = { row, col }
		selectionEnd.value = { row, col }
	}
	contextMenu.value = { x: event.clientX, y: event.clientY }
	requestAnimationFrame(constrainContextMenu)
}

function constrainContextMenu() {
	const menu = document.querySelector<HTMLElement>('.vue-table-context-menu')
	if (!menu || !contextMenu.value) return
	contextMenu.value = {
		x: Math.max(8, Math.min(contextMenu.value.x, window.innerWidth - menu.offsetWidth - 8)),
		y: Math.max(8, Math.min(contextMenu.value.y, window.innerHeight - menu.offsetHeight - 8)),
	}
}
function closeContextMenu() { contextMenu.value = null }
function onDocumentPointerDown(event: PointerEvent) {
	if (contextMenu.value && !(event.target instanceof Element && event.target.closest('.vue-table-context-menu'))) {
		closeContextMenu()
	}
}
function onDocumentKeyDown(event: KeyboardEvent) {
	if (contextMenu.value && event.key === 'Escape') { event.preventDefault(); closeContextMenu() }
}

function createRow(): VueTableRow {
	const row: VueTableRow = { [VUE_TABLE_ROW_ID_FIELD]: `row-${Date.now()}-${++rowSeed}` }
	props.shape.props.columns.forEach(column => { row[column.field] = '' })
	return row
}
function createColumn(source?: VueTableColumn): VueTableColumn {
	const usedFields = new Set(props.shape.props.columns.map(column => column.field))
	let field: string
	do { field = `area_col_${++columnSeed}` } while (usedFields.has(field))
	return { field, title: `新增列 ${columnSeed}`, width: source?.width ?? 120 }
}

function insertRows() {
	const selection = activeSelection.value
	if (!selection) return
	const count = selectedRowCount.value
	const rows = props.shape.props.rows.map(row => ({ ...row }))
	rows.splice(selection.rowStart, 0, ...Array.from({ length: count }, createRow))
	updateTableProps({ rows, mergeCells: insertTableMergeAxis(tableMerges.value, 'row', selection.rowStart, count) })
	selectionStart.value = { row: selection.rowStart, col: selection.colStart }
	selectionEnd.value = { row: selection.rowStart + count - 1, col: selection.colEnd }
	closeContextMenu()
}
function insertColumns() {
	const selection = activeSelection.value
	if (!selection) return
	const count = selectedColumnCount.value
	const source = props.shape.props.columns[selection.colStart]
	const inserted = Array.from({ length: count }, () => createColumn(source))
	const columns = props.shape.props.columns.map(column => ({ ...column }))
	columns.splice(selection.colStart, 0, ...inserted)
	const rows = props.shape.props.rows.map(row => {
		const next = { ...row }
		inserted.forEach(column => { next[column.field] = '' })
		return next
	})
	updateTableProps({ columns, rows, mergeCells: insertTableMergeAxis(tableMerges.value, 'col', selection.colStart, count) })
	selectionStart.value = { row: selection.rowStart, col: selection.colStart }
	selectionEnd.value = { row: selection.rowEnd, col: selection.colStart + count - 1 }
	closeContextMenu()
}
function removeRows() {
	const selection = activeSelection.value
	if (!selection || !canRemoveRows.value) return
	const count = selectedRowCount.value
	const removedIds = new Set(props.shape.props.rows.slice(selection.rowStart, selection.rowEnd + 1)
		.map((row, index) => getVueTableRowId(row, selection.rowStart + index)))
	const rows = props.shape.props.rows.filter((_, index) => index < selection.rowStart || index > selection.rowEnd)
		.map(row => ({ ...row }))
	const rowHeights = Object.fromEntries(Object.entries(props.shape.props.rowHeights ?? {}).filter(([id]) => !removedIds.has(id)))
	updateTableProps({ rows, rowHeights, mergeCells: removeTableMergeAxis(tableMerges.value, 'row', selection.rowStart, count) })
	const nextRow = Math.min(selection.rowStart, rows.length - 1)
	selectionStart.value = { row: nextRow, col: selection.colStart }
	selectionEnd.value = { row: nextRow, col: selection.colStart }
	closeContextMenu()
}
function removeColumns() {
	const selection = activeSelection.value
	if (!selection || !canRemoveColumns.value) return
	const count = selectedColumnCount.value
	const removedFields = new Set(props.shape.props.columns.slice(selection.colStart, selection.colEnd + 1).map(column => column.field))
	const columns = props.shape.props.columns.filter((_, index) => index < selection.colStart || index > selection.colEnd)
		.map(column => ({ ...column }))
	const rows = props.shape.props.rows.map(row => Object.fromEntries(Object.entries(row).filter(([field]) => !removedFields.has(field))))
	updateTableProps({ columns, rows, mergeCells: removeTableMergeAxis(tableMerges.value, 'col', selection.colStart, count) })
	const nextCol = Math.min(selection.colStart, columns.length - 1)
	selectionStart.value = { row: selection.rowStart, col: nextCol }
	selectionEnd.value = { row: selection.rowStart, col: nextCol }
	closeContextMenu()
}
function mergeCells() {
	const selection = activeSelection.value
	if (!selection || !canMerge.value) return
	const remaining = tableMerges.value.filter(merge => !tableMergesIntersecting([merge], selection).length)
	updateTableProps({ mergeCells: [...remaining, {
		row: selection.rowStart, col: selection.colStart,
		rowspan: selectedRowCount.value, colspan: selectedColumnCount.value,
	}] })
	closeContextMenu()
}
function splitCells() {
	const selection = activeSelection.value
	if (!selection || !canSplit.value) return
	updateTableProps({ mergeCells: tableMerges.value.filter(merge => !tableMergesIntersecting([merge], selection).length) })
	closeContextMenu()
}

function selectedText() {
	const selection = activeSelection.value
	if (!selection) return ''
	return tableRows.value.slice(selection.rowStart, selection.rowEnd + 1)
		.map(row => props.shape.props.columns.slice(selection.colStart, selection.colEnd + 1)
			.map(column => row[column.field] ?? '').join('\t')).join('\n')
}
function onCopy(event: ClipboardEvent) {
	if (!activeSelection.value || !event.clipboardData) return
	event.preventDefault(); event.stopPropagation(); event.clipboardData.setData('text/plain', selectedText())
}
function clearSelectedCells() {
	const selection = activeSelection.value
	if (!selection) return
	const rows = props.shape.props.rows.map((row, rowIndex) => {
		const next = { ...row }
		if (rowIndex >= selection.rowStart && rowIndex <= selection.rowEnd) {
			for (let col = selection.colStart; col <= selection.colEnd; col += 1) {
				const field = props.shape.props.columns[col]?.field
				if (field) next[field] = ''
			}
		}
		return next
	})
	updateTableProps({ rows })
}
function onCut(event: ClipboardEvent) { onCopy(event); clearSelectedCells() }
function onPaste(event: ClipboardEvent) {
	const selection = activeSelection.value
	const text = event.clipboardData?.getData('text/plain')
	if (!selection || !text) return
	event.preventDefault(); event.stopPropagation()
	const values = text.replace(/\r/g, '').split('\n').map(line => line.split('\t'))
	const rows = props.shape.props.rows.map(row => ({ ...row }))
	values.forEach((valuesRow, rowOffset) => valuesRow.forEach((value, colOffset) => {
		const row = rows[selection.rowStart + rowOffset]
		const field = props.shape.props.columns[selection.colStart + colOffset]?.field
		if (row && field) row[field] = value
	}))
	updateTableProps({ rows })
}
function onKeyDown(event: KeyboardEvent) {
	event.stopPropagation()
	if ((event.key === 'Delete' || event.key === 'Backspace') && activeSelection.value) {
		event.preventDefault(); clearSelectedCells()
	}
}

function startColumnResize(event: PointerEvent, handle: { index: number; position: number }) {
	const column = props.shape.props.columns[handle.index]
	if (column) startTableResize(event, 'column', handle.index, handle.position, column.width, 24)
}
function startRowResize(event: PointerEvent, handle: { index: number; position: number; value: number }) {
	startTableResize(event, 'row', handle.index, handle.position, handle.value, 22, 72)
}
function startTableResize(
	event: PointerEvent, axis: 'column' | 'row', index: number, startPosition: number,
	currentValue: number, minValue: number, maxValue = Number.POSITIVE_INFINITY
) {
	if (!props.selected || event.button !== 0) return
	event.preventDefault(); event.stopPropagation(); activeResizeCleanup?.(); closeContextMenu()
	const pointerId = event.pointerId
	const startClientPosition = axis === 'column' ? event.clientX : event.clientY
	const previousCursor = document.body.style.cursor
	const previousUserSelect = document.body.style.userSelect
	document.body.style.cursor = axis === 'column' ? 'col-resize' : 'row-resize'
	document.body.style.userSelect = 'none'
	resizePreview.value = { axis, position: startPosition, value: currentValue }
	const updatePreview = (moveEvent: PointerEvent) => {
		if (moveEvent.pointerId !== pointerId) return
		moveEvent.preventDefault(); moveEvent.stopPropagation()
		const clientPosition = axis === 'column' ? moveEvent.clientX : moveEvent.clientY
		const nextValue = getZoomAdjustedResizeValue(currentValue,
			currentValue + clientPosition - startClientPosition, props.zoom, minValue, maxValue)
		resizePreview.value = { axis, position: startPosition + nextValue - currentValue, value: nextValue }
	}
	const cleanup = () => {
		window.removeEventListener('pointermove', updatePreview, true)
		window.removeEventListener('pointerup', finishResize, true)
		window.removeEventListener('pointercancel', cancelResize, true)
		document.body.style.cursor = previousCursor; document.body.style.userSelect = previousUserSelect
		resizePreview.value = null
		if (activeResizeCleanup === cleanup) activeResizeCleanup = null
	}
	const finishResize = (upEvent: PointerEvent) => {
		if (upEvent.pointerId !== pointerId) return
		updatePreview(upEvent); const nextValue = resizePreview.value?.value ?? currentValue
		cleanup(); commitTableResize(axis, index, nextValue)
	}
	const cancelResize = (cancelEvent: PointerEvent) => {
		if (cancelEvent.pointerId !== pointerId) return
		cancelEvent.preventDefault(); cancelEvent.stopPropagation(); cleanup()
	}
	activeResizeCleanup = cleanup
	window.addEventListener('pointermove', updatePreview, { capture: true, passive: false })
	window.addEventListener('pointerup', finishResize, { capture: true, passive: false })
	window.addEventListener('pointercancel', cancelResize, { capture: true, passive: false })
}
function commitTableResize(axis: 'column' | 'row', index: number, value: number) {
	if (axis === 'column') {
		const columns = props.shape.props.columns.map(column => ({ ...column }))
		const column = columns[index]
		if (!column || column.width === value) return
		column.width = value; updateTableProps({ columns }); return
	}
	const row = props.shape.props.rows[index]
	const layout = tableRowLayouts.value[index]
	if (!row || !layout || layout.height === value) return
	updateTableProps({ rowHeights: { ...(props.shape.props.rowHeights ?? {}), [getVueTableRowId(row, index)]: value } })
}
function focusShape(event: Event) {
	const root = event.currentTarget instanceof HTMLElement
		? event.currentTarget.closest<HTMLElement>('.vue-table-shape')
		: tableRoot.value?.closest<HTMLElement>('.vue-table-shape')
	root?.focus({ preventScroll: true })
}
function stopWhenSelected(event: Event) { if (props.selected) event.stopPropagation() }
</script>

<template>
	<div
		class="vue-table-shape"
		:class="[{ 'is-selected': selected, 'has-visible-border': shape.props.showBorder }]"
		:data-shape-id="shape.id"
		tabindex="0"
		aria-label="表格"
		:style="{
			width: `${shape.props.w}px`, height: `${shape.props.h}px`, transform: pageTransform,
			opacity: shape.opacity, '--inverse-zoom': String(1 / zoom), '--vue-table-row-height': `${rowHeight}px`,
		}"
		@pointerdown="stopWhenSelected"
		@pointermove="stopWhenSelected"
		@pointerup="stopWhenSelected"
		@pointercancel="stopWhenSelected"
		@dblclick="stopWhenSelected"
		@keydown="onKeyDown"
		@keyup.stop
		@copy="onCopy"
		@cut="onCut"
		@paste="onPaste"
		@wheel.stop
	>
		<div ref="tableRoot" class="vue-table-shape__viewport">
			<table class="vue-table-shape__table" :style="{ width: `${tableWidth}px` }">
				<colgroup>
					<col v-for="column in shape.props.columns" :key="column.field" :style="{ width: `${column.width}px` }" />
				</colgroup>
				<tbody>
					<tr v-for="(cells, rowIndex) in tableCells" :key="tableRows[rowIndex]?.[VUE_TABLE_ROW_ID_FIELD] || rowIndex"
						:style="{ height: `${tableRowLayouts[rowIndex]?.height ?? rowHeight}px` }">
						<td v-for="cell in cells" :key="`${cell.row}:${cell.col}`"
							:data-row="cell.row" :data-col="cell.col" data-table-cell="true"
							:rowspan="cell.rowspan" :colspan="cell.colspan"
							@pointerdown="startCellSelection($event, cell.row, cell.col)"
							@contextmenu="openContextMenu($event, cell.row, cell.col)">
							<span>{{ cell.value }}</span>
						</td>
					</tr>
				</tbody>
			</table>
			<div v-if="selected && selectionStyle" class="vue-table-shape__selection" :style="selectionStyle" />
		</div>
		<div v-if="selected" class="vue-table-shape__resize-layer">
			<button v-for="handle in columnResizeHandles" :key="`column-${handle.index}`" type="button"
				class="vue-table-shape__resize-handle vue-table-shape__resize-handle--column"
				:style="{ left: `${handle.position}px` }" :aria-label="`调整第 ${handle.index + 1} 列宽度`"
				tabindex="-1" @pointerdown="startColumnResize($event, handle)" />
			<button v-for="handle in rowResizeHandles" :key="`row-${handle.index}`" type="button"
				class="vue-table-shape__resize-handle vue-table-shape__resize-handle--row"
				:style="{ top: `${handle.position}px` }" :aria-label="`调整第 ${handle.index + 1} 行高度`"
				tabindex="-1" @pointerdown="startRowResize($event, handle)" />
			<div v-if="resizePreview" class="vue-table-shape__resize-guide"
				:class="`vue-table-shape__resize-guide--${resizePreview.axis}`"
				:style="resizePreview.axis === 'column' ? { left: `${resizePreview.position}px` } : { top: `${resizePreview.position}px` }">
				<span class="vue-table-shape__resize-value">{{ resizePreview.value }} px</span>
			</div>
		</div>
		<Teleport to="body">
			<div v-if="contextMenu" class="vue-table-context-menu" role="menu"
				:style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" @contextmenu.prevent>
				<button type="button" role="menuitem" @click="insertRows">添加行</button>
				<button type="button" role="menuitem" @click="insertColumns">添加列</button>
				<button type="button" role="menuitem" :disabled="!canRemoveRows" @click="removeRows">删除行</button>
				<button type="button" role="menuitem" :disabled="!canRemoveColumns" @click="removeColumns">删除列</button>
				<div class="vue-table-context-menu__separator" role="separator" />
				<button type="button" role="menuitem" :disabled="!canMerge" @click="mergeCells">合并单元格</button>
				<button type="button" role="menuitem" :disabled="!canSplit" @click="splitCells">拆分单元格</button>
			</div>
		</Teleport>
	</div>
</template>
