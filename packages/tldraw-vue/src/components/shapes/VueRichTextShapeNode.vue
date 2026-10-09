<script setup lang="ts">
import { computed } from 'vue'
import type { VueRichTextShape } from '@/editor/vueRichTextShape'
import { editRichTextShape } from '@/editor/richTextEditorDialog'
import { sanitizeRichText } from '@/editor/richTextContent'
import type { VueShapeNodeProps } from './types'
import { useVueShapeTheme } from './useVueShapeTheme'

const props = defineProps<VueShapeNodeProps<VueRichTextShape>>()
const { getThemeColor, theme } = useVueShapeTheme(props.editor, `rich text shape:${props.shape.id}`)
const safeContent = computed(() => sanitizeRichText(props.shape.props.content))

function getTextContentStyle() {
	const fontSize = Number(props.shape.props.fontSize)
	return {
		fontFamily: 'sans-serif',
		fontSize: `${Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 14}px`,
		lineHeight: `${theme.value.lineHeight}`,
	}
}

function getTextLayoutStyle() {
	const justifyContent = props.shape.props.justifyContent ?? 'start'
	const alignItems = props.shape.props.alignItems ?? 'start'
	return {
		justifyContent: toFlexAlignment(justifyContent),
		alignItems: toFlexAlignment(alignItems),
		textAlign: toTextAlignment(justifyContent),
	}
}

function toFlexAlignment(value: 'start' | 'center' | 'end'): 'flex-start' | 'center' | 'flex-end' {
	return value === 'start' ? 'flex-start' : value === 'end' ? 'flex-end' : 'center'
}

function toTextAlignment(value: 'start' | 'center' | 'end'): 'left' | 'center' | 'right' {
	return value === 'start' ? 'left' : value === 'end' ? 'right' : 'center'
}

function onTextPointerDown(event: PointerEvent) {
	if (props.selected) event.stopPropagation()
}

function onTextDoubleClick(event: MouseEvent) {
	event.stopPropagation()
	event.preventDefault()
	void editRichTextShape(props.editor, props.shape.id)
}
const showBorder = computed(() => {
	const { showBorder, borderLeft, borderRight, borderTop, borderBottom } = props.shape.props
	return Boolean(showBorder || borderLeft || borderRight || borderTop || borderBottom)
})
const borderStyle = computed(() => {
	const { borderLeft, borderRight, borderTop, borderBottom } = props.shape.props
	if (!borderLeft && !borderRight && !borderTop && !borderBottom) return {}
	return {
		borderLeft: borderLeft ? undefined : 'none',
		borderRight: borderRight ? undefined : 'none',
		borderTop: borderTop ? undefined : 'none',
		borderBottom: borderBottom ? undefined : 'none',
	}
})
</script>

<template>
	<div
		class="vue-rich-text-shape"
		:class="{ 'is-selected': selected, 'has-visible-border': showBorder }"
		:data-shape-id="shape.id"
		:style="{
			width: `${shape.props.w}px`,
			height: `${shape.props.h}px`,
			transform: pageTransform,
			color: getThemeColor(shape.props.color, 'solid'),
			opacity: shape.opacity,
			'--inverse-zoom': String(1 / zoom),
			...getTextContentStyle(),
			...getTextLayoutStyle(),
			paddingTop: `${shape.props.paddingTop}px`,
			paddingRight: `${shape.props.paddingRight}px`,
			paddingBottom: `${shape.props.paddingBottom}px`,
			paddingLeft: `${shape.props.paddingLeft}px`,
			...borderStyle,
		}"
	>
		<div
			class="vue-rich-text-content"
			@pointerdown="onTextPointerDown"
			@dblclick="onTextDoubleClick"
			v-html="safeContent"
		/>
	</div>
</template>
