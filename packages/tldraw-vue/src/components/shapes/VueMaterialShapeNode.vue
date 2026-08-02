<script setup lang="ts">
import type { VueMaterialShape } from '@/editor/extensions/material/vueMaterialShape'
import type { VueShapeNodeProps } from './types'

defineProps<VueShapeNodeProps<VueMaterialShape>>()
</script>

<template>
	<div
		class="vue-material-shape"
		:class="{ 'is-selected': selected }"
		:data-shape-id="shape.id"
		:style="{
			width: `${shape.props.w}px`,
			height: `${shape.props.h}px`,
			transform: pageTransform,
			opacity: shape.opacity,
			'--inverse-zoom': String(1 / zoom),
		}"
	/>
</template>
