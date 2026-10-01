import type { TLDefaultColorStyle, TLDefaultDashStyle, TLDefaultFillStyle, TLDefaultSizeStyle } from '@tldraw/tlschema'
import type { VueGeoShape } from '../interactions/types'

export const vueBoxDefaultSize = { w: 120, h: 76 } as const
export const vueHighlightDefaultSize = { w: 160, h: 48 } as const
export const vueLaserDefaultSize = { w: 48, h: 48 } as const

/** Defaults used when a vue-box record is restored without all properties. */
export const vueBoxDefaultProps = {
	w: 160,
	h: 96,
	geo: 'rectangle' as VueGeoShape,
	borderRadius: 8,
	color: 'blue' as TLDefaultColorStyle,
	dash: 'draw' as TLDefaultDashStyle,
	size: 'm' as TLDefaultSizeStyle,
	fill: 'semi' as TLDefaultFillStyle,
} as const
