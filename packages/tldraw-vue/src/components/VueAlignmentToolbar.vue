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

type BorderOperation = 'borderLeft' | 'borderRight' | 'borderTop' | 'borderBottom'
type EditorShape = NonNullable<ReturnType<Editor['getShape']>>

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

const borderActions = [
	{ id: 'borderLeft', label: '显示/隐藏左边框' },
	{ id: 'borderRight', label: '显示/隐藏右边框' },
	{ id: 'borderTop', label: '显示/隐藏上边框' },
	{ id: 'borderBottom', label: '显示/隐藏下边框' },
] as const

const selectedShapeIds = useEditorValue('alignment toolbar selected shape ids', () =>
	props.editor.getSelectedShapes().map((shape) => {
		const shapeProps = shape.props as Record<string, unknown>
		return [
			shape.id,
			shape.type,
			shapeProps.borderLeft,
			shapeProps.borderRight,
			shapeProps.borderTop,
			shapeProps.borderBottom,
		]
	}),
)

const canAlign = computed(() => {
	selectedShapeIds.value
	const ids = getUnlockedSelectedShapeIds(props.editor)
	if (ids.length >= 2) return true
	if (ids.length !== 1) return false
	return props.editor.getShape(ids[0])?.type === 'vue-text'
})

const canToggleBorder = computed(() => {
	selectedShapeIds.value
	return getUnlockedSelectedShapeIds(props.editor)
		.some((id) => isBorderCapableShape(props.editor.getShape(id)))
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

function isBorderCapableShape(shape: EditorShape | undefined): shape is EditorShape {
	return Boolean(shape?.type.startsWith('vue-'))
}

function isBorderActive(operation: BorderOperation) {
	selectedShapeIds.value
	const shapes = getUnlockedSelectedShapeIds(props.editor)
		.map((id) => props.editor.getShape(id))
		.filter(isBorderCapableShape)
	return shapes.length > 0 && shapes.every((shape) => Boolean((shape.props as Record<string, unknown>)[operation]))
}

function toggleBorder(operation: BorderOperation) {
	const shapes = getUnlockedSelectedShapeIds(props.editor)
		.map((id) => props.editor.getShape(id))
		.filter(isBorderCapableShape)
	if (!shapes.length) return

	const nextValue = !shapes.every((shape) => Boolean((shape.props as Record<string, unknown>)[operation]))
	props.editor.markHistoryStoppingPoint(`toggle ${operation}`)
	props.editor.updateShapes(shapes.map((shape) => ({
		id: shape.id,
		type: shape.type,
		props: { [operation]: nextValue },
	})) as never)
}
</script>

<template>
	<div
		class="alignment-toolbar"
		aria-label="节点属性工具栏"
		@pointerdown.stop
		@pointermove.stop
		@pointerup.stop
		@wheel.stop
		@contextmenu.prevent.stop
	>
		<div class="alignment-toolbar__group" aria-label="节点对齐">
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
		<span class="alignment-toolbar__divider" aria-hidden="true" />
		<div class="alignment-toolbar__group alignment-toolbar__group--borders" aria-label="节点边框">
			<button
				v-for="action in borderActions"
				:key="action.id"
				type="button"
				class="alignment-toolbar__button"
				:class="{ 'is-active': isBorderActive(action.id) }"
				:aria-label="action.label"
				:title="action.label"
				:aria-pressed="isBorderActive(action.id)"
				:disabled="!canToggleBorder"
				@click="toggleBorder(action.id)"
			>
				<span
					class="alignment-toolbar__border-icon"
					:class="`alignment-toolbar__border-icon--${action.id.replace('border', '').toLowerCase()}`"
					aria-hidden="true"
				/>
			</button>
		</div>
	</div>
</template>
