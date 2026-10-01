<script setup lang="ts">
import { Box, type Editor, type TLPageId } from '@tldraw/editor'
import Reveal, { type RevealApi, type TransitionStyle } from 'reveal.js'
import 'reveal.js/reveal.css'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
	PresentationAnimationController,
	type PresentationConfig,
	type PresentationPageTransition,
} from '@/presentation'
import { DEFAULT_PX_PER_MM } from '@/editor/interactions/WorkspaceBoundsManager'

interface RevealSlideModel {
	id: TLPageId
	index: number
	name: string
	previewUrl: string
	transition: TransitionStyle
	transitionDuration: number
	transitionEasing: string
}

const props = defineProps<{
	canvas?: { workspaceFitCanvas?: () => void } | null
	config?: PresentationConfig
	editor: Editor
	pageSizeMm?: { w: number; h: number }
	pxPerMm?: number
}>()
const emit = defineEmits<{ close: [] }>()

const deckRoot = ref<HTMLElement | null>(null)
const loading = ref(true)
const fullscreen = ref(false)
const pageIndex = ref(0)
const slides = ref<RevealSlideModel[]>([])
const slideFrameStyle = ref<Record<string, string>>({})
const animationController = new PresentationAnimationController(props.editor)
let deck: RevealApi | null = null
let destroyed = false
let playRevision = 0
let resizeObserver: ResizeObserver | null = null
let transitionFallbackTimer: ReturnType<typeof setTimeout> | null = null

const pageSize = computed(() => props.pageSizeMm ?? props.config?.pageSizeMm ?? { w: 200, h: 130 })
const pxPerMm = computed(() => props.pxPerMm ?? DEFAULT_PX_PER_MM)

function getTransition(pageId: string): PresentationPageTransition | undefined {
	return props.config?.pages?.[pageId]?.transition ?? props.config?.defaultTransition
}

function toRevealTransition(value: PresentationPageTransition | undefined): TransitionStyle {
	if (value?.type === 'fade') return 'fade'
	if (value?.type === 'slide') return 'slide'
	return 'none'
}

function getTransitionDuration(value: PresentationPageTransition | undefined) {
	if (value?.type === 'none') return 0
	const duration = value?.duration ?? 350
	return Math.max(0, Math.min(10000, Math.round(duration)))
}

function getTransitionEasing(value: PresentationPageTransition | undefined) {
	return value?.easing?.trim() || 'ease-out'
}

function nextFrame() {
	return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

async function createSlideModels() {
	const pages = props.editor.getPages()
	const originalPageId = props.editor.getCurrentPageId()
	const pageBounds = new Box(
		0,
		0,
		Math.max(1, pageSize.value.w * pxPerMm.value),
		Math.max(1, pageSize.value.h * pxPerMm.value)
	)
	const result: RevealSlideModel[] = []

	props.editor.complete()
	props.editor.setEditingShape(null)
	props.editor.selectNone()
	await nextTick()
	await nextFrame()
	animationController.restoreCurrentPageVisuals()
	for (const [index, page] of pages.entries()) {
		if (destroyed) break
		if (props.editor.getCurrentPageId() !== page.id) props.editor.setCurrentPage(page.id)
		await nextTick()
		await nextFrame()
		const shapeIds = props.editor.getCurrentPageShapeIdsSorted()
		let previewUrl = ''
		if (shapeIds.length) {
			try {
				previewUrl = (await props.editor.toImageDataUrl(shapeIds, {
					background: true,
					bounds: pageBounds,
					format: 'png',
					padding: 0,
					pixelRatio: 1.5,
				})).url
			} catch (error) {
				console.warn(`Unable to render presentation page ${page.id}`, error)
			}
		}
		const transition = getTransition(page.id)
		result.push({
			id: page.id,
			index,
			name: page.name || `Page ${index + 1}`,
			previewUrl,
			transition: toRevealTransition(transition),
			transitionDuration: getTransitionDuration(transition),
			transitionEasing: getTransitionEasing(transition),
		})
	}

	if (props.editor.getPage(originalPageId)) props.editor.setCurrentPage(originalPageId)
	if (destroyed) return
	slides.value = result
	pageIndex.value = Math.max(0, result.findIndex((page) => page.id === originalPageId))
	await nextTick()
}

function setPreviewVisibility(livePageId?: string) {
	const root = deckRoot.value
	if (!root) return
	for (const slide of root.querySelectorAll<HTMLElement>('.presentation-reveal-slide')) {
		slide.classList.toggle('is-live', slide.dataset.pageId === livePageId)
	}
}

function setTransitionVariables(index: number) {
	const root = deckRoot.value
	const page = slides.value[index]
	if (!root || !page) return
	root.style.setProperty('--presentation-transition-duration', `${page.transitionDuration}ms`)
	root.style.setProperty('--presentation-transition-easing', page.transitionEasing)
}

async function alignDeckToCanvas() {
	const root = deckRoot.value
	const shell = root?.closest<HTMLElement>('.app-shell')
	if (!root || !shell) return
	props.canvas?.workspaceFitCanvas?.()
	await nextTick()
	await nextFrame()
	const page = shell.querySelector<HTMLElement>('.workspace-page')
	if (!page) return
	const rootBounds = root.getBoundingClientRect()
	const pageBounds = page.getBoundingClientRect()
	slideFrameStyle.value = {
		left: `${pageBounds.left - rootBounds.left}px`,
		top: `${pageBounds.top - rootBounds.top}px`,
		width: `${pageBounds.width}px`,
		height: `${pageBounds.height}px`,
	}
	deck?.layout()
}

async function prepareLivePage(index: number) {
	const page = slides.value[index]
	if (!page) return false
	const revision = ++playRevision
	animationController.restoreCurrentPageVisuals()
	if (props.editor.getCurrentPageId() !== page.id) props.editor.setCurrentPage(page.id)
	pageIndex.value = index
	await alignDeckToCanvas()
	return !destroyed && revision === playRevision
}

async function activateLivePage(index: number, playAnimations = true) {
	const page = slides.value[index]
	if (!page || deck?.getIndices().h !== index || props.editor.getCurrentPageId() !== page.id) return
	const currentSlide = deckRoot.value?.querySelector<HTMLElement>(
		`.presentation-reveal-slide[data-page-id="${CSS.escape(page.id)}"]`
	)
	if (currentSlide?.classList.contains('is-live')) return
	setPreviewVisibility(page.id)
	if (playAnimations) await animationController.playCurrentPage({ includeClickAnimations: true })
}

function clearTransitionFallback() {
	if (transitionFallbackTimer) clearTimeout(transitionFallbackTimer)
	transitionFallbackTimer = null
}

function handleBeforeSlideChange(event: Event) {
	const revealEvent = event as Event & { indexh?: number }
	setTransitionVariables(revealEvent.indexh ?? deck?.getIndices().h ?? 0)
	clearTransitionFallback()
	playRevision++
	animationController.restoreCurrentPageVisuals()
	setPreviewVisibility()
}

function handleSlideChanged(event: Event) {
	const revealEvent = event as Event & { indexh?: number }
	const index = revealEvent.indexh ?? deck?.getIndices().h ?? 0
	void prepareLivePage(index).then((ready) => {
		if (!ready) return
		const duration = slides.value[index]?.transitionDuration ?? 0
		transitionFallbackTimer = setTimeout(() => {
			transitionFallbackTimer = null
			void activateLivePage(index)
		}, duration + 80)
	})
}

function handleSlideTransitionEnd(event: Event) {
	clearTransitionFallback()
	const revealEvent = event as Event & { indexh?: number }
	const index = revealEvent.indexh ?? deck?.getIndices().h ?? 0
	void activateLivePage(index)
}

function closePlayer() {
	if (document.fullscreenElement) void document.exitFullscreen()
	emit('close')
}

async function toggleFullscreen() {
	const shell = deckRoot.value?.closest<HTMLElement>('.app-shell')
	if (!document.fullscreenElement) await shell?.requestFullscreen?.()
	else await document.exitFullscreen?.()
}

function handleFullscreenChange() {
	fullscreen.value = Boolean(document.fullscreenElement)
	void alignDeckToCanvas()
}

async function initializeDeck() {
	await createSlideModels()
	if (destroyed || !deckRoot.value || !slides.value.length) return
	deck = new Reveal(deckRoot.value, {
		backgroundTransition: 'fade',
		center: false,
		controls: true,
		controlsLayout: 'edges',
		disableLayout: true,
		embedded: true,
		hash: false,
		history: false,
		keyboard: { 27: closePlayer },
		margin: 0,
		navigationMode: 'linear',
		overview: false,
		progress: true,
		slideNumber: 'c/t',
		touch: true,
		transition: toRevealTransition(props.config?.defaultTransition),
	})
	await deck.initialize()
	if (destroyed) return
	const initialIndex = pageIndex.value
	setTransitionVariables(initialIndex)
	deck.slide(initialIndex)
	const initialDuration = initialIndex === 0 ? 0 : slides.value[initialIndex]?.transitionDuration ?? 0
	if (initialDuration) {
		await new Promise<void>((resolve) => setTimeout(resolve, initialDuration + 80))
	}
	await prepareLivePage(initialIndex)
	loading.value = false
	void activateLivePage(initialIndex)
	deck.on('beforeslidechange', handleBeforeSlideChange)
	deck.on('slidechanged', handleSlideChanged)
	deck.on('slidetransitionend', handleSlideTransitionEnd)
	resizeObserver = new ResizeObserver(() => void alignDeckToCanvas())
	const shell = deckRoot.value.closest<HTMLElement>('.app-shell')
	if (shell) resizeObserver.observe(shell)
}

onMounted(() => {
	document.addEventListener('fullscreenchange', handleFullscreenChange)
	void initializeDeck()
})

onBeforeUnmount(() => {
	destroyed = true
	playRevision++
	clearTransitionFallback()
	resizeObserver?.disconnect()
	resizeObserver = null
	document.removeEventListener('fullscreenchange', handleFullscreenChange)
	animationController.restoreCurrentPageVisuals()
	deck?.off('beforeslidechange', handleBeforeSlideChange)
	deck?.off('slidechanged', handleSlideChanged)
	deck?.off('slidetransitionend', handleSlideTransitionEnd)
	deck?.destroy()
	deck = null
	if (document.fullscreenElement) void document.exitFullscreen()
})
</script>

<template>
	<section ref="deckRoot" class="presentation-preview reveal" role="dialog" aria-modal="true"
		aria-label="Reveal.js 演示播放器">
		<div v-if="loading" class="presentation-preview__loading" role="status">
			<i class="ri-loader-4-line" aria-hidden="true" />
			<span>正在生成演示文稿</span>
		</div>
		<div class="slides presentation-reveal-slides" :style="slideFrameStyle">
			<section v-for="page in slides" :key="page.id" class="presentation-reveal-slide"
				:data-page-id="page.id" :data-transition="page.transition"
				:aria-label="`${page.index + 1}. ${page.name}`">
				<div class="presentation-reveal-slide__surface">
					<img v-if="page.previewUrl" :src="page.previewUrl" :alt="page.name" draggable="false" />
				</div>
			</section>
		</div>
		<div class="presentation-preview__chrome">
			<button type="button" :title="fullscreen ? '退出全屏' : '全屏播放'"
				:aria-label="fullscreen ? '退出全屏' : '全屏播放'" @click="toggleFullscreen">
				<i :class="fullscreen ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line'" aria-hidden="true" />
			</button>
			<button type="button" title="退出播放" aria-label="退出播放" @click="closePlayer">
				<i class="ri-close-line" aria-hidden="true" />
			</button>
		</div>
	</section>
</template>
