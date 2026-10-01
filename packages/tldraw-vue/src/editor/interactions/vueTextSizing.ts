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
		fontSize?: number
		width?: number
		autoSize?: boolean
		paddingLeft?: number
		paddingRight?: number
		paddingTop?: number
		paddingBottom?: number
	}
) {
	const theme = editor.getCurrentTheme()
	const normalizedText = normalizeVueText(text || '')
	const configuredFontSize = Number(opts.fontSize)
	const fontSize = Number.isFinite(configuredFontSize) && configuredFontSize > 0
		? configuredFontSize
		: Math.round(theme.fontSize * VUE_FONT_SIZE_SCALE[opts.size])
	const paddingLeft = Math.max(0, Number(opts.paddingLeft) || 0)
	const paddingRight = Math.max(0, Number(opts.paddingRight) || 0)
	const paddingTop = Math.max(0, Number(opts.paddingTop) || 0)
	const paddingBottom = Math.max(0, Number(opts.paddingBottom) || 0)
	const horizontalPadding = paddingLeft + paddingRight
	const verticalPadding = paddingTop + paddingBottom
	const fixedWidth = opts.autoSize === false
		? Math.max(MIN_TEXT_WIDTH, Math.floor(opts.width ?? MIN_TEXT_WIDTH))
		: null
	const measured = editor.textMeasure.measureText(normalizedText || ' ', {
		fontFamily: getVueTextFontFamily(theme, opts.font),
		fontSize,
		fontWeight: TEXT_PROPS.fontWeight,
		fontStyle: TEXT_PROPS.fontStyle,
		lineHeight: theme.lineHeight,
		padding: TEXT_PROPS.padding,
		maxWidth: fixedWidth === null ? null : Math.max(MIN_TEXT_WIDTH, fixedWidth - horizontalPadding),
	})

	return {
		w: fixedWidth ?? Math.max(MIN_TEXT_WIDTH, Math.ceil(measured.w + horizontalPadding + 1)),
		h: Math.max(fontSize + verticalPadding, Math.ceil(measured.h + verticalPadding)),
	}
}
