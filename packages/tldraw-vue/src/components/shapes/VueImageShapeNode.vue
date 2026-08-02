<script setup lang="ts">
import { computed } from 'vue'
import type { TLImageAsset } from '@tldraw/tlschema'
import type { VueImageShape } from '@/editor/vueDefaultShapes'
import type { VueShapeNodeProps } from './types'

const props = defineProps<VueShapeNodeProps<VueImageShape>>()

const imageAsset = computed(() => {
	if (!props.shape.props.assetId) return null
	return props.editor.getAsset<TLImageAsset>(props.shape.props.assetId) ?? null
})
const imageSrc = computed(() => imageAsset.value?.props.src ?? props.shape.props.src ?? '')
const imageAlt = computed(() => imageAsset.value?.props.name ?? props.shape.props.name ?? 'Image')
</script>

<template>
	<div
		class="vue-image-shape"
		:class="{ 'is-selected': selected, 'has-visible-border': shape.props.showBorder }"
		:style="{
			width: `${shape.props.w}px`,
			height: `${shape.props.h}px`,
			transform: pageTransform,
			opacity: shape.opacity,
			'--inverse-zoom': String(1 / zoom),
		}"
	>
		<img v-if="imageSrc" :src="imageSrc" :alt="imageAlt" draggable="false" />
		<div v-else class="vue-image-placeholder">
			<span class="vue-image-placeholder__icon">IMG</span>
		</div>
	</div>
</template>
