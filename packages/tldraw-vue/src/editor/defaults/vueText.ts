export const vueTextDefaultSize = { w: 180, h: 44 } as const
export const vueNoteDefaultSize = { w: 180, h: 72 } as const

export const vueTextDefaultProps = {
	w: 180,
	h: 44,
	text: 'Text',
	color: 'black' as const,
	font: 'draw' as const,
	size: 'm' as const,
	autoSize: true,
	showBorder: false,
} as const

export const vueTextCreateDefaultProps = {
	text: 'Text',
	autoSize: false,
} as const

export const vueNoteDefaultProps = {
	w: 180,
	h: 72,
	text: 'Note',
	color: 'black' as const,
	font: 'draw' as const,
	size: 'm' as const,
	autoSize: false,
	showBorder: true,
} as const
