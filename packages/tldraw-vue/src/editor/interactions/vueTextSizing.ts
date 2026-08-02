import type { Editor, TLTheme } from '@tldraw/editor'
import type { TLDefaultFontStyle, TLDefaultSizeStyle } from '@tldraw/tlschema'
import { VUE_FONT_SIZE_SCALE } from '../vueStyleDefs'

const TEXT_PROPS = {
	fontWeight: 'normal',
	fontStyle: 'normal',
	padding: '0px',
}

const MIN_TEXT_WIDTH = 16

export function normalizeVueText(text: string) {
	return text.replace(/\r\n?/g, '\n')
}

export function getVueTextFontFamily(theme: TLTheme, font: TLDefaultFontStyle) {
	const themeFont = theme.fonts[font as keyof typeof theme.fonts]
	if (themeFont) return themeFont.fontFamily
	return 'sans-serif'
}

export function measureVueTextShape(
	editor: Editor,
	text: string,
	opts: {
		font: TLDefaultFontStyle
		size: TLDefaultSizeStyle
		width?: number
		autoSize?: boolean
	}
) {
	const theme = editor.getCurrentTheme()
	const normalizedText = normalizeVueText(text || '')
	const fontSize = Math.round(theme.fontSize * VUE_FONT_SIZE_SCALE[opts.size])
	const fixedWidth = opts.autoSize === false ? Math.max(MIN_TEXT_WIDTH, Math.floor(opts.width ?? MIN_TEXT_WIDTH)) : null
	const measured = editor.textMeasure.measureText(normalizedText || ' ', {
		fontFamily: getVueTextFontFamily(theme, opts.font),
		fontSize,
		fontWeight: TEXT_PROPS.fontWeight,
		fontStyle: TEXT_PROPS.fontStyle,
		lineHeight: theme.lineHeight,
		padding: TEXT_PROPS.padding,
		maxWidth: fixedWidth,
	})

	return {
		w: fixedWidth ?? Math.max(MIN_TEXT_WIDTH, Math.ceil(measured.w + 1)),
		h: Math.max(fontSize, Math.ceil(measured.h)),
	}
}
