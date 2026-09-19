<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { createBarcodeSvgDataUrl } from '@/editor/extensions/barcode/barcodeSvg'
import type { VueBarcodeShape } from '@/editor/extensions/barcode/vueBarcodeShape'
import { useEditorValue } from '@/vue/useEditorValue'
import type { VueShapeNodeProps } from './types'

const props = defineProps<VueShapeNodeProps<VueBarcodeShape>>()
const editingShapeId = useEditorValue(`barcode shape editing:${props.shape.id}`, () =>
	props.editor.getEditingShapeId()
)
const isEditing = computed(() => editingShapeId.value === props.shape.id)
const barcodeInput = ref<HTMLTextAreaElement | null>(null)
const barcodeSource = computed(() => {
	try {
		return createBarcodeSvgDataUrl(props.shape.props)
	} catch {
		return ''
	}
})

watch(isEditing, (editing) => {
	if (!editing) return
	void nextTick(() => {
		barcodeInput.value?.focus()
		barcodeInput.value?.select()
	})
})

function onDoubleClick(event: MouseEvent) {
	event.stopPropagation()
	event.preventDefault()
	props.editor.markHistoryStoppingPoint('editing barcode')
	props.editor.select(props.shape.id)
	props.editor.setEditingShape(props.shape.id)
}

function updateText(event: Event) {
	props.editor.updateShape<VueBarcodeShape>({
		id: props.shape.id,
		type: 'vue-barcode',
		props: { text: (event.target as HTMLTextAreaElement).value },
	})
}

function finishEditing() {
	if (isEditing.value) props.editor.setEditingShape(null)
}

function onKeyDown(event: KeyboardEvent) {
	if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key === 'Enter')) {
		event.preventDefault()
		;(event.currentTarget as HTMLTextAreaElement).blur()
		finishEditing()
	}
}
</script>

<template>
	<div
		class="vue-barcode-shape"
		:class="{ 'is-selected': selected, 'has-visible-border': shape.props.showBorder }"
		:data-shape-id="shape.id"
		:style="{
			width: `${shape.props.w}px`,
			height: `${shape.props.h}px`,
			transform: pageTransform,
			opacity: shape.opacity,
			'--inverse-zoom': String(1 / zoom),
			'--barcode-background': shape.props.background,
		}"
		@pointerdown="(selected || isEditing) && $event.stopPropagation()"
		@dblclick="onDoubleClick"
	>
		<img v-if="barcodeSource" class="vue-barcode-image" :src="barcodeSource" alt="条形码" />
		<div v-else class="vue-barcode-error">条形码内容无效</div>
		<textarea
			v-if="isEditing"
			ref="barcodeInput"
			class="vue-barcode-input"
			:value="shape.props.text"
			spellcheck="false"
			@input="updateText"
			@blur="finishEditing"
			@keydown.stop="onKeyDown"
			@pointerdown.stop
		/>
	</div>
</template>
