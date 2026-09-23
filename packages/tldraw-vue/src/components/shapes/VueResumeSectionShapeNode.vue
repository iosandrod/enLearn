<script setup lang="ts">
import type { VueResumeSectionShape } from '@/editor/extensions/resume/vueResumeShape'
import type { VueShapeNodeProps } from './types'
defineProps<VueShapeNodeProps<VueResumeSectionShape>>()
</script>

<template>
	<div class="vue-resume-section-shape" :class="[`vue-resume-section-shape--${shape.props.zone}`, { 'is-selected': selected }]" :data-shape-id="shape.id" :style="{ width: `${shape.props.w}px`, height: `${shape.props.h}px`, transform: pageTransform, opacity: shape.opacity, '--inverse-zoom': String(1 / zoom) }">
		<div class="vue-resume-section-label">{{ shape.props.label }}</div>
		<div v-if="shape.props.zone === 'content'" class="vue-resume-content-hint">拖入简历内容或绑定数据后自动分页</div>
	</div>
</template>
