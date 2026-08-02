<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { VueTextShape } from '@/editor/vueDefaultShapes'
import { measureVueTextShape } from '@/editor/interactions/vueTextSizing'
import { useEditorValue } from '@/vue/useEditorValue'
import type { VueShapeNodeProps } from './types'
import { useVueShapeTheme } from './useVueShapeTheme'

const props = defineProps<VueShapeNodeProps<VueTextShape>>()

const {
	getFontSize,
	getTextFontFamily,
	getThemeColor,
	theme,
} = useVueShapeTheme(props.editor, `text shape:${props.shape.id}`)
const editingShapeId = useEditorValue(`text shape editing:${props.shape.id}`, () =>
	props.editor.getEditingShapeId()
)
const isTextEditing = computed(() => editingShapeId.value === props.shape.id)
const textInput = ref<HTMLTextAreaElement | null>(null)

watch(isTextEditing, (isEditing) => {
	if (!isEditing) return
	void nextTick(() => {
		textInput.value?.focus()
		textInput.value?.select()
	})
})

function getTextContentStyle() {
	return {
		fontFamily: getTextFontFamily(props.shape.props.font),
		fontSize: `${getFontSize(props.shape.props.size)}px`,
		lineHeight: `${theme.value.lineHeight}`,
	}
}

function updateText(event: Event) {
	const target = event.target as HTMLTextAreaElement
	syncTextShape(target.value)
}

function onTextPointerDown(event: PointerEvent) {
	if (props.selected || isTextEditing.value) event.stopPropagation()
}

function onTextDoubleClick(event: MouseEvent) {
	event.stopPropagation()
	event.preventDefault()
	props.editor.markHistoryStoppingPoint('editing text')
	props.editor.select(props.shape.id)
	props.editor.setEditingShape(props.shape.id)
}

function onTextBlur() {
	if (isTextEditing.value) props.editor.setEditingShape(null)
}

function onTextKeyDown(event: KeyboardEvent) {
	if (event.key === 'Escape') {
		event.preventDefault()
		;(event.currentTarget as HTMLTextAreaElement).blur()
		props.editor.setEditingShape(null)
	}

	if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
		event.preventDefault()
		;(event.currentTarget as HTMLTextAreaElement).blur()
		props.editor.setEditingShape(null)
	}
}

function onTextPaste(event: ClipboardEvent) {
	if (!isTextEditing.value) return
	const textData = event.clipboardData?.getData('text/plain')
	if (!textData) return
	event.preventDefault()
	const target = event.target as HTMLTextAreaElement
	const selectionStart = target.selectionStart ?? target.value.length
	const selectionEnd = target.selectionEnd ?? target.value.length
	const nextValue =
		target.value.slice(0, selectionStart) +
		textData.replace(/\r\n?/g, '\n') +
		target.value.slice(selectionEnd)
	syncTextShape(nextValue)
}

function syncTextShape(rawText: string) {
	const nextText = rawText.replace(/\r\n?/g, '\n')
	const nextSize = measureVueTextShape(props.editor, nextText, {
		font: props.shape.props.font,
		size: props.shape.props.size,
		width: props.shape.props.w,
		autoSize: props.shape.props.autoSize ?? true,
	})

	props.editor.updateShape<VueTextShape>({
		id: props.shape.id,
		type: 'vue-text',
		props: {
			text: nextText,
			w: nextSize.w,
			h: nextSize.h,
		},
	})
}
</script>

<template>
	<div
		class="vue-text-shape"
		:class="{ 'is-selected': selected, 'has-visible-border': shape.props.showBorder }"
		:data-shape-id="shape.id"
		:style="{
			width: `${shape.props.w}px`,
			height: `${shape.props.h}px`,
			transform: pageTransform,
			color: getThemeColor(shape.props.color, 'solid'),
			opacity: shape.opacity,
			'--inverse-zoom': String(1 / zoom),
			...getTextContentStyle(),
		}"
	>
		<div
			v-if="!isTextEditing"
			class="vue-text-content"
			@pointerdown="onTextPointerDown"
			@dblclick="onTextDoubleClick"
		>
			{{ shape.props.text }}
		</div>
		<textarea
			v-else
			ref="textInput"
			class="vue-text-input"
			:value="shape.props.text"
			:style="getTextContentStyle()"
			spellcheck="false"
			@input="updateText"
			@pointerdown="onTextPointerDown"
			@blur="onTextBlur"
			@keydown.stop="onTextKeyDown"
			@paste="onTextPaste"
		/>
	</div>
</template>
