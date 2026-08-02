<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
	ToolbarController,
	type ToolbarItemId,
	type ToolbarItemSnapshot,
} from '@/editor/interactions/ToolbarController'
import type { CanvasTool, VueGeoShape } from '@/editor/interactions/types'
import type { VueToolbarToolDefinition } from '@/editor/vueEditorExtensions'

const props = defineProps<{
	activeTool: CanvasTool
	compact?: boolean
	currentGeoShape: VueGeoShape
	toolbarTools: readonly VueToolbarToolDefinition[]
}>()

const emit = defineEmits<{
	'before-action': []
	'tool-select': [tool: CanvasTool, geoShape?: VueGeoShape]
	'tool-drag-cancel': [event: PointerEvent]
	'tool-drag-end': [event: PointerEvent]
	'tool-drag-move': [event: PointerEvent]
	'tool-drag-start': [tool: CanvasTool, geoShape: VueGeoShape | undefined, event: PointerEvent]
}>()

const collapsed = ref(false)
const glyph = (codePoint: number) => String.fromCodePoint(codePoint)
const TOOL_DRAG_DISTANCE_SQUARED = 36

type ToolbarPointerState =
	| { name: 'idle' }
	| {
			name: 'pointing'
			item: ToolbarItemSnapshot
			pointerId: number
			startX: number
			startY: number
	  }
	| {
			name: 'dragging'
			item: ToolbarItemSnapshot
			pointerId: number
	  }
	| { name: 'dragged' }

let toolbarPointerState: ToolbarPointerState = { name: 'idle' }

const TOOL_GLYPHS: Partial<Record<ToolbarItemId, string>> = {
	arrow: glyph(0x2197),
	text: 'T',
	note: glyph(0x25a3),
	asset: glyph(0x25a4),
	qr: glyph(0x25a9),
	highlight: glyph(0x25a5),
	line: '/',
	laser: glyph(0x25c9),
	frame: glyph(0x231f),
	table: glyph(0x25a6),
	material: glyph(0x25a4),
	rectangle: glyph(0x25ad),
	ellipse: glyph(0x25ef),
	triangle: glyph(0x25b3),
	diamond: glyph(0x25c7),
	hexagon: glyph(0x2b21),
	oval: glyph(0x2b2d),
	rhombus: glyph(0x25c8),
	star: glyph(0x2606),
	cloud: glyph(0x2601),
	heart: glyph(0x2661),
	'x-box': glyph(0x2612),
	'check-box': glyph(0x2611),
	'arrow-left': glyph(0x2190),
	'arrow-up': glyph(0x2191),
	'arrow-down': glyph(0x2193),
	'arrow-right': glyph(0x2192),
}

const componentItems = computed(() =>
	new ToolbarController(props.toolbarTools)
		.getMoreGroups(props.activeTool, props.currentGeoShape)
		.flat()
)

watch(
	() => props.compact,
	(compact) => {
		collapsed.value = compact === true
	},
	{ immediate: true }
)

function toggleCollapsed() {
	collapsed.value = !collapsed.value
}

function runSelection(item: ToolbarItemSnapshot) {
	if (!item.selection) return
	emit('before-action')
	emit('tool-select', item.selection.tool, item.selection.geoShape)
}

function canDragItem(item: ToolbarItemSnapshot) {
	return !item.disabled && item.selection !== undefined && item.draggable
}

function getToolGlyph(item: Pick<ToolbarItemSnapshot, 'glyph' | 'icon' | 'label'>) {
	return item.glyph ?? TOOL_GLYPHS[item.icon] ?? item.label.slice(0, 1).toUpperCase()
}

function onToolPointerDown(item: ToolbarItemSnapshot, event: PointerEvent) {
	if (!canDragItem(item)) return
	if (event.button !== 0) return

	toolbarPointerState = {
		name: 'pointing',
		item,
		pointerId: event.pointerId,
		startX: event.clientX,
		startY: event.clientY,
	}

	const target = event.currentTarget
	if (target instanceof Element) {
		try {
			target.setPointerCapture(event.pointerId)
		} catch {
			// The browser may reject capture for detached or disabled controls.
		}
	}
}

function onToolPointerMove(event: PointerEvent) {
	const state = toolbarPointerState
	if (state.name === 'idle' || state.name === 'dragged') return
	if (event.pointerId !== state.pointerId) return

	if (state.name === 'pointing') {
		const distanceSquared =
			(event.clientX - state.startX) ** 2 + (event.clientY - state.startY) ** 2
		if (distanceSquared <= TOOL_DRAG_DISTANCE_SQUARED) return

		const selection = state.item.selection
		if (!selection) return

		toolbarPointerState = {
			name: 'dragging',
			item: state.item,
			pointerId: state.pointerId,
		}
		event.preventDefault()
		emit('before-action')
		emit('tool-drag-start', selection.tool, selection.geoShape, event)
		return
	}

	event.preventDefault()
	emit('tool-drag-move', event)
}

function onToolPointerUp(event: PointerEvent) {
	const state = toolbarPointerState
	releaseToolPointerCapture(event)

	if (state.name === 'pointing' && event.pointerId === state.pointerId) {
		toolbarPointerState = { name: 'idle' }
		return
	}

	if (state.name === 'dragging' && event.pointerId === state.pointerId) {
		event.preventDefault()
		emit('tool-drag-end', event)
		toolbarPointerState = { name: 'dragged' }
	}
}

function onToolPointerCancel(event: PointerEvent) {
	const state = toolbarPointerState
	releaseToolPointerCapture(event)
	if ((state.name === 'pointing' || state.name === 'dragging') && event.pointerId === state.pointerId) {
		if (state.name === 'dragging') emit('tool-drag-cancel', event)
		toolbarPointerState = { name: 'idle' }
	}
}

function onToolClick(item: ToolbarItemSnapshot, event: MouseEvent) {
	if (toolbarPointerState.name === 'dragged') {
		toolbarPointerState = { name: 'idle' }
		event.preventDefault()
		event.stopPropagation()
		return
	}

	runSelection(item)
}

function releaseToolPointerCapture(event: PointerEvent) {
	const target = event.currentTarget
	if (!(target instanceof Element)) return
	try {
		if (target.hasPointerCapture(event.pointerId)) {
			target.releasePointerCapture(event.pointerId)
		}
	} catch {
		// Ignore capture cleanup failures from browser edge cases.
	}
}
</script>

<template>
	<aside
		class="component-palette"
		:class="{ 'is-collapsed': collapsed, 'is-compact': compact }"
		aria-label="Component palette"
		@pointerdown.stop
		@pointermove.stop
		@wheel.stop
		@contextmenu.prevent.stop
	>
		<button
			type="button"
			class="side-panel-toggle component-palette-toggle"
			:aria-label="collapsed ? '展开组件面板' : '收起组件面板'"
			:title="collapsed ? '展开组件面板' : '收起组件面板'"
			@click="toggleCollapsed"
		>
			{{ collapsed ? '>' : '<' }}
		</button>

		<div v-show="!collapsed" class="component-palette-grid">
			<button
				v-for="item in componentItems"
				:key="item.id"
				type="button"
				class="component-palette-button"
				:class="{ 'is-selected': item.selected, 'is-draggable': canDragItem(item) }"
				:disabled="item.disabled"
				:aria-label="item.label"
				:aria-pressed="item.selected"
				:title="item.shortcut ? `${item.label} (${item.shortcut})` : item.label"
				@pointerdown="onToolPointerDown(item, $event)"
				@pointermove="onToolPointerMove"
				@pointerup="onToolPointerUp"
				@pointercancel="onToolPointerCancel"
				@click="onToolClick(item, $event)"
			>
				<span class="component-palette-icon" :data-icon="item.icon">
					{{ getToolGlyph(item) }}
				</span>
			</button>
		</div>
	</aside>
</template>
