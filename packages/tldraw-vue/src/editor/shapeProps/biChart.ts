import { T } from '@tldraw/validate'
import { baseProps } from './base'
import { extendShapeProperties } from './registry'

export const biChartPropertyRegistry = extendShapeProperties(baseProps, {
	chartType: T.literalEnum('bar', 'line', 'area', 'pie', 'doughnut', 'scatter', 'radar'),
	title: T.string,
	chartColor: T.string,
	background: T.string,
	showLegend: T.boolean,
	showTooltip: T.boolean,
	dataJson: T.string,
	optionJson: T.string,
})
