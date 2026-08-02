import { getColorValue, type Editor } from '@tldraw/editor'
import type {
	TLDefaultColorStyle,
	TLDefaultDashStyle,
	TLDefaultFillStyle,
	TLDefaultFontStyle,
	TLDefaultSizeStyle,
} from '@tldraw/tlschema'
import { getDashArray, VUE_FONT_SIZE_SCALE, VUE_STROKE_SIZES } from '@/editor/vueStyleDefs'
import { useEditorValue } from '@/vue/useEditorValue'

export function useVueShapeTheme(editor: Editor, scope: string) {
	const theme = useEditorValue(`${scope} theme`, () => editor.getCurrentTheme())
	const colorMode = useEditorValue(`${scope} color mode`, () => editor.getColorMode())

	function getThemeColor(
		color: TLDefaultColorStyle | string,
		variant: 'solid' | 'semi' | 'fill' | 'pattern'
	) {
		return getColorValue(theme.value.colors[colorMode.value], color, variant)
	}

	function getFillColor(color: TLDefaultColorStyle, fill: TLDefaultFillStyle) {
		if (fill === 'none') return 'transparent'
		if (fill === 'semi') return getThemeColor(color, 'semi')
		if (fill === 'pattern') return getThemeColor(color, 'semi')
		return getThemeColor(color, 'fill')
	}

	function getFillImage(color: TLDefaultColorStyle, fill: TLDefaultFillStyle) {
		if (fill !== 'pattern') return undefined
		const patternColor = getThemeColor(color, 'pattern')
		return `repeating-linear-gradient(135deg, transparent 0 6px, ${patternColor} 6px 7px, transparent 7px 12px)`
	}

	function getBorderStyle(dash: TLDefaultDashStyle) {
		if (dash === 'dashed') return 'dashed'
		if (dash === 'dotted') return 'dotted'
		return 'solid'
	}

	function getStrokeWidth(size: TLDefaultSizeStyle) {
		return VUE_STROKE_SIZES[size]
	}

	function getFontSize(size: TLDefaultSizeStyle) {
		return Math.round(theme.value.fontSize * VUE_FONT_SIZE_SCALE[size])
	}

	function getTextFontFamily(font: TLDefaultFontStyle) {
		const themeFont = theme.value.fonts[font as keyof typeof theme.value.fonts]
		return themeFont?.fontFamily ?? 'sans-serif'
	}

	return {
		colorMode,
		getBorderStyle,
		getDashArray,
		getFillColor,
		getFillImage,
		getFontSize,
		getStrokeWidth,
		getTextFontFamily,
		getThemeColor,
		theme,
	}
}
