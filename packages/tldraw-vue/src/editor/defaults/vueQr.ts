export const vueQrDefaultSize = { w: 180, h: 180 } as const

export const vueQrDefaultProps = {
	w: 180,
	h: 180,
	text: 'https://tldraw.dev',
	color: 'black' as const,
	background: '#ffffff',
	errorCorrectionLevel: 'M' as const,
	margin: 4,
	showBorder: false,
} as const
