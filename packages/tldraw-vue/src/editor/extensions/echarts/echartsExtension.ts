import VueEchartsShapeNode from '../../../components/shapes/VueEchartsShapeNode.vue'
import type { VueEditorExtension, VueShapeCreateDefinition } from '../../vueEditorExtensions'
import { BIChartShapeUtil, createDefaultBIChartProps, type BIChartShape } from './biChartShape'
import { chartPresets, type ChartType } from './chartOptions'

function chartCreate(chartType: ChartType, title: string): VueShapeCreateDefinition {
	return {
		shapeType: 'bi-chart',
		defaultSize: { w: 360, h: 240 },
		createShape({ editor, id, rect }) {
			editor.createShapes<BIChartShape>([{ id, type: 'bi-chart', x: rect.x, y: rect.y, props: { ...createDefaultBIChartProps(), w: rect.w, h: rect.h, chartType, title } }])
		},
	}
}

export const echartsExtension: VueEditorExtension = {
	id: 'echarts',
	shapeUtils: [BIChartShapeUtil],
	shapeComponents: { 'bi-chart': VueEchartsShapeNode },
	toolbarTools: chartPresets.map(preset => {
		const create = chartCreate(preset.type, preset.label)
		return {
			id: `echarts-${preset.type}`,
			label: preset.label,
			icon: `echarts-${preset.type}`,
			glyph: preset.glyph,
			placement: { area: 'more' as const, group: 'echarts' },
			selection: { tool: `echarts-${preset.type}` },
			canvasCreate: create,
			toolbarCreate: create,
		}
	}),
}
