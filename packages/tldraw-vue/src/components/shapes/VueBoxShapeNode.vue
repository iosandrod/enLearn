<script setup lang="ts">
import { computed } from 'vue'
import { getVueBoxMarkSegments, getVueBoxPath } from '@/editor/vueBoxGeometry'
import type { VueBoxShape } from '@/editor/vueBoxShape'
import type { VueShapeNodeProps } from './types'
import { useVueShapeTheme } from './useVueShapeTheme'

const props = defineProps<VueShapeNodeProps<VueBoxShape>>()

const {
	getDashArray,
	getFillColor,
	getStrokeWidth,
	getThemeColor,
} = useVueShapeTheme(props.editor, `box shape:${props.shape.id}`)

const strokeWidth = computed(() => getStrokeWidth(props.shape.props.size))
const strokeColor = computed(() => getThemeColor(props.shape.props.color, 'solid'))
const markColor = computed(() => props.shape.props.fill === 'solid' ? '#ffffff' : strokeColor.value)
const patternId = computed(() => `vue-box-pattern-${props.shape.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`)
const fillValue = computed(() =>
	props.shape.props.fill === 'pattern'
		? `url(#${patternId.value})`
		: getFillColor(props.shape.props.color, props.shape.props.fill)
)
const shapePath = computed(() => getVueBoxPath(props.shape.props.geo, props.shape.props.w, props.shape.props.h))
const markSegments = computed(() => getVueBoxMarkSegments(
	props.shape.props.geo,
	props.shape.props.w,
	props.shape.props.h
))
</script>

<template>
	<div
		class="vue-shape vue-box-shape"
		:class="{ 'is-selected': selected }"
		:data-geo="shape.props.geo"
		:style="{
			width: `${shape.props.w}px`,
			height: `${shape.props.h}px`,
			transform: pageTransform,
			opacity: shape.opacity,
			'--inverse-zoom': String(1 / zoom),
		}"
	>
		<svg
			class="vue-box-shape__svg"
			:viewBox="`0 0 ${shape.props.w} ${shape.props.h}`"
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			<defs v-if="shape.props.fill === 'pattern'">
				<pattern :id="patternId" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
					<rect width="12" height="12" :fill="getThemeColor(shape.props.color, 'semi')" />
					<rect x="6" width="1" height="12" :fill="getThemeColor(shape.props.color, 'pattern')" />
				</pattern>
			</defs>
			<path
				class="vue-box-shape__surface"
				:d="shapePath"
				:fill="fillValue"
				:stroke="strokeColor"
				:stroke-width="strokeWidth"
				:stroke-dasharray="getDashArray(shape.props.dash, strokeWidth)"
			/>
			<line
				v-for="(segment, index) in markSegments"
				:key="index"
				class="vue-box-shape__mark"
				:x1="segment.x1"
				:y1="segment.y1"
				:x2="segment.x2"
				:y2="segment.y2"
				:stroke="markColor"
				:stroke-width="Math.max(2.5, strokeWidth * 1.5)"
			/>
		</svg>
	</div>
</template>
