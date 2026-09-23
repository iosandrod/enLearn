<script setup lang="ts">
import type { VueResumeShape } from '@/editor/extensions/resume/vueResumeShape'
import type { VueShapeNodeProps } from './types'
defineProps<VueShapeNodeProps<VueResumeShape>>()
</script>

<template>
	<div class="vue-resume-shape" :class="{ 'is-selected': selected }" :data-shape-id="shape.id" :style="{ width: `${shape.props.w}px`, height: `${shape.props.h}px`, transform: pageTransform, opacity: shape.opacity, '--inverse-zoom': String(1 / zoom) }" />
</template>
