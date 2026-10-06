<script setup lang="ts">
import type { Editor } from '@tldraw/editor'
import { computed } from 'vue'
import { getUnlockedSelectedShapeIds } from '@/editor/interactions/selectionActions'
import { useEditorValue } from '@/vue/useEditorValue'

type AlignmentOperation =
	| 'left'
	| 'center-horizontal'
	| 'right'
	| 'top'
	| 'center-vertical'
	| 'bottom'

const props = defineProps<{
	editor: Editor
}>()

const actions = [
	{ id: 'left', label: '水平布局左', icon: 'ri-align-item-left-line' },
	{ id: 'center-horizontal', label: '水平布局中', icon: 'ri-align-item-horizontal-center-line' },
	{ id: 'right', label: '水平布局右', icon: 'ri-align-item-right-line' },
	{ id: 'top', label: '垂直布局上', icon: 'ri-align-item-top-line' },
	{ id: 'center-vertical', label: '垂直布局中', icon: 'ri-align-item-vertical-center-line' },
	{ id: 'bottom', label: '垂直布局下', icon: 'ri-align-item-bottom-line' },
] as const

const selectedShapeIds = useEditorValue('alignment toolbar selected shape ids', () =>
	props.editor.getSelectedShapeIds(),
)

const canAlign = computed(() => {
	selectedShapeIds.value
	const ids = getUnlockedSelectedShapeIds(props.editor)
	if (ids.length >= 2) return true
	if (ids.length !== 1) return false
	return props.editor.getShape(ids[0])?.type === 'vue-text'
})

function align(operation: AlignmentOperation) {
	const ids = getUnlockedSelectedShapeIds(props.editor)
	if (ids.length === 1) {
		const shape = props.editor.getShape(ids[0])
		if (shape?.type !== 'vue-text') return

		const isHorizontal = operation === 'left' || operation === 'center-horizontal' || operation === 'right'
		const value = operation === 'left' || operation === 'top'
			? 'start'
			: operation === 'right' || operation === 'bottom'
				? 'end'
				: 'center'
		props.editor.markHistoryStoppingPoint('set text alignment')
		props.editor.updateShapes([{
			id: shape.id,
			type: shape.type,
			props: isHorizontal ? { justifyContent: value } : { alignItems: value },
		}] as never)
		return
	}
	if (ids.length < 2) return
	props.editor.markHistoryStoppingPoint('align selected shapes')
	props.editor.alignShapes(ids, operation)
}
</script>

<template>
	<div
		class="alignment-toolbar"
		aria-label="节点对齐"
		@pointerdown.stop
		@pointermove.stop
		@pointerup.stop
		@wheel.stop
		@contextmenu.prevent.stop
	>
		<button
			v-for="action in actions"
			:key="action.id"
			type="button"
			class="alignment-toolbar__button"
			:aria-label="action.label"
			:title="action.label"
			:disabled="!canAlign"
			@click="align(action.id)"
		>
			<i :class="action.icon" aria-hidden="true" />
		</button>
	</div>
</template>
