import type { EChartsOption } from 'echarts'

export const chartPresets = [
	{ type: 'bar', label: '柱状图', glyph: '▥' },
	{ type: 'line', label: '折线图', glyph: '⌁' },
	{ type: 'area', label: '面积图', glyph: '◩' },
	{ type: 'pie', label: '饼图', glyph: '◕' },
	{ type: 'doughnut', label: '环形图', glyph: '◎' },
	{ type: 'scatter', label: '散点图', glyph: '⠿' },
	{ type: 'radar', label: '雷达图', glyph: '⬡' },
] as const

export type ChartType = typeof chartPresets[number]['type']
export type ChartConfig = {
	chartType: ChartType
	title: string
	chartColor: string
	background: string
	showLegend: boolean
	showTooltip: boolean
	dataJson: string
	optionJson: string
	fontSize: number
}

export const defaultChartConfig: ChartConfig = {
	chartType: 'bar',
	title: '柱状图',
	chartColor: '#3b82f6',
	background: '#ffffff',
	showLegend: true,
	showTooltip: true,
	dataJson: JSON.stringify({ categories: ['一月', '二月', '三月', '四月', '五月'], values: [120, 200, 150, 180, 240] }),
	optionJson: '',
	fontSize: 14,
}

function readObject(text: string, label: string): Record<string, unknown> {
	let value: unknown
	try { value = JSON.parse(text) } catch { throw new Error(`${label}不是有效的 JSON`) }
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}必须是 JSON 对象`)
	return value as Record<string, unknown>
}

/** Build a fresh option for both the canvas and SVG export. An override is a complete option. */
export function buildChartOption(config: ChartConfig): EChartsOption {
	if (config.optionJson.trim()) return readObject(config.optionJson, '高级配置') as EChartsOption
	const data = readObject(config.dataJson, '图表数据')
	if (!Array.isArray(data.categories) || !data.categories.every(value => typeof value === 'string')) {
		throw new Error('categories 必须是字符串数组')
	}
	if (!Array.isArray(data.values) || !data.values.every(value => typeof value === 'number' && Number.isFinite(value))) {
		throw new Error('values 必须是有限数值数组')
	}
	const categories = data.categories as string[]
	const values = data.values as number[]
	if (categories.length !== values.length) throw new Error('categories 和 values 的数量必须一致')
	const option: EChartsOption = {
		animation: false,
		backgroundColor: config.background,
		color: [config.chartColor, '#14b8a6', '#f97316', '#8b5cf6', '#64748b'],
		textStyle: { fontSize: config.fontSize },
		title: { text: config.title, left: 'center', top: 8, textStyle: { fontSize: config.fontSize } },
		tooltip: { show: config.showTooltip, trigger: config.chartType === 'bar' || config.chartType === 'line' || config.chartType === 'area' ? 'axis' : 'item' },
		legend: { show: config.showLegend, bottom: 4, type: 'scroll' },
	}
	if (config.chartType === 'pie' || config.chartType === 'doughnut') {
		option.series = [{ name: config.title, type: 'pie', radius: config.chartType === 'doughnut' ? ['38%', '62%'] : '62%', data: categories.map((name, i) => ({ name, value: values[i] })) }]
	} else if (config.chartType === 'radar') {
		const max = Math.max(1, ...values) * 1.2
		option.radar = { indicator: categories.map(name => ({ name, max })), radius: '56%' }
		option.series = [{ name: config.title, type: 'radar', data: [{ name: config.title, value: values }] }]
	} else {
		option.grid = { left: 16, right: 20, top: 50, bottom: config.showLegend ? 40 : 16, containLabel: true }
		option.xAxis = { type: config.chartType === 'scatter' ? 'value' : 'category', ...(config.chartType === 'scatter' ? {} : { data: categories }) }
		option.yAxis = { type: 'value' }
		option.series = [{ name: config.title, type: config.chartType === 'scatter' ? 'scatter' : config.chartType === 'bar' ? 'bar' : 'line', data: config.chartType === 'scatter' ? values.map((value, index) => [index + 1, value]) : values, ...(config.chartType === 'area' ? { areaStyle: {} } : {}) }]
	}
	return option
}
