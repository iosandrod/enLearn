import { code128, code39, drawingSVG, ean13, ean8, upca } from 'bwip-js/browser'
import type { VueBarcodeShape } from './vueBarcodeShape'

export function createBarcodeSvgMarkup(props: VueBarcodeShape['props']) {
	const options = {
		bcid: props.format,
		text: props.text.trim() || ' ',
		height: 12,
		includetext: props.includeText,
		textxalign: 'center',
		barcolor: normalizeColor(props.barColor, '000000'),
		textcolor: normalizeColor(props.barColor, '000000'),
		backgroundcolor: normalizeColor(props.background, 'ffffff'),
		padding: Math.max(0, Math.round(props.padding)),
	} as const

	switch (props.format) {
		case 'code39':
			return code39(options, drawingSVG())
		case 'ean13':
			return ean13(options, drawingSVG())
		case 'ean8':
			return ean8(options, drawingSVG())
		case 'upca':
			return upca(options, drawingSVG())
		default:
			return code128(options, drawingSVG())
	}
}

export function createBarcodeSvgDataUrl(props: VueBarcodeShape['props']) {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createBarcodeSvgMarkup(props))}`
}

function normalizeColor(value: string, fallback: string) {
	const normalized = value.trim().replace(/^#/, '')
	return /^[0-9a-f]{6}$/i.test(normalized) ? normalized : fallback
}
