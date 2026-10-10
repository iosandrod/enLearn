import assert from 'node:assert/strict'
import { buildChartOption, chartPresets, defaultChartConfig } from '../src/editor/extensions/echarts/chartOptions.ts'

for (const preset of chartPresets) {
	const option = buildChartOption({ ...defaultChartConfig, chartType: preset.type })
	assert.ok(Array.isArray(option.series), `${preset.type} should create a series`)
	assert.equal(option.title.text, defaultChartConfig.title)
}

const barOption = buildChartOption(defaultChartConfig)
assert.deepEqual(barOption.xAxis.data, ['一月', '二月', '三月', '四月', '五月'])
assert.deepEqual(barOption.series[0].data, [120, 200, 150, 180, 240])

const scatterOption = buildChartOption({ ...defaultChartConfig, chartType: 'scatter' })
assert.deepEqual(scatterOption.series[0].data[0], [1, 120])
assert.equal(scatterOption.xAxis.type, 'value')

assert.throws(
	() => buildChartOption({ ...defaultChartConfig, dataJson: '{invalid' }),
	/不是有效的 JSON/,
)
assert.throws(
	() => buildChartOption({ ...defaultChartConfig, dataJson: JSON.stringify({ categories: ['A'], values: [1, 2] }) }),
	/数量必须一致/,
)

const custom = buildChartOption({ ...defaultChartConfig, optionJson: '{"series":[]}' })
assert.deepEqual(custom.series, [])

console.log(`Verified BI chart options for ${chartPresets.length} chart types.`)
