<script setup lang="ts">
import type { VueBoxShape } from '@/editor/vueBoxShape'
import type { VueShapeNodeProps } from './types'
import { useVueShapeTheme } from './useVueShapeTheme'

const props = defineProps<VueShapeNodeProps<VueBoxShape>>()

const {
	getBorderStyle,
	getFillColor,
	getFillImage,
	getStrokeWidth,
	getThemeColor,
} = useVueShapeTheme(props.editor, `box shape:${props.shape.id}`)
</script>

<template>
	<div
		class="vue-shape"
		:class="[{ 'is-selected': selected }, `vue-shape--${shape.props.geo}`]"
		:style="{
			width: `${shape.props.w}px`,
			height: `${shape.props.h}px`,
			transform: pageTransform,
			backgroundColor: getFillColor(shape.props.color, shape.props.fill),
			backgroundImage: getFillImage(shape.props.color, shape.props.fill),
			borderColor: getThemeColor(shape.props.color, 'solid'),
			borderStyle: getBorderStyle(shape.props.dash),
			borderWidth: `${Math.max(1, getStrokeWidth(shape.props.size)) * (1 / zoom)}px`,
			color: shape.props.fill === 'solid' ? '#ffffff' : getThemeColor(shape.props.color, 'solid'),
			opacity: shape.opacity,
			'--inverse-zoom': String(1 / zoom),
		}"
	>
		<div class="vue-shape__label">Vue shape</div>
	</div>
</template>
