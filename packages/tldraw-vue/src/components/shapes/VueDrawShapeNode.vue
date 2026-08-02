<script setup lang="ts">
import type { VueDrawShape } from '@/editor/vueDefaultShapes'
import type { VueShapeNodeProps } from './types'
import { useVueShapeTheme } from './useVueShapeTheme'

const props = defineProps<VueShapeNodeProps<VueDrawShape>>()

const {
	getDashArray,
	getStrokeWidth,
	getThemeColor,
} = useVueShapeTheme(props.editor, `draw shape:${props.shape.id}`)

function getPointsAttribute(points: { x: number; y: number }[]) {
	return points.map((point) => `${point.x},${point.y}`).join(' ')
}
</script>

<template>
	<div
		class="vue-draw-shape"
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
			<polyline
				:points="getPointsAttribute(shape.props.points)"
				:stroke="getThemeColor(shape.props.color, 'solid')"
				:stroke-width="getStrokeWidth(shape.props.size)"
				:stroke-dasharray="getDashArray(shape.props.dash, getStrokeWidth(shape.props.size))"
			/>
		</svg>
	</div>
</template>
