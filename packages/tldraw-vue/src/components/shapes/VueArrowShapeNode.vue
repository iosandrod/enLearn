<script setup lang="ts">
import type { VueArrowShape } from '@/editor/vueDefaultShapes'
import type { VueShapeNodeProps } from './types'
import { useVueShapeTheme } from './useVueShapeTheme'

const props = defineProps<VueShapeNodeProps<VueArrowShape>>()

const {
	getDashArray,
	getStrokeWidth,
	getThemeColor,
} = useVueShapeTheme(props.editor, `arrow shape:${props.shape.id}`)

function getArrowMarkerId(id: string) {
	return `vue-arrow-head-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}
</script>

<template>
	<div
		class="vue-line-shape vue-arrow-shape"
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
			<defs>
				<marker
					:id="getArrowMarkerId(shape.id)"
					markerWidth="8"
					markerHeight="8"
					refX="6"
					refY="4"
					orient="auto"
					markerUnits="strokeWidth"
				>
					<path d="M0,0 L8,4 L0,8 Z" :fill="getThemeColor(shape.props.color, 'solid')" />
				</marker>
			</defs>
			<line
				:x1="shape.props.start.x"
				:y1="shape.props.start.y"
				:x2="shape.props.end.x"
				:y2="shape.props.end.y"
				:stroke="getThemeColor(shape.props.color, 'solid')"
				:stroke-width="getStrokeWidth(shape.props.size)"
				:stroke-dasharray="getDashArray(shape.props.dash, getStrokeWidth(shape.props.size))"
				:marker-end="`url(#${getArrowMarkerId(shape.id)})`"
			/>
		</svg>
	</div>
</template>
