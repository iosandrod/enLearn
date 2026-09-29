<script setup lang="ts">
import { Mat, type Editor, type TLShape } from '@tldraw/editor'
import { computed } from 'vue'
import { getVueShapeComponent } from './shapes/shapeComponentRegistry'
import { useEditorValue } from '@/vue/useEditorValue'
import { isVueMaterialSectionShape, isVueMaterialSectionVisible } from '@/editor/extensions/material/vueMaterialShape'

const props = defineProps<{
	editor: Editor
	shape: TLShape
	selected: boolean
	zoom: number
}>()

const pageTransform = useEditorValue(`shape page transform:${props.shape.id}`, () =>
	Mat.toCssString(props.editor.getShapePageTransform(props.shape))
)
const shapeComponent = computed(() => getVueShapeComponent(props.shape.type))
const isVisible = computed(() => {
	let current: TLShape | undefined = props.shape
	while (current && current.parentId !== props.editor.getCurrentPageId()) {
		if (isVueMaterialSectionShape(current) && !isVueMaterialSectionVisible(props.editor, current)) {
			return false
		}
		current = props.editor.getShape(current.parentId)
	}
	return true
})
</script>

<template>
	<component
		:is="shapeComponent"
		v-if="shapeComponent"
		v-show="isVisible"
		:data-shape-id="shape.id"
		:data-presentation-target="shape.id"
		:editor="editor"
		:shape="shape"
		:selected="selected"
		:zoom="zoom"
		:page-transform="pageTransform"
	/>
</template>
