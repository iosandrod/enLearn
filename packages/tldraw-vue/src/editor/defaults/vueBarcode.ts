export const vueBarcodeDefaultSize = { w: 240, h: 96 } as const

export const vueBarcodeDefaultProps = {
	w: 240,
	h: 96,
	text: '1234567890',
	format: 'code128' as const,
	barColor: '#000000',
	background: '#ffffff',
	includeText: true,
	padding: 4,
	showBorder: false,
} as const
