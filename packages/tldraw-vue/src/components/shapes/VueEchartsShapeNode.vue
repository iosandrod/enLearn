<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useVxeMessage } from '@enlearn/lowcode-framework/utils/vxe-message'
import { init, type ECharts } from 'echarts'
import type { BIChartShape } from '../../editor/extensions/echarts/biChartShape'
import { buildChartOption } from '../../editor/extensions/echarts/chartOptions'
import type { VueShapeNodeProps } from './types'

const props = defineProps<VueShapeNodeProps<BIChartShape>>()
const chartElement = ref<HTMLDivElement | null>(null)
const errorMessage = ref('')
useVxeMessage(errorMessage, 'error')
let chart: ECharts | null = null
let resizeObserver: ResizeObserver | null = null
let disposed = false

async function renderChart() {
	await nextTick()
	if (disposed || !chartElement.value) return
	try {
		const option = buildChartOption(props.shape.props)
		chart ??= init(chartElement.value, undefined, { renderer: 'svg' })
		chart.setOption(option, true)
		chart.resize()
		errorMessage.value = ''
	} catch (error) {
		chart?.clear()
		errorMessage.value = error instanceof Error ? error.message : '图表配置错误'
	}
}

onMounted(() => {
	void renderChart()
	resizeObserver = new ResizeObserver(() => chart?.resize())
	if (chartElement.value) resizeObserver.observe(chartElement.value)
})
watch(() => props.shape.props, () => void renderChart(), { deep: true })
onBeforeUnmount(() => {
	disposed = true
	resizeObserver?.disconnect()
	chart?.dispose()
	chart = null
})
</script>

<template>
	<div class="vue-shape vue-echarts-shape" :class="{ 'is-selected': selected }" :style="{
		width: `${shape.props.w}px`, height: `${shape.props.h}px`, transform: pageTransform,
		opacity: shape.opacity, background: shape.props.background,
		border: shape.props.showBorder ? '1px solid #64748b' : '0',
		borderRadius: `${shape.props.borderRadius ?? 0}px`,
		padding: `${shape.props.paddingTop}px ${shape.props.paddingRight}px ${shape.props.paddingBottom}px ${shape.props.paddingLeft}px`,
		'--inverse-zoom': String(1 / zoom),
	}">
		<div ref="chartElement" class="vue-echarts-shape__chart" :aria-label="shape.props.title" role="img" />
	</div>
</template>

<style scoped>
.vue-echarts-shape { display: block; box-sizing: border-box; overflow: hidden; }
.vue-echarts-shape__chart { width: 100%; height: 100%; pointer-events: none; }
.vue-echarts-shape__error { position: absolute; inset: 0; display: grid; place-items: center; padding: 12px; color: #b91c1c; background: #fff7f7; font-size: 12px; pointer-events: none; }
</style>
