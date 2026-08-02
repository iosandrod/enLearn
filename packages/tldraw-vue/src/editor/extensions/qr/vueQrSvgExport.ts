import {
	getColorValue,
	svgExportElement as createElement,
	type Editor,
	type SvgExportNode,
} from '@tldraw/editor'
import { create as createQrCode } from 'qrcode'
import type { VueQrShape } from './vueQrShape'

export function createVueQrSvg(editor: Editor, shape: VueQrShape): SvgExportNode {
	try {
		const qrCode = createQrCode(shape.props.text.trim() || ' ', {
			errorCorrectionLevel: shape.props.errorCorrectionLevel,
		})
		const moduleCount = qrCode.modules.size
		const margin = shape.props.margin
		let path = ''

		for (let y = 0; y < moduleCount; y++) {
			for (let x = 0; x < moduleCount; x++) {
				if (qrCode.modules.get(y, x)) path += `M${x},${y}h1v1h-1z`
			}
		}

		return createElement(
			'g',
			null,
			createElement('rect', {
				width: shape.props.w,
				height: shape.props.h,
				rx: 6,
				fill: shape.props.background,
				stroke: shape.props.showBorder ? '#111827' : 'none',
				strokeWidth: shape.props.showBorder ? 1 : 0,
			}),
			createElement(
				'svg',
				{
					x: 8,
					y: 8,
					width: Math.max(1, shape.props.w - 16),
					height: Math.max(1, shape.props.h - 16),
					viewBox: `${-margin} ${-margin} ${moduleCount + margin * 2} ${moduleCount + margin * 2}`,
					shapeRendering: 'crispEdges',
				},
				createElement('rect', {
					x: -margin,
					y: -margin,
					width: moduleCount + margin * 2,
					height: moduleCount + margin * 2,
					fill: shape.props.background,
				}),
				createElement('path', {
					d: path,
					fill: getColorValue(
						editor.getCurrentTheme().colors[editor.getColorMode()],
						shape.props.color,
						'solid'
					),
				})
			)
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
				strokeWidth: shape.props.showBorder ? 1 : 0,
			}),
			createElement(
				'text',
				{
					x: shape.props.w / 2,
					y: shape.props.h / 2,
					fill: '#b42318',
					fontFamily: 'sans-serif',
					fontSize: 12,
					fontWeight: 700,
					textAnchor: 'middle',
					dominantBaseline: 'middle',
					pointerEvents: 'none',
				},
				'Invalid QR'
			)
		)
	}
}
