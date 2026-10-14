<script setup lang="ts">
import { Mat, type Editor, type TLShape } from '@tldraw/editor'
import { computed } from 'vue'
import { getVueShapeComponent } from './shapes/shapeComponentRegistry'
import { useEditorValue } from '@/vue/useEditorValue'
import { isVueMaterialShapeVisible } from '@/editor/extensions/material/vueMaterialShape'

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
const isVisible = useEditorValue(`shape visibility:${props.shape.id}`, () =>
	isVueMaterialShapeVisible(props.editor, props.shape.id)
)
</script>

<template>
	<component
		:is="shapeComponent"
		v-if="shapeComponent && isVisible"
		:data-shape-id="shape.id"
		:data-presentation-target="shape.id"
		:editor="editor"
		:shape="shape"
		:selected="selected"
		:zoom="zoom"
		:page-transform="pageTransform"
	/>
</template>
