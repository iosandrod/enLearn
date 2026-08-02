import type {
	TLDefaultColorStyle,
	TLDefaultDashStyle,
	TLDefaultFillStyle,
	TLDefaultSizeStyle,
} from '@tldraw/tlschema'

export const VUE_STROKE_SIZES: Record<TLDefaultSizeStyle, number> = {
	s: 1,
	m: 1.75,
	l: 2.5,
	xl: 5,
}

export const VUE_FONT_SIZE_SCALE: Record<TLDefaultSizeStyle, number> = {
	s: 1.125,
	m: 1.5,
	l: 2.25,
	xl: 2.75,
}

export const VUE_COLOR_ITEMS = [
	'black',
	'grey',
	'light-violet',
	'violet',
	'blue',
	'light-blue',
	'yellow',
	'orange',
	'green',
	'light-green',
	'light-red',
	'red',
] as const satisfies readonly TLDefaultColorStyle[]

export const VUE_FILL_ITEMS = ['none', 'semi', 'solid', 'pattern'] as const satisfies readonly TLDefaultFillStyle[]

export const VUE_DASH_ITEMS = ['draw', 'dashed', 'dotted', 'solid'] as const satisfies readonly TLDefaultDashStyle[]

export const VUE_SIZE_ITEMS = ['s', 'm', 'l', 'xl'] as const satisfies readonly TLDefaultSizeStyle[]

export function getDashArray(dash: TLDefaultDashStyle, strokeWidth: number) {
	if (dash === 'dashed') return `${strokeWidth * 4} ${strokeWidth * 3}`
	if (dash === 'dotted') return `0 ${strokeWidth * 2.4}`
	return undefined
}
