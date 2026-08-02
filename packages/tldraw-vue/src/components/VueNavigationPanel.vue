<script setup lang="ts">
import type { Editor } from '@tldraw/editor'
import { computed, onBeforeUnmount, onMounted, ref, type CSSProperties } from 'vue'
import VueMinimap from './VueMinimap.vue'
import {
	NavigationController,
	type NavigationActionId,
} from '@/editor/interactions/NavigationController'
import { useEditorValue } from '@/vue/useEditorValue'

const STORAGE_KEY = 'vue-minimap'
const POSITION_STORAGE_KEY = 'vue-minimap-position'
const PANEL_MARGIN = 8

interface PanelPosition {
	x: number
	y: number
}

const props = defineProps<{
	editor: Editor
}>()

const emit = defineEmits<{
	'before-action': []
}>()

const panelRef = ref<HTMLDivElement | null>(null)
const collapsed = ref(false)
const zoomMenuOpen = ref(false)
const panelPosition = ref<PanelPosition | null>(null)
const isDraggingPanel = ref(false)
const controller = new NavigationController(props.editor)
let activePanelDrag:
	| {
			pointerId: number
			startPointerX: number
			startPointerY: number
			startPosition: PanelPosition
	  }
	| null = null

const zoom = useEditorValue('navigation zoom', () => props.editor.getZoomLevel())
const selectedShapeIds = useEditorValue('navigation selected shape ids', () =>
	props.editor.getSelectedShapeIds()
)
const shapeCount = useEditorValue('navigation shape count', () =>
	props.editor.getCurrentPageShapeIds().size
)

const zoomLabel = computed(() => {
	zoom.value
	return controller.getZoomLabel()
})
const panelStyle = computed<CSSProperties>(() => {
	if (!panelPosition.value) return {}
	return {
		left: `${panelPosition.value.x}px`,
		top: `${panelPosition.value.y}px`,
		bottom: 'auto',
	}
})

const actionGroups = computed(() => {
	zoom.value
	selectedShapeIds.value
	shapeCount.value
	return controller.getActionGroups()
})

function runAction(actionId: NavigationActionId) {
	emit('before-action')
	controller.runAction(actionId)
}

function zoomIn() {
	runAction('zoom-in')
}

function zoomOut() {
	runAction('zoom-out')
}

function resetZoom() {
	runAction('zoom-to-100')
}

function toggleMinimap() {
	emit('before-action')
	closeZoomMenu()
	collapsed.value = !collapsed.value
	try {
		window.localStorage.setItem(STORAGE_KEY, collapsed.value ? 'collapsed' : 'expanded')
	} catch {
		// Ignore storage failures.
	}
	requestAnimationFrame(constrainPanelPosition)
}

function onPanelPointerDown(event: PointerEvent) {
	if (event.button !== 0) return
	const target = event.target as HTMLElement | null
	if (target?.closest('button, canvas, input, textarea, select, [contenteditable="true"]')) return

	const panel = panelRef.value
	const parent = panel?.parentElement
	if (!panel || !parent) return

	event.preventDefault()
	emit('before-action')
	closeZoomMenu()

	const startPosition = getCurrentPanelPosition(panel, parent)
	panelPosition.value = startPosition
	activePanelDrag = {
		pointerId: event.pointerId,
		startPointerX: event.clientX,
		startPointerY: event.clientY,
		startPosition,
	}
	isDraggingPanel.value = true
	addPanelDragListeners()

	try {
		panel.setPointerCapture(event.pointerId)
	} catch {
		// Window listeners keep the drag alive if capture is unavailable.
	}
}

function onPanelPointerMove(event: PointerEvent) {
	const drag = activePanelDrag
	if (!drag || event.pointerId !== drag.pointerId) return

	event.preventDefault()
	const panel = panelRef.value
	const parent = panel?.parentElement
	if (!panel || !parent) return

	panelPosition.value = clampPanelPosition(
		{
			x: drag.startPosition.x + event.clientX - drag.startPointerX,
			y: drag.startPosition.y + event.clientY - drag.startPointerY,
		},
		parent,
		panel
	)
}

function onPanelPointerUp(event: PointerEvent) {
	const drag = activePanelDrag
	if (!drag || event.pointerId !== drag.pointerId) return

	const panel = panelRef.value
	if (panel?.hasPointerCapture(event.pointerId)) {
		panel.releasePointerCapture(event.pointerId)
	}

	activePanelDrag = null
	isDraggingPanel.value = false
	removePanelDragListeners()
	savePanelPosition()
}

function onPanelPointerCancel(event: PointerEvent) {
	if (!activePanelDrag || event.pointerId !== activePanelDrag.pointerId) return
	activePanelDrag = null
	isDraggingPanel.value = false
	removePanelDragListeners()
}

function getCurrentPanelPosition(panel: HTMLElement, parent: HTMLElement): PanelPosition {
	const panelRect = panel.getBoundingClientRect()
	const parentRect = parent.getBoundingClientRect()
	return clampPanelPosition(
		panelPosition.value ?? {
			x: panelRect.left - parentRect.left,
			y: panelRect.top - parentRect.top,
		},
		parent,
		panel
	)
}

function constrainPanelPosition() {
	const panel = panelRef.value
	const parent = panel?.parentElement
	if (!panel || !parent || !panelPosition.value) return
	panelPosition.value = clampPanelPosition(panelPosition.value, parent, panel)
	savePanelPosition()
}

function clampPanelPosition(position: PanelPosition, parent: HTMLElement, panel: HTMLElement) {
	const parentRect = parent.getBoundingClientRect()
	const panelRect = panel.getBoundingClientRect()
	const maxX = Math.max(PANEL_MARGIN, parentRect.width - panelRect.width - PANEL_MARGIN)
	const maxY = Math.max(PANEL_MARGIN, parentRect.height - panelRect.height - PANEL_MARGIN)

	return {
		x: clamp(position.x, PANEL_MARGIN, maxX),
		y: clamp(position.y, PANEL_MARGIN, maxY),
	}
}

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value))
}

function loadPanelPosition() {
	try {
		const raw = window.localStorage.getItem(POSITION_STORAGE_KEY)
		if (!raw) return
		const parsed = JSON.parse(raw) as Partial<PanelPosition>
		if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return
		panelPosition.value = { x: parsed.x, y: parsed.y }
		requestAnimationFrame(constrainPanelPosition)
	} catch {
		panelPosition.value = null
	}
}

function savePanelPosition() {
	if (!panelPosition.value) return
	try {
		window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(panelPosition.value))
	} catch {
		return
	}
}

function addPanelDragListeners() {
	removePanelDragListeners()
	window.addEventListener('pointermove', onPanelPointerMove, true)
	window.addEventListener('pointerup', onPanelPointerUp, true)
	window.addEventListener('pointercancel', onPanelPointerCancel, true)
}

function removePanelDragListeners() {
	window.removeEventListener('pointermove', onPanelPointerMove, true)
	window.removeEventListener('pointerup', onPanelPointerUp, true)
	window.removeEventListener('pointercancel', onPanelPointerCancel, true)
}

function toggleZoomMenu() {
	emit('before-action')
	zoomMenuOpen.value = !zoomMenuOpen.value
}

function closeZoomMenu() {
	zoomMenuOpen.value = false
}

function onDocumentPointerDown(event: PointerEvent) {
	const target = event.target
	if (!(target instanceof Node)) return
	if (!panelRef.value?.contains(target)) closeZoomMenu()
}

function onDocumentKeyDown(event: KeyboardEvent) {
	if (event.key === 'Escape') closeZoomMenu()
}

onMounted(() => {
	try {
		collapsed.value = window.localStorage.getItem(STORAGE_KEY) === 'collapsed'
	} catch {
		collapsed.value = false
	}
	loadPanelPosition()

	window.addEventListener('pointerdown', onDocumentPointerDown)
	window.addEventListener('keydown', onDocumentKeyDown)
	window.addEventListener('resize', constrainPanelPosition)
})

onBeforeUnmount(() => {
	window.removeEventListener('pointerdown', onDocumentPointerDown)
	window.removeEventListener('keydown', onDocumentKeyDown)
	window.removeEventListener('resize', constrainPanelPosition)
	removePanelDragListeners()
})
</script>

<template>
	<div
		ref="panelRef"
		class="navigation-panel"
		:class="{ 'is-collapsed': collapsed, 'is-dragging': isDraggingPanel }"
		:style="panelStyle"
		@pointerdown.stop="onPanelPointerDown"
		@pointermove.stop
		@wheel.stop
		@contextmenu.prevent.stop
	>
		<div class="navigation-toolbar" role="toolbar" aria-label="Navigation">
			<button
				v-if="!collapsed"
				type="button"
				class="navigation-button"
				aria-label="Zoom out"
				title="Zoom out"
				@click="zoomOut"
			>
				-
			</button>
			<button
				type="button"
				class="navigation-zoom-button"
				aria-label="Zoom"
				title="Zoom"
				:aria-expanded="zoomMenuOpen"
				@click="toggleZoomMenu"
				@dblclick.prevent="resetZoom"
			>
				{{ zoomLabel }}
			</button>
			<button
				v-if="!collapsed"
				type="button"
				class="navigation-button"
				aria-label="Zoom in"
				title="Zoom in"
				@click="zoomIn"
			>
				+
			</button>
			<button
				type="button"
				class="navigation-button"
				:aria-label="collapsed ? 'Show minimap' : 'Hide minimap'"
				:title="collapsed ? 'Show minimap' : 'Hide minimap'"
				@click="toggleMinimap"
			>
				{{ collapsed ? '>' : '<' }}
			</button>
		</div>

		<div v-if="zoomMenuOpen" class="navigation-zoom-menu" role="menu">
			<template v-for="(group, groupIndex) in actionGroups" :key="groupIndex">
				<div v-if="groupIndex > 0" class="navigation-menu-separator" />
				<button
					v-for="action in group"
					:key="action.id"
					type="button"
					class="navigation-menu-item"
					role="menuitem"
					:disabled="action.disabled"
					@click="runAction(action.id)"
				>
					{{ action.label }}
				</button>
			</template>
		</div>

		<VueMinimap v-if="!collapsed" :editor="editor" />
	</div>
</template>
