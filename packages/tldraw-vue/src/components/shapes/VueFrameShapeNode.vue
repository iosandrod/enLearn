<script setup lang="ts">
import type { VueFrameShape } from '@/editor/extensions/frame/vueFrameShape'
import type { VueShapeNodeProps } from './types'
import { useVueShapeTheme,userShapeBorderStyle } from './useVueShapeTheme'
//
const props = defineProps<VueShapeNodeProps<VueFrameShape>>()
const borderStyle=userShapeBorderStyle(props.shape )//
</script>

<template>
	<div
		class="vue-frame-shape"
		:class="{ 'is-selected': selected, 'has-visible-border': shape.props.showBorder }"
		:data-shape-id="shape.id"
		:style="{
			width: `${shape.props.w}px`,
			height: `${shape.props.h}px`,
			borderRadius: `${shape.props.borderRadius}px`,
			transform: pageTransform,
			opacity: shape.opacity,
			...borderStyle,
			'--inverse-zoom': String(1 / zoom),
		}"
	>
		<div class="vue-frame-shape__label">{{ props.shape.props.name }}</div>
	</div>
</template>
