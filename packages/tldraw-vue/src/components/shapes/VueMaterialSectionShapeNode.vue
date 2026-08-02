<script setup lang="ts">
import type { TLShapePartial } from '@tldraw/editor'
import { computed, onBeforeUnmount } from 'vue'
import {
	getVueMaterialSectionDefinition,
	getVueMaterialSections,
	isVueMaterialShape,
	type VueMaterialSectionShape,
} from '@/editor/extensions/material/vueMaterialShape'
import type { VueShapeNodeProps } from './types'

const props = defineProps<VueShapeNodeProps<VueMaterialSectionShape>>()

const isTableBody = computed(() => props.shape.props.zone === 'tableBody')
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
			<div class="vue-material-table-columns">
				<div>销售订单</div>
				<div>状态</div>
				<div>审核日期</div>
				<div>客户名称</div>
			</div>
			<div class="vue-material-table-fill">
				<span>自动填充</span>
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
