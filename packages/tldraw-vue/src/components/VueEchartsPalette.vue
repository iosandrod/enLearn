<script setup lang="ts">
import type { CanvasTool, VueGeoShape } from '../editor/interactions/types'
import type { VueToolbarToolDefinition } from '../editor/vueEditorExtensions'
import VueComponentPalette from './VueComponentPalette.vue'

defineProps<{
	activeTool: CanvasTool
	currentGeoShape: VueGeoShape
	toolbarTools: readonly VueToolbarToolDefinition[]
}>()
const emit = defineEmits<{
	'before-action': []
	'tool-select': [tool: CanvasTool, geoShape?: VueGeoShape]
	'tool-drag-cancel': [event: PointerEvent]
	'tool-drag-end': [event: PointerEvent]
	'tool-drag-move': [event: PointerEvent]
	'tool-drag-start': [tool: CanvasTool, geoShape: VueGeoShape | undefined, event: PointerEvent]
}>()
</script>

<template>
	<section class="echarts-palette" aria-label="ECharts 图表组件">
		<h2 class="designer-tool-section__title">ECharts 图表</h2>
		<VueComponentPalette :active-tool="activeTool" :current-geo-shape="currentGeoShape"
			:toolbar-tools="toolbarTools" :compact="false"
			@before-action="emit('before-action')" @tool-select="(tool, geo) => emit('tool-select', tool, geo)"
			@tool-drag-cancel="emit('tool-drag-cancel', $event)" @tool-drag-end="emit('tool-drag-end', $event)"
			@tool-drag-move="emit('tool-drag-move', $event)"
			@tool-drag-start="(tool, geo, event) => emit('tool-drag-start', tool, geo, event)" />
	</section>
</template>
