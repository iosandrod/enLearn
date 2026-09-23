<script setup lang="ts">
import type { Editor } from '@tldraw/editor'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { PresentationAnimationController } from '@/presentation'

const props = defineProps<{ editor: Editor }>()
const emit = defineEmits<{ close: [] }>()
const controller = new PresentationAnimationController(props.editor)
const pages = computed(() => props.editor.getPages())
const pageIndex = ref(Math.max(0, pages.value.findIndex((page) => page.id === props.editor.getCurrentPageId())))
const playing = ref(false)
const fullscreen = ref(false)

async function play() {
	playing.value = true
	await controller.playCurrentPage({ includeClickAnimations: true })
	playing.value = false
}

async function goTo(index: number) {
	const nextIndex = Math.max(0, Math.min(pages.value.length - 1, index))
	if (!pages.value[nextIndex]) return
	controller.cancel()
	props.editor.setCurrentPage(pages.value[nextIndex].id)
	pageIndex.value = nextIndex
	await nextTick()
	await play()
}

async function toggleFullscreen() {
	const root = document.querySelector<HTMLElement>('.presentation-preview')
	if (!document.fullscreenElement) {
		await root?.requestFullscreen?.()
		fullscreen.value = true
	} else {
		await document.exitFullscreen?.()
		fullscreen.value = false
	}
}

function onKeyDown(event: KeyboardEvent) {
	if (event.key === 'Escape') {
		event.preventDefault()
		emit('close')
	} else if (event.key === 'ArrowRight') {
		event.preventDefault()
		void goTo(pageIndex.value + 1)
	} else if (event.key === 'ArrowLeft') {
		event.preventDefault()
		void goTo(pageIndex.value - 1)
	} else if (event.key === ' ' || event.key === 'Enter') {
		event.preventDefault()
		if (!playing.value) void play()
	}
}

onMounted(() => {
	document.addEventListener('keydown', onKeyDown)
	void play()
})

onBeforeUnmount(() => {
	controller.restoreCurrentPageVisuals()
	document.removeEventListener('keydown', onKeyDown)
	if (document.fullscreenElement) void document.exitFullscreen()
})
</script>

<template>
	<section class="presentation-preview" role="dialog" aria-modal="true" aria-label="演示预览">
		<div class="presentation-preview__toolbar">
			<strong>演示预览</strong>
			<span>{{ pageIndex + 1 }} / {{ pages.length }}</span>
			<div class="presentation-preview__actions">
				<button type="button" title="上一页" aria-label="上一页" :disabled="pageIndex === 0" @click="goTo(pageIndex - 1)">‹</button>
				<button type="button" title="播放" aria-label="播放" :disabled="playing" @click="play">{{ playing ? '播放中' : '播放' }}</button>
				<button type="button" title="下一页" aria-label="下一页" :disabled="pageIndex >= pages.length - 1" @click="goTo(pageIndex + 1)">›</button>
				<button type="button" title="全屏" aria-label="全屏" @click="toggleFullscreen">{{ fullscreen ? '退出全屏' : '全屏' }}</button>
				<button type="button" title="关闭预览" aria-label="关闭预览" @click="emit('close')">×</button>
			</div>
		</div>
		<div class="presentation-preview__hint">使用左右方向键切换页面，空格键重新播放</div>
	</section>
</template>
