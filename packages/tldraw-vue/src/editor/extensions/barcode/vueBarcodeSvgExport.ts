import { svgExportElement as createElement, type SvgExportNode } from '@tldraw/editor'
import { createBarcodeSvgDataUrl } from './barcodeSvg'
import type { VueBarcodeShape } from './vueBarcodeShape'

export function createVueBarcodeSvg(shape: VueBarcodeShape): SvgExportNode {
	try {
		return createElement(
			'g',
			null,
			createElement('rect', {
				width: shape.props.w,
				height: shape.props.h,
				fill: shape.props.background,
				stroke: shape.props.showBorder ? '#111827' : 'none',
				strokeWidth: shape.props.showBorder ? 1 : 0,
			}),
			createElement('image', {
				x: 2,
				y: 2,
				width: Math.max(1, shape.props.w - 4),
				height: Math.max(1, shape.props.h - 4),
				href: createBarcodeSvgDataUrl(shape.props),
				preserveAspectRatio: 'none',
			})
		)
	} catch {
		return createElement(
			'g',
			null,
			createElement('rect', {
				width: shape.props.w,
				height: shape.props.h,
				fill: shape.props.background,
				stroke: shape.props.showBorder ? '#111827' : 'none',
			}),
			createElement(
				'text',
				{
					x: shape.props.w / 2,
					y: shape.props.h / 2,
					fill: '#b42318',
					fontFamily: 'sans-serif',
					fontSize: 12,
					textAnchor: 'middle',
					dominantBaseline: 'middle',
				},
				'条形码内容无效'
			)
		)
	}
}
