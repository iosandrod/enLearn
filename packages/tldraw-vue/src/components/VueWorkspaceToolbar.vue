<script setup lang="ts">
import { computed } from 'vue'
import type { WorkspacePageSizeMm } from '@/editor/interactions/WorkspaceBoundsManager'

const PAGE_SIZE_PRESETS = [
	{ id: 'a4-portrait', label: 'A4 纵向', w: 210, h: 297 },
	{ id: 'a4-landscape', label: 'A4 横向', w: 297, h: 210 },
	{ id: 'a5-portrait', label: 'A5 纵向', w: 148, h: 210 },
	{ id: 'a5-landscape', label: 'A5 横向', w: 210, h: 148 },
	{ id: 'a3-portrait', label: 'A3 纵向', w: 297, h: 420 },
	{ id: 'a3-landscape', label: 'A3 横向', w: 420, h: 297 },
	{ id: 'b5-portrait', label: 'B5 纵向', w: 176, h: 250 },
	{ id: 'b5-landscape', label: 'B5 横向', w: 250, h: 176 },
	{ id: 'receipt-square', label: '方形票据', w: 80, h: 80 },
	{ id: 'photo-4x6', label: '照片 4×6', w: 100, h: 150 },
	{ id: 'photo-6x4', label: '照片 6×4', w: 150, h: 100 },
] as const

const props = defineProps<{
	pageSizeMm: WorkspacePageSizeMm
	zoom: number
}>()

const emit = defineEmits<{
	'fit-canvas': []
	'page-size-change': [size: WorkspacePageSizeMm]
	'zoom-in': []
	'zoom-out': []
	'zoom-reset': []
}>()

const zoomLabel = computed(() => `${Math.round(props.zoom * 100)}%`)

const selectedPresetId = computed(() => {
	const preset = PAGE_SIZE_PRESETS.find(
		(item) => item.w === props.pageSizeMm.w && item.h === props.pageSizeMm.h,
	)
	return preset?.id ?? 'custom'
})

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

function setPagePreset(event: Event) {
	const presetId = (event.target as HTMLSelectElement).value
	const preset = PAGE_SIZE_PRESETS.find((item) => item.id === presetId)
	if (!preset) return
	emit('page-size-change', { w: preset.w, h: preset.h })
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
		<button
			type="button"
			class="workspace-toolbar-button workspace-fit-button"
			aria-label="自适应画布"
			title="自适应画布"
			@click="emit('fit-canvas')"
		>
			<i class="ri-fullscreen-line" aria-hidden="true" />
		</button>
		<label class="workspace-page-preset" title="选择纸张尺寸">
			<span class="workspace-page-preset__label">纸张</span>
			<select
				class="workspace-page-preset__select"
				:value="selectedPresetId"
				aria-label="选择纸张尺寸"
				@change="setPagePreset"
			>
				<option value="custom">自定义</option>
				<option v-for="preset in PAGE_SIZE_PRESETS" :key="preset.id" :value="preset.id">
					{{ preset.label }}（{{ preset.w }} × {{ preset.h }} mm）
				</option>
			</select>
		</label>
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
