<script setup lang="ts">
import type { VueLineShape } from '@/editor/vueDefaultShapes'
import type { VueShapeNodeProps } from './types'
import { useVueShapeTheme } from './useVueShapeTheme'

const props = defineProps<VueShapeNodeProps<VueLineShape>>()

const {
	getDashArray,
	getStrokeWidth,
	getThemeColor,
} = useVueShapeTheme(props.editor, `line shape:${props.shape.id}`)
</script>

<template>
	<div
		class="vue-line-shape"
		:class="{ 'is-selected': selected }"
		:style="{
			width: `${shape.props.w}px`,
			height: `${shape.props.h}px`,
			transform: pageTransform,
			opacity: shape.opacity,
			'--inverse-zoom': String(1 / zoom),
		}"
	>
		<svg class="vue-vector-shape" :viewBox="`0 0 ${shape.props.w} ${shape.props.h}`">
			<line
				:x1="shape.props.start.x"
				:y1="shape.props.start.y"
				:x2="shape.props.end.x"
				:y2="shape.props.end.y"
				:stroke="getThemeColor(shape.props.color, 'solid')"
				:stroke-width="getStrokeWidth(shape.props.size)"
				:stroke-dasharray="getDashArray(shape.props.dash, getStrokeWidth(shape.props.size))"
			/>
		</svg>
	</div>
</template>
