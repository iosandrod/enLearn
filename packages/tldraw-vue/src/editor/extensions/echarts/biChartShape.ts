import { BaseBoxShapeUtil, resizeBox, svgExportElement, type TLResizeInfo } from '@tldraw/editor'
import type { TLBaseShape } from '@tldraw/tlschema'
import { init } from 'echarts'
import { baseProps, type BaseProps } from '../../shapeProps/base'
import { biChartPropertyRegistry } from '../../shapeProps/biChart'
import { buildChartOption, defaultChartConfig, type ChartConfig } from './chartOptions'

export type BIChartShape = TLBaseShape<'bi-chart', BaseProps & ChartConfig>

declare module '@tldraw/tlschema' {
	interface TLGlobalShapePropsMap {
		'bi-chart': BIChartShape['props']
	}
}

export function createDefaultBIChartProps(): BIChartShape['props'] {
	return { ...baseProps.defaults, ...defaultChartConfig, w: 360, h: 240 }
}

export class BIChartShapeUtil extends BaseBoxShapeUtil<BIChartShape> {
	static override type = 'bi-chart' as const
	static override props = biChartPropertyRegistry.validators

	override getDefaultProps() { return createDefaultBIChartProps() }
	override component() { return null }
	override getIndicatorPath(shape: BIChartShape) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
	override onResize(shape: BIChartShape, info: TLResizeInfo<BIChartShape>) {
		return resizeBox(shape, info, { minWidth: 80, minHeight: 60 })
	}

	override toSvg(shape: BIChartShape) {
		const props = shape.props
		const width = Math.max(1, props.w - props.paddingLeft - props.paddingRight)
		const height = Math.max(1, props.h - props.paddingTop - props.paddingBottom)
		const chart = init(null, undefined, { renderer: 'svg', ssr: true, width, height })
		try {
			chart.setOption({ ...buildChartOption(props), animation: false })
			return svgExportElement('g', null,
				svgExportElement('rect', { width: props.w, height: props.h, fill: props.background, rx: props.borderRadius ?? 0, stroke: props.showBorder ? '#64748b' : 'none' }),
				svgExportElement('image', { x: props.paddingLeft, y: props.paddingTop, width, height, href: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(chart.renderToSVGString())}` })
			)
		} catch (error) {
			return svgExportElement('text', { x: 8, y: 20, fill: '#b91c1c', fontSize: 12 }, error instanceof Error ? error.message : '图表配置错误')
		} finally {
			chart.dispose()
		}
	}
}
