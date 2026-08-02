<script setup lang="ts">
import { create as createQrCode } from 'qrcode'
import { computed, nextTick, ref, watch } from 'vue'
import type { VueQrShape } from '@/editor/extensions/qr/vueQrShape'
import { useEditorValue } from '@/vue/useEditorValue'
import type { VueShapeNodeProps } from './types'
import { useVueShapeTheme } from './useVueShapeTheme'

const props = defineProps<VueShapeNodeProps<VueQrShape>>()

const { getThemeColor } = useVueShapeTheme(props.editor, `qr shape:${props.shape.id}`)
const editingShapeId = useEditorValue(`qr shape editing:${props.shape.id}`, () =>
	props.editor.getEditingShapeId()
)
const isQrEditing = computed(() => editingShapeId.value === props.shape.id)
const qrInput = ref<HTMLTextAreaElement | null>(null)

const qrCode = computed(() => {
	try {
		return createQrCode(props.shape.props.text.trim() || ' ', {
			errorCorrectionLevel: props.shape.props.errorCorrectionLevel,
		})
	} catch {
		return null
	}
})

const moduleCount = computed(() => qrCode.value?.modules.size ?? 0)
const qrViewBox = computed(() => {
	const size = moduleCount.value
	const margin = props.shape.props.margin
	return `${-margin} ${-margin} ${size + margin * 2} ${size + margin * 2}`
})
const qrModulePath = computed(() => {
	const code = qrCode.value
	if (!code) return ''

	const size = code.modules.size
	let path = ''
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			if (code.modules.get(y, x)) path += `M${x},${y}h1v1h-1z`
		}
	}
	return path
})
const qrForeground = computed(() => getThemeColor(props.shape.props.color, 'solid'))

watch(isQrEditing, (isEditing) => {
	if (!isEditing) return
	void nextTick(() => {
		qrInput.value?.focus()
		qrInput.value?.select()
	})
})

function onQrPointerDown(event: PointerEvent) {
	if (props.selected || isQrEditing.value) event.stopPropagation()
}

function onQrDoubleClick(event: MouseEvent) {
	event.stopPropagation()
	event.preventDefault()
	props.editor.markHistoryStoppingPoint('editing qr code')
	props.editor.select(props.shape.id)
	props.editor.setEditingShape(props.shape.id)
}

function updateQrText(event: Event) {
	const target = event.target as HTMLTextAreaElement
	props.editor.updateShape<VueQrShape>({
		id: props.shape.id,
		type: 'vue-qr',
		props: {
			text: target.value,
		},
	})
}

function finishEditing() {
	if (isQrEditing.value) props.editor.setEditingShape(null)
}

function onQrKeyDown(event: KeyboardEvent) {
	if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key === 'Enter')) {
		event.preventDefault()
		;(event.currentTarget as HTMLTextAreaElement).blur()
		finishEditing()
	}
}
</script>

<template>
	<div
		class="vue-qr-shape"
		:class="{ 'is-selected': selected, 'has-visible-border': shape.props.showBorder }"
		:data-shape-id="shape.id"
		:style="{
			width: `${shape.props.w}px`,
			height: `${shape.props.h}px`,
			transform: pageTransform,
			opacity: shape.opacity,
			'--inverse-zoom': String(1 / zoom),
			'--qr-background': shape.props.background,
		}"
		@pointerdown="onQrPointerDown"
		@dblclick="onQrDoubleClick"
	>
		<div class="vue-qr-surface">
			<svg
				v-if="qrCode"
				class="vue-qr-svg"
				:viewBox="qrViewBox"
				role="img"
				:aria-label="`QR code for ${shape.props.text}`"
				shape-rendering="crispEdges"
			>
				<rect
					:x="-shape.props.margin"
					:y="-shape.props.margin"
					:width="moduleCount + shape.props.margin * 2"
					:height="moduleCount + shape.props.margin * 2"
					:fill="shape.props.background"
				/>
				<path :d="qrModulePath" :fill="qrForeground" />
			</svg>
			<div v-else class="vue-qr-error">Invalid QR</div>

			<textarea
				v-if="isQrEditing"
				ref="qrInput"
				class="vue-qr-input"
				:value="shape.props.text"
				spellcheck="false"
				@input="updateQrText"
				@blur="finishEditing"
				@keydown.stop="onQrKeyDown"
				@pointerdown.stop
			/>
		</div>
	</div>
</template>
