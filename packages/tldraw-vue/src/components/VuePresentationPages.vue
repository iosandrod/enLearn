<script setup lang="ts">
import { PageRecordType, type Editor, type TLPageId } from '@tldraw/editor'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEditorValue } from '@/vue/useEditorValue'

const props = withDefaults(
	defineProps<{
		editor: Editor
		pageSizeMm?: { w: number; h: number }
		pxPerMm?: number
	}>(),
	{
		pageSizeMm: () => ({ w: 338.7, h: 190.5 }),
		pxPerMm: 10,
	}
)

const pages = useEditorValue('presentation page thumbnails pages', () => props.editor.getPages())
const currentPageId = useEditorValue(
	'presentation page thumbnails current page',
	() => props.editor.getCurrentPageId()
)
const thumbnailCanvasRefs = new Map<string, HTMLCanvasElement>()
let refreshTimer: ReturnType<typeof setTimeout> | undefined
let stopDocumentListener: (() => void) | null = null

const pageCards = computed(() =>
	pages.value.map((page, index) => ({
		...page,
		index,
		isCurrent: page.id === currentPageId.value,
	}))
)

function scheduleRefresh(delay = 180) {
	if (refreshTimer) clearTimeout(refreshTimer)
	refreshTimer = setTimeout(() => {
		refreshTimer = undefined
		void refreshThumbnails()
	}, delay)
}

function setThumbnailCanvas(pageId: string, element: Element | null) {
	if (element instanceof HTMLCanvasElement) thumbnailCanvasRefs.set(pageId, element)
	else thumbnailCanvasRefs.delete(pageId)
}

function drawPageThumbnail(pageId: TLPageId, canvas: HTMLCanvasElement) {
	const pageWidth = Math.max(1, props.pageSizeMm.w * props.pxPerMm)
	const pageHeight = Math.max(1, props.pageSizeMm.h * props.pxPerMm)
	const logicalWidth = 320
	const logicalHeight = Math.max(1, Math.round(logicalWidth * (pageHeight / pageWidth)))
	const dpr = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2)

	canvas.width = Math.round(logicalWidth * dpr)
	canvas.height = Math.round(logicalHeight * dpr)

	const ctx = canvas.getContext('2d')
	if (!ctx) return
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	ctx.clearRect(0, 0, logicalWidth, logicalHeight)
	ctx.fillStyle = '#d8dcdf'
	ctx.fillRect(0, 0, logicalWidth, logicalHeight)
	ctx.save()
	ctx.scale(logicalWidth / pageWidth, logicalHeight / pageHeight)
	ctx.fillStyle = '#ffffff'
	ctx.fillRect(0, 0, pageWidth, pageHeight)
	ctx.strokeStyle = '#cbd5e1'
	ctx.lineWidth = Math.max(1 / dpr, pageWidth / logicalWidth)
	ctx.strokeRect(0, 0, pageWidth, pageHeight)

	const selectedIds = new Set(props.editor.getSelectedShapeIds())
	for (const shapeId of props.editor.getPageShapeIds(pageId)) {
		const shape = props.editor.getShape(shapeId)
		if (!shape) continue
		const util = props.editor.getShapeUtil(shape)
		if (util.hideInMinimap?.(shape)) continue
		const bounds = props.editor.getShapeMaskedPageBounds(shapeId)
		if (!bounds) continue
		ctx.fillStyle = selectedIds.has(shapeId) ? '#2563eb' : '#646a70'
		ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h)
	}
	ctx.restore()
}

async function refreshThumbnails() {
	await nextTick()
	for (const page of pages.value) {
		const canvas = thumbnailCanvasRefs.get(page.id)
		if (canvas) drawPageThumbnail(page.id, canvas)
	}
}

function selectPage(id: TLPageId) {
	if (id === currentPageId.value) return
	props.editor.setCurrentPage(id)
}

function createPage() {
	if (pages.value.length >= props.editor.options.maxPages) return

	const id = PageRecordType.createId()
	props.editor.markHistoryStoppingPoint('creating presentation page')
	props.editor.createPage({
		id,
		name: `Page ${pages.value.length + 1}`,
	})
	props.editor.setCurrentPage(id)
	scheduleRefresh(80)
}

function onDocumentChange() {
	scheduleRefresh()
}

watch(pages, () => scheduleRefresh(80))
watch(
	() => [props.pageSizeMm.w, props.pageSizeMm.h, props.pxPerMm],
	() => scheduleRefresh(80)
)

onMounted(() => {
	stopDocumentListener = props.editor.store.listen(onDocumentChange, {
		scope: 'document',
	})
	scheduleRefresh(0)
})

onBeforeUnmount(() => {
	if (refreshTimer) clearTimeout(refreshTimer)
	thumbnailCanvasRefs.clear()
	stopDocumentListener?.()
	stopDocumentListener = null
})
</script>

<template>
	<section class="presentation-pages" aria-label="演示文稿页面" @pointerdown.stop>
		<div class="presentation-pages__header">
			<div>
				<strong>页面</strong>
				<span>{{ pages.length }} 页</span>
			</div>
			<span class="presentation-pages__status" aria-live="polite">静态缩略图</span>
		</div>

		<div class="presentation-pages__body">
			<div class="presentation-pages__list" role="listbox" aria-label="演示文稿页面列表">
				<button
					v-for="page in pageCards"
					:key="page.id"
					type="button"
					role="option"
					:aria-selected="page.isCurrent"
					:aria-label="`${page.index + 1} ${page.name || '页面'}`"
					class="presentation-page-card"
					:class="{ 'is-current': page.isCurrent }"
					@click="selectPage(page.id)"
				>
					<span
						class="presentation-page-card__preview"
						:style="{ aspectRatio: `${pageSizeMm.w} / ${pageSizeMm.h}` }"
					>
						<canvas
							:ref="(element) => setThumbnailCanvas(page.id, element)"
							class="presentation-page-card__thumbnail"
							role="img"
							:aria-label="`${page.name || '页面'}静态缩略图`"
						/>
						<em>{{ page.index + 1 }}</em>
					</span>
					<span class="presentation-page-card__name">{{ page.name || `Page ${page.index + 1}` }}</span>
				</button>
			</div>

			<button
				type="button"
			class="presentation-pages__add"
			:title="pages.length >= editor.options.maxPages ? '已达到页面数量上限' : '添加页面'"
			:disabled="pages.length >= editor.options.maxPages"
			@click="createPage"
		>
				<i class="ri-add-line" aria-hidden="true" />
				<span>添加页面</span>
			</button>
		</div>
	</section>
</template>
