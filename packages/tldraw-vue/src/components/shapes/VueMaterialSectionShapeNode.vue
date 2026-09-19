<script setup lang="ts">
import type { TLShapePartial } from '@tldraw/editor'
import { computed, onBeforeUnmount } from 'vue'
import {
	getPrintDataSourceDetailColumns,
	getPrintDataSourceDetailRows,
} from '@/editor/dataSourceForm'
import {
	getVueMaterialSectionDefinition,
	getVueMaterialSections,
	isVueMaterialShape,
	type VueMaterialSectionShape,
} from '@/editor/extensions/material/vueMaterialShape'
import { getEditorPrintDataSource } from '@/editor/workspaceDataSource'
import type { VueShapeNodeProps } from './types'

const props = defineProps<VueShapeNodeProps<VueMaterialSectionShape>>()

const isTableBody = computed(() => props.shape.props.zone === 'tableBody')
const printDataSource = getEditorPrintDataSource(props.editor)
const previewColumns = computed(() => getPrintDataSourceDetailColumns(printDataSource.value))
const previewGridTemplate = computed(() =>
	previewColumns.value.map((column) => `minmax(0, ${column.width ?? 100}fr)`).join(' ')
)
const previewRows = computed(() => getPrintDataSourceDetailRows(printDataSource.value))
const visiblePreviewRows = computed(() => {
	const availableHeight = Math.max(0, props.shape.props.h - 36)
	const maxRows = Math.max(1, Math.floor(availableHeight / 28))
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
})

function formatPreviewValue(row: Record<string, unknown>, field: string) {
	const value = row[field]
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

</script>

<template>
	<div
		class="vue-material-section-shape"
		:class="[
			`vue-material-section-shape--${shape.props.zone}`,
			{ 'is-selected': selected, 'is-table-body': isTableBody },
		]"
		:data-shape-id="shape.id"
		:style="{
			width: `${shape.props.w}px`,
			height: `${shape.props.h}px`,
			transform: pageTransform,
			opacity: shape.opacity,
			'--inverse-zoom': String(1 / zoom),
		}"
	>
		<template v-if="isTableBody">
			<div class="vue-material-table-columns" :style="{ gridTemplateColumns: previewGridTemplate }">
				<div v-for="column in previewColumns" :key="column.field">{{ column.title }}</div>
			</div>
			<div v-if="visiblePreviewRows.length" class="vue-material-table-rows">
				<div
					v-for="(row, rowIndex) in visiblePreviewRows"
					:key="String(row._rowId ?? rowIndex)"
					class="vue-material-table-row"
					:style="{ gridTemplateColumns: previewGridTemplate }"
				>
					<div v-for="column in previewColumns" :key="column.field">
						{{ formatPreviewValue(row, column.field) }}
					</div>
				</div>
			</div>
			<div v-else class="vue-material-table-fill">
				<span>暂无 Detail 预览数据</span>
			</div>
		</template>
		<div v-else class="vue-material-section-label">{{ shape.props.label }}</div>
		<button
			v-if="canResizeBottom"
			type="button"
			class="vue-material-section-resize-handle"
			aria-label="Resize section height"
			title="Resize section height"
			@pointerdown="onResizePointerDown"
		/>
	</div>
</template>
