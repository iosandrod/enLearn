<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { VxeColumn, VxeTable, VxeUI } from 'vxe-table'
import ExtendCellArea from 'vxe-table-plugin-extend-cell-area'
import {
	VUE_TABLE_ROW_ID_FIELD,
	type VueTableRow,
	type VueTableShape,
} from '@/editor/extensions/table/vueTableShape'
import type { VueShapeNodeProps } from './types'

VxeUI.use(ExtendCellArea, {
	allowBody: true,
	allowHeader: false,
	allowMulti: true,
	fillMode: 'copy',
})

const props = defineProps<VueShapeNodeProps<VueTableShape>>()
const tableRef = ref<any | null>(null)

const tableColumns = computed(() => props.shape.props.columns)
const tableRows = computed(() =>
	props.shape.props.rows.map((row, index) => normalizeTableRow(row, index))
)
const tableHeight = computed(() => Math.max(1, props.shape.props.h))
const rowHeight = computed(() => props.shape.props.rowHeight)
const rowConfig = computed(() => ({
	keyField: VUE_TABLE_ROW_ID_FIELD,
	height: rowHeight.value,
}))
const cellConfig = computed(() => ({
	height: rowHeight.value,
	padding: false,
}))
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
	() => [props.shape.props.w, props.shape.props.h, props.shape.props.rowHeight],
	() => {
		void nextTick(() => {
			void tableRef.value?.recalculate?.()
			void tableRef.value?.handleRecalculateCellAreaEvent?.()
		})
	}
)

function normalizeTableRow(row: VueTableRow, index: number): VueTableRow {
	return {
		...row,
		[VUE_TABLE_ROW_ID_FIELD]: row[VUE_TABLE_ROW_ID_FIELD] || `row-${index + 1}`,
	}
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
		>
			<VxeColumn
				v-for="column in tableColumns"
				:key="column.field"
				:field="column.field"
				:title="column.title"
				:width="column.width"
			/>
		</VxeTable>
	</div>
</template>
