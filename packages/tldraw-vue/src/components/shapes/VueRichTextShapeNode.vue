<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { VueRichTextShape } from '@/editor/vueRichTextShape'
import type { VueShapeNodeProps } from './types'
import VueRichTextEditorDialog from '../VueRichTextEditorDialog.vue'

const props = defineProps<VueShapeNodeProps<VueRichTextShape>>()
const dialogOpen = ref(false)
const showBorder = computed(() => props.shape.props.showBorder === true || Boolean(props.shape.props.borderLeft || props.shape.props.borderRight || props.shape.props.borderTop || props.shape.props.borderBottom))
const safeContent = computed(() => sanitizeRichText(props.shape.props.content))
function openEditor(event?: Event) { event?.stopPropagation(); dialogOpen.value = true }
function save(content: string) { props.editor.updateShape<VueRichTextShape>({ id: props.shape.id, type: 'vue-rich-text', props: { content } }) }
function onOpenRequested(event: Event) {
	const shapeId = (event as CustomEvent<{ shapeId?: string }>).detail?.shapeId
	if (shapeId === props.shape.id) dialogOpen.value = true
}
function sanitizeRichText(value: string) {
	if (typeof DOMParser === 'undefined') return value.replace(/<\/?(?:script|style|iframe|object|embed)[^>]*>/gi, '')
	const document = new DOMParser().parseFromString(String(value ?? ''), 'text/html')
	document.querySelectorAll('script,style,iframe,object,embed,form').forEach((node) => node.remove())
	document.querySelectorAll('*').forEach((node) => {
		for (const attribute of [...node.attributes]) {
			if (attribute.name.toLowerCase().startsWith('on')) node.removeAttribute(attribute.name)
			if ((attribute.name === 'href' || attribute.name === 'src') && /^\s*javascript:/i.test(attribute.value)) node.removeAttribute(attribute.name)
		}
	})
	return document.body.innerHTML
}
onMounted(() => window.addEventListener('enlearn:open-rich-text-editor', onOpenRequested))
onBeforeUnmount(() => window.removeEventListener('enlearn:open-rich-text-editor', onOpenRequested))
</script>

<template>
	<div class="vue-rich-text-shape" :class="{ 'has-visible-border': showBorder }" :data-shape-id="shape.id" :style="{ width: `${shape.props.w}px`, height: `${shape.props.h}px`, transform: pageTransform, color: shape.props.color, fontSize: `${shape.props.fontSize}px`, opacity: shape.opacity, paddingTop: `${shape.props.paddingTop}px`, paddingRight: `${shape.props.paddingRight}px`, paddingBottom: `${shape.props.paddingBottom}px`, paddingLeft: `${shape.props.paddingLeft}px` }">
		<div class="vue-rich-text-content" v-html="safeContent" @dblclick="openEditor" @pointerdown="(event) => { if (selected || dialogOpen) event.stopPropagation() }" />
		<button v-if="selected" class="vue-rich-text-edit-button" type="button" title="编辑富文本" @click="openEditor">编辑</button>
		<VueRichTextEditorDialog v-model="dialogOpen" :content="shape.props.content" @save="save" />
	</div>
</template>
