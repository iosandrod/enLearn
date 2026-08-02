<script setup lang="ts">
import { computed } from 'vue'
import type { WorkspacePageSizeMm } from '@/editor/interactions/WorkspaceBoundsManager'

const props = defineProps<{
	pageSizeMm: WorkspacePageSizeMm
	zoom: number
}>()

const emit = defineEmits<{
	'page-size-change': [size: WorkspacePageSizeMm]
	'zoom-in': []
	'zoom-out': []
	'zoom-reset': []
}>()

const zoomLabel = computed(() => `${Math.round(props.zoom * 100)}%`)

function parseDimension(value: string, fallback: number) {
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) return fallback
	return parsed
}

function setWidth(event: Event) {
	const input = event.target as HTMLInputElement
	emit('page-size-change', {
		w: parseDimension(input.value, props.pageSizeMm.w),
		h: props.pageSizeMm.h,
	})
}

function setHeight(event: Event) {
	const input = event.target as HTMLInputElement
	emit('page-size-change', {
		w: props.pageSizeMm.w,
		h: parseDimension(input.value, props.pageSizeMm.h),
	})
}
</script>

<template>
	<div
		class="workspace-toolbar"
		@pointerdown.stop
		@pointermove.stop
		@wheel.stop
		@contextmenu.prevent.stop
	>
		<label class="workspace-size-field" title="Page width">
			<input
				type="number"
				min="10"
				max="1000"
				step="0.1"
				:value="pageSizeMm.w"
				aria-label="Page width"
				@change="setWidth"
				@keydown.enter.prevent="setWidth"
			/>
		</label>
		<span class="workspace-size-separator">x</span>
		<label class="workspace-size-field" title="Page height">
			<input
				type="number"
				min="10"
				max="1000"
				step="0.1"
				:value="pageSizeMm.h"
				aria-label="Page height"
				@change="setHeight"
				@keydown.enter.prevent="setHeight"
			/>
		</label>
		<span class="workspace-size-unit">mm</span>

		<div class="workspace-toolbar-divider" />

		<button
			type="button"
			class="workspace-toolbar-button"
			aria-label="Zoom out"
			title="Zoom out"
			@click="emit('zoom-out')"
		>
			-
		</button>
		<button
			type="button"
			class="workspace-zoom-value"
			aria-label="Reset zoom"
			title="Reset zoom"
			@dblclick.prevent="emit('zoom-reset')"
			@click="emit('zoom-reset')"
		>
			{{ zoomLabel }}
		</button>
		<button
			type="button"
			class="workspace-toolbar-button"
			aria-label="Zoom in"
			title="Zoom in"
			@click="emit('zoom-in')"
		>
			+
		</button>
	</div>
</template>
