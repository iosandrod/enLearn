<script setup lang="ts">
import { Mat, type Editor, type TLShape } from '@tldraw/editor'
import { computed } from 'vue'
import { getVueShapeComponent } from './shapes/shapeComponentRegistry'
import { useEditorValue } from '@/vue/useEditorValue'

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
</script>

<template>
	<component
		:is="shapeComponent"
		v-if="shapeComponent"
		:editor="editor"
		:shape="shape"
		:selected="selected"
		:zoom="zoom"
		:page-transform="pageTransform"
	/>
</template>
