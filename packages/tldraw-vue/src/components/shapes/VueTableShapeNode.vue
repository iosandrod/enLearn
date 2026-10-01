<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { VxeColumn, VxeTable, VxeUI } from 'vxe-table'
import ExtendCellArea from 'vxe-table-plugin-extend-cell-area'
import {
	VUE_TABLE_ROW_ID_FIELD,
	type VueTableRow,
	type VueTableShape,
} from '@/editor/extensions/table/vueTableShape'
import {
	getVueTableRowId,
	getVueTableRowLayouts,
} from '@/editor/extensions/table/tableRowHeight'
import type { VueShapeNodeProps } from './types'
import { getLocalCellAreaGeometry } from './tableCellAreaGeometry'
import {
	cloneTableMergeCells,
	getZoomAdjustedResizeValue,
	type TableMergeCell,
} from './tableResize'

VxeUI.use(ExtendCellArea, {
	allowBody: true,
	allowHeader: false,
	allowMulti: true,
	fillMode: 'copy',
})

const props = defineProps<VueShapeNodeProps<VueTableShape>>()
const tableRef = ref<any | null>(null)
let activeCellArea: TableCellArea | null = null
let cellAreaAlignmentFrame: number | null = null
let activeResizeCleanup: (() => void) | null = null
let pendingResizeMergeCells: TableMergeCell[] | null = null

interface TableCellArea {
	startRow: VueTableRow | null
	endRow: VueTableRow | null
	startColumn: unknown
	endColumn: unknown
}

interface TableResizePreview {
	axis: 'column' | 'row'
	index: number
	position: number
	value: number
}

const resizePreview = ref<TableResizePreview | null>(null)

const tableColumns = computed(() => props.shape.props.columns)
const tableRows = computed(() =>
	props.shape.props.rows.map((row, index) => normalizeTableRow(row, index))
)
const tableHeight = computed(() => Math.max(1, props.shape.props.h))
const rowHeight = computed(() => props.shape.props.rowHeight)
const tableRowLayouts = computed(() =>
	getVueTableRowLayouts(
		props.shape.props.rows,
		rowHeight.value,
		props.shape.props.rowHeights
	)
)
const tableRowHeights = computed(() => tableRowLayouts.value.map(layout => layout.height))
const rowConfig = computed(() => ({
	keyField: VUE_TABLE_ROW_ID_FIELD,
	height: rowHeight.value,
}))
const cellConfig = computed(() => ({
	height: rowHeight.value,
	padding: false,
}))
const columnResizeHandles = computed(() => {
	let position = 0
	return props.shape.props.columns
		.map((column, index) => {
			position += column.width
			return { index, position }
		})
		.filter(handle => handle.position > 0 && handle.position <= props.shape.props.w)
})
const rowResizeHandles = computed(() => {
	return tableRowLayouts.value
		.map(layout => ({
			index: layout.index,
			position: layout.bottom,
			value: layout.height,
		}))
		.filter(handle => handle.position > 0 && handle.position <= props.shape.props.h)
})
const mouseConfig = computed(() =>
	props.selected
		? {
				area: true,
				extension: false,
			}
		: {
				area: false,
				extension: false,
			}
)
const areaConfig = {
	autoClear: false,
	multiple: true,
	selectCellByBody: true,
	selectCellByHeader: false,
	selectCellToRow: false,
	showColumnStatus: false,
	showRowStatus: false,
}

watch(
	() => [
		props.shape.props.w,
		props.shape.props.h,
		props.shape.props.rowHeight,
		tableRowHeights.value.join(','),
		props.shape.props.columns.map(column => column.width).join(','),
		props.zoom,
	],
	() => {
		const mergeCells = pendingResizeMergeCells
		pendingResizeMergeCells = null
		void nextTick(async () => {
			const table = tableRef.value
			await applyTableRowHeights(table)
			await table?.recalculate?.()
			if (mergeCells?.length) {
				// VXE may queue its own column/row refresh for the same Vue tick.
				// Restore after that refresh so it cannot clear the snapshot again.
				await nextTick()
				await table?.clearMergeCells?.()
				await table?.setMergeCells?.(mergeCells)
				await table?.recalculate?.()
			}
			await table?.handleRecalculateCellAreaEvent?.()
			alignActiveCellArea()
		})
	},
	{ immediate: true }
)

onBeforeUnmount(() => {
	if (cellAreaAlignmentFrame !== null) {
		window.cancelAnimationFrame(cellAreaAlignmentFrame)
	}
	activeResizeCleanup?.()
})

function normalizeTableRow(row: VueTableRow, index: number): VueTableRow {
	return {
		...row,
		[VUE_TABLE_ROW_ID_FIELD]: row[VUE_TABLE_ROW_ID_FIELD] || `row-${index + 1}`,
	}
}

async function applyTableRowHeights(table: any) {
	if (!table?.setRowHeightConf) return
	const heightConf = Object.fromEntries(
		tableRows.value.map((row, index) => [
			row[VUE_TABLE_ROW_ID_FIELD],
			tableRowHeights.value[index] ?? rowHeight.value,
		])
	)
	await table.setRowHeightConf(heightConf)
}

function alignActiveCellArea() {
	const area = activeCellArea
	const table = tableRef.value
	if (!area?.startRow || !area.endRow || !table) return

	const startCell = table.getCellElement?.(area.startRow, area.startColumn)
	const endCell = table.getCellElement?.(area.endRow, area.endColumn)
	if (!(startCell instanceof HTMLElement) || !(endCell instanceof HTMLElement)) return

	const wrapper = startCell.closest('.vxe-table--body-wrapper')
	const areaElement = wrapper?.querySelector('.vxe-table--cell-area')
	const rootElement = areaElement?.parentElement
	if (!(areaElement instanceof HTMLElement) || !(rootElement instanceof HTMLElement)) return

	const geometry = getLocalCellAreaGeometry({
		rootRect: rootElement.getBoundingClientRect(),
		rootOffsetWidth: rootElement.offsetWidth,
		rootOffsetHeight: rootElement.offsetHeight,
		rootScrollLeft: rootElement.scrollLeft,
		rootScrollTop: rootElement.scrollTop,
		startRect: startCell.getBoundingClientRect(),
		endRect: endCell.getBoundingClientRect(),
	})
	if (!geometry) return

	const style = {
		display: 'block',
		left: `${geometry.left}px`,
		top: `${geometry.top}px`,
		width: `${geometry.width}px`,
		height: `${geometry.height}px`,
	}
	for (const selector of ['.vxe-table--cell-main-area', '.vxe-table--cell-active-area']) {
		const element = areaElement.querySelector(selector)
		if (element instanceof HTMLElement) Object.assign(element.style, style)
	}
}

function scheduleCellAreaAlignment() {
	if (cellAreaAlignmentFrame !== null) {
		window.cancelAnimationFrame(cellAreaAlignmentFrame)
	}
	cellAreaAlignmentFrame = window.requestAnimationFrame(() => {
		cellAreaAlignmentFrame = null
		alignActiveCellArea()
	})
}

function onCellAreaSelection(event: unknown) {
	if (!event || typeof event !== 'object' || !('area' in event)) return
	const area = event.area as TableCellArea | undefined
	if (!area) return
	activeCellArea = area
	alignActiveCellArea()
	scheduleCellAreaAlignment()
}

// VXE's native resize bar measures screen pixels, so the table owns the handles
// to keep the preview line and persisted logical size aligned with canvas zoom.
function startColumnResize(event: PointerEvent, handle: { index: number; position: number }) {
	const column = props.shape.props.columns[handle.index]
	if (!column) return
	startTableResize(event, 'column', handle.index, handle.position, column.width, 24)
}

function startRowResize(
	event: PointerEvent,
	handle: { index: number; position: number; value: number }
) {
	startTableResize(event, 'row', handle.index, handle.position, handle.value, 22, 72)
}

function startTableResize(
	event: PointerEvent,
	axis: 'column' | 'row',
	index: number,
	startPosition: number,
	currentValue: number,
	minValue: number,
	maxValue = Number.POSITIVE_INFINITY
) {
	if (!props.selected || event.button !== 0) return
	event.preventDefault()
	event.stopPropagation()
	activeResizeCleanup?.()

	const pointerId = event.pointerId
	const startClientPosition = axis === 'column' ? event.clientX : event.clientY
	const previousCursor = document.body.style.cursor
	const previousUserSelect = document.body.style.userSelect
	document.body.style.cursor = axis === 'column' ? 'col-resize' : 'row-resize'
	document.body.style.userSelect = 'none'
	resizePreview.value = { axis, index, position: startPosition, value: currentValue }

	const updatePreview = (moveEvent: PointerEvent) => {
		if (moveEvent.pointerId !== pointerId) return
		moveEvent.preventDefault()
		moveEvent.stopPropagation()
		const clientPosition = axis === 'column' ? moveEvent.clientX : moveEvent.clientY
		const screenDelta = clientPosition - startClientPosition
		const nextValue = getZoomAdjustedResizeValue(
			currentValue,
			currentValue + screenDelta,
			props.zoom,
			minValue,
			maxValue
		)
		resizePreview.value = {
			axis,
			index,
			position: startPosition + nextValue - currentValue,
			value: nextValue,
		}
	}

	const cleanup = () => {
		window.removeEventListener('pointermove', updatePreview, true)
		window.removeEventListener('pointerup', finishResize, true)
		window.removeEventListener('pointercancel', cancelResize, true)
		document.body.style.cursor = previousCursor
		document.body.style.userSelect = previousUserSelect
		resizePreview.value = null
		if (activeResizeCleanup === cleanup) activeResizeCleanup = null
	}

	const finishResize = (upEvent: PointerEvent) => {
		if (upEvent.pointerId !== pointerId) return
		updatePreview(upEvent)
		const nextValue = resizePreview.value?.value ?? currentValue
		cleanup()
		commitTableResize(axis, index, nextValue)
	}

	const cancelResize = (cancelEvent: PointerEvent) => {
		if (cancelEvent.pointerId !== pointerId) return
		cancelEvent.preventDefault()
		cancelEvent.stopPropagation()
		cleanup()
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
		pendingResizeMergeCells = cloneTableMergeCells(tableRef.value?.getMergeCells?.())
		column.width = value
		props.editor.updateShape({
			id: props.shape.id,
			type: props.shape.type,
			props: { columns },
		} as never)
		return
	}

	const row = props.shape.props.rows[index]
	if (!row || tableRowHeights.value[index] === value) return
	pendingResizeMergeCells = cloneTableMergeCells(tableRef.value?.getMergeCells?.())
	const rowHeights = {
		...(props.shape.props.rowHeights ?? {}),
		[getVueTableRowId(row, index)]: value,
	}
	props.editor.updateShape({
		id: props.shape.id,
		type: props.shape.type,
		props: { rowHeights },
	} as never)
}

function focusShape(event: Event) {
	if (event.currentTarget instanceof HTMLElement) {
		event.currentTarget.focus({ preventScroll: true })
	}
}

function onPointerDown(event: PointerEvent) {
	if (!props.selected) return
	event.stopPropagation()
	focusShape(event)
}

function onMouseDown(event: MouseEvent) {
	if (props.selected) event.stopPropagation()
}

function stopWhenSelected(event: Event) {
	if (props.selected) event.stopPropagation()
}

function stopAlways(event: Event) {
	event.stopPropagation()
}
</script>

<template>
	<div
		class="vue-table-shape"
		:class="[{ 'is-selected': selected, 'has-visible-border': shape.props.showBorder }]"
		:data-shape-id="shape.id"
		tabindex="0"
		aria-label="Table"
		:style="{
			width: `${shape.props.w}px`,
			height: `${shape.props.h}px`,
			transform: pageTransform,
			opacity: shape.opacity,
			'--inverse-zoom': String(1 / zoom),
			'--vue-table-row-height': `${rowHeight}px`,
		}"
		@pointerdown="onPointerDown"
		@mousedown="onMouseDown"
		@pointermove="stopWhenSelected"
		@pointerup="stopWhenSelected"
		@pointercancel="stopWhenSelected"
		@dblclick="stopWhenSelected"
		@keydown="stopAlways"
		@keyup="stopAlways"
		@copy="stopAlways"
		@cut="stopAlways"
		@paste="stopAlways"
		@wheel="stopAlways"
		@contextmenu="stopWhenSelected"
	>
		<VxeTable
			ref="tableRef"
			class="vue-table-shape__table"
			:data="tableRows"
			:height="tableHeight"
			:show-header="false"
			:show-footer="false"
			:border="'full'"
			:size="'mini'"
			:round="false"
			:stripe="false"
			:fit="false"
			:auto-resize="true"
			:sync-resize="true"
			:show-overflow="false"
			:row-config="rowConfig"
			:cell-config="cellConfig"
			:mouse-config="mouseConfig"
			:area-config="areaConfig"
			@cell-area-selection-start="onCellAreaSelection"
			@cell-area-selection-drag="onCellAreaSelection"
			@cell-area-selection-end="onCellAreaSelection"
		>
			<VxeColumn
				v-for="column in tableColumns"
				:key="column.field"
				:field="column.field"
				:title="column.title"
				:width="column.width"
			/>
		</VxeTable>
		<div v-if="selected" class="vue-table-shape__resize-layer">
			<button
				v-for="handle in columnResizeHandles"
				:key="`column-${handle.index}`"
				type="button"
				class="vue-table-shape__resize-handle vue-table-shape__resize-handle--column"
				:style="{ left: `${handle.position}px` }"
				:aria-label="`Resize column ${handle.index + 1}`"
				tabindex="-1"
				@pointerdown="startColumnResize($event, handle)"
			/>
			<button
				v-for="handle in rowResizeHandles"
				:key="`row-${handle.index}`"
				type="button"
				class="vue-table-shape__resize-handle vue-table-shape__resize-handle--row"
				:style="{ top: `${handle.position}px` }"
				:aria-label="`Resize row ${handle.index + 1}`"
				tabindex="-1"
				@pointerdown="startRowResize($event, handle)"
			/>
			<div
				v-if="resizePreview"
				class="vue-table-shape__resize-guide"
				:class="`vue-table-shape__resize-guide--${resizePreview.axis}`"
				:style="
					resizePreview.axis === 'column'
						? { left: `${resizePreview.position}px` }
						: { top: `${resizePreview.position}px` }
				"
			>
				<span class="vue-table-shape__resize-value">{{ resizePreview.value }} px</span>
			</div>
		</div>
	</div>
</template>
