<script setup lang="ts">
import type { Editor } from '@tldraw/editor'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import VueContextMenu from './VueContextMenu.vue'
import VueRulerOverlay from './VueRulerOverlay.vue'
import VueWorkspaceToolbar from './VueWorkspaceToolbar.vue'
import { getSnapIndicatorSegments } from '@/editor/interactions/snapIndicatorSegments'
import {
	createGuideId,
	getGuideLineSegments,
	getGuideScreenMarkers,
	isGuideInsidePage,
	type GuideAxis,
	type GuideLineSegment,
	type WorkspaceGuide,
} from '@/editor/interactions/guides'
import type { VueArrowTerminal } from '@/editor/interactions/DraggingArrowHandleState'
import type { CanvasTool, ResizeHandle, VueGeoShape } from '@/editor/interactions/types'
import { VueEditorController } from '@/editor/interactions/VueEditorController'
import { VueAssetManager } from '@/editor/interactions/VueAssetManager'
import { getVueArrowPageTerminalPoint } from '@/editor/interactions/vueLineGeometry'
import { getVueArrowTargetState } from '@/editor/interactions/vueArrowTargetState'
import type { VueToolbarToolDefinition } from '@/editor/vueEditorExtensions'
import type { VueTemplateWorkspaceConfig } from '@/editor/templateStore'
import {
	WorkspaceBoundsManager,
	type WorkspacePageSizeMm,
	type WorkspaceViewportSize,
} from '@/editor/interactions/WorkspaceBoundsManager'
import type { ContextMenuActionId, ContextMenuSnapshot } from '@/editor/interactions/ContextMenuState'
import { useEditorValue } from '@/vue/useEditorValue'
import VueShapeWrapper from './VueShapeWrapper.vue'

const props = defineProps<{
	editor: Editor
	activeTool: CanvasTool
	currentGeoShape: VueGeoShape
	handleShortcut?: (event: KeyboardEvent) => boolean
	toolbarTools: readonly VueToolbarToolDefinition[]
}>()

const emit = defineEmits<{
	'tool-change': [tool: CanvasTool, geoShape?: VueGeoShape]
	'workspace-config-change': [config: VueTemplateWorkspaceConfig]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const contextMenu = shallowRef<ContextMenuSnapshot | null>(null)
const viewportSize = ref<WorkspaceViewportSize>({ w: 0, h: 0 })
const workspaceBounds = new WorkspaceBoundsManager()
const RULER_SIZE = 28
const assetManager = new VueAssetManager(props.editor, workspaceBounds)
const workspaceRevision = ref(0)
const workspacePageSizeMm = ref(workspaceBounds.getPageSizeMm())
const guides = ref<WorkspaceGuide[]>([])
const printDataSource = ref<VueTemplateWorkspaceConfig['printDataSource']>({ type: 'none' })
const selectedGuideId = ref<string | null>(null)
let resizeObserver: ResizeObserver | null = null
let lastSelectionPointerDown: { time: number; x: number; y: number } | null = null
let lastSelectionMouseDown: { time: number; x: number; y: number } | null = null
let activeGuideDrag:
	| {
			axis: GuideAxis
			didMove: boolean
			guideId: string
			pointerId: number
	  }
	| null = null
let guideIdSeed = 0
const onWindowGuidePointerMove = (event: PointerEvent) => {
	if (!activeGuideDrag || activeGuideDrag.pointerId !== event.pointerId) return
	event.preventDefault()
	onGuidePointerMove(event)
}
const onWindowGuidePointerUp = (event: PointerEvent) => {
	if (!activeGuideDrag || activeGuideDrag.pointerId !== event.pointerId) return
	event.preventDefault()
	onGuidePointerUp(event)
}
const onWindowGuidePointerCancel = (event: PointerEvent) => {
	if (!activeGuideDrag || activeGuideDrag.pointerId !== event.pointerId) return
	event.preventDefault()
	onGuidePointerCancel(event)
}

const camera = useEditorValue('camera', () => props.editor.getCamera())
const cursor = useEditorValue('cursor', () => props.editor.getInstanceState().cursor)
const brush = useEditorValue('brush', () => props.editor.getInstanceState().brush)
const shapes = useEditorValue('current page shapes', () => props.editor.getCurrentPageShapesSorted())
const selectedShapeIds = useEditorValue('selected shape ids', () => props.editor.getSelectedShapeIds())
const snapIndicators = useEditorValue('snap indicators', () => props.editor.snaps.getIndicators())
const arrowTargetState = useEditorValue('vue arrow target state', () =>
	getVueArrowTargetState(props.editor)
)
const selectionBounds = useEditorValue('selection rotated page bounds', () =>
	props.editor.getSelectionRotatedPageBounds()
)
const selectionRotation = useEditorValue('selection rotation', () => props.editor.getSelectionRotation())

const selectedSet = computed(() => new Set(selectedShapeIds.value))
const snapLines = computed(() =>
	snapIndicators.value.flatMap((indicator) => getSnapIndicatorSegments(indicator, camera.value.z))
)
const guideLines = computed(() => getGuideLineSegments(guides.value, camera.value, viewportSize.value))
const guideMarkers = computed(() =>
	getGuideScreenMarkers({
		camera: camera.value,
		guides: guides.value,
		pxPerMm: workspaceBounds.getPxPerMm(),
		rulerSize: RULER_SIZE,
		viewport: viewportSize.value,
	})
)
const canvasCursor = computed(() => {
	if (cursor.value.type !== 'default') return cursor.value.type
	if (props.activeTool === 'hand') return 'grab'
	if (props.activeTool !== 'select') return 'crosshair'
	return undefined
})
const cameraTransform = computed(
	() =>
		`matrix(${camera.value.z}, 0, 0, ${camera.value.z}, ${camera.value.x * camera.value.z}, ${camera.value.y * camera.value.z})`
)
const brushBox = computed(() => {
	const currentBrush = brush.value
	if (!currentBrush) return null
	return {
		x: currentBrush.x,
		y: currentBrush.y,
		w: currentBrush.w,
		h: currentBrush.h,
	}
})
const selectionControl = computed(() => {
	const bounds = selectionBounds.value
	if (!bounds || selectedShapeIds.value.length === 0) return null

	return {
		x: bounds.x,
		y: bounds.y,
		w: bounds.w,
		h: bounds.h,
		rotation: selectionRotation.value,
	}
})
const selectedShape = computed(() => {
	if (selectedShapeIds.value.length !== 1) return null
	return shapes.value.find((currentShape) => currentShape.id === selectedShapeIds.value[0]) ?? null
})
const isMaterialSelection = computed(() => selectedShape.value?.type === ('vue-material' as string))
const isTableSelection = computed(() => selectedShape.value?.type === ('vue-table' as string))
const selectedArrowHandles = computed(() => {
	if (selectedShapeIds.value.length !== 1) return []
	const shape = selectedShape.value
	if (!shape || shape.type !== 'vue-arrow') return []

	return (['start', 'end'] as const).map((terminal) => {
		const point = getVueArrowPageTerminalPoint(shape, terminal)
		return {
			terminal,
			x: point.x,
			y: point.y,
		}
	})
})
const arrowTargetOverlay = computed(() => {
	const state = arrowTargetState.value
	if (!state) return null
	return {
		targetId: state.target.id,
		bounds: state.targetBounds,
		anchor: {
			x: state.anchorInPageSpace.x,
			y: state.anchorInPageSpace.y,
		},
		terminal: {
			x: state.terminalInPageSpace.x,
			y: state.terminalInPageSpace.y,
		},
		handles: (['top', 'right', 'bottom', 'left'] as const)
			.map((side) => ({
				id: side,
				x: state.handlesInPageSpace[side].point.x,
				y: state.handlesInPageSpace[side].point.y,
				isEnabled: state.handlesInPageSpace[side].isEnabled,
			}))
			.filter((handle) => handle.isEnabled),
	}
})
const workspacePage = computed(() => {
	workspaceRevision.value
	return workspaceBounds.getPageBounds()
})

const resizeHandles = [
	{ handle: 'top_left', label: 'Resize top left' },
	{ handle: 'top', label: 'Resize top' },
	{ handle: 'top_right', label: 'Resize top right' },
	{ handle: 'right', label: 'Resize right' },
	{ handle: 'bottom_right', label: 'Resize bottom right' },
	{ handle: 'bottom', label: 'Resize bottom' },
	{ handle: 'bottom_left', label: 'Resize bottom left' },
	{ handle: 'left', label: 'Resize left' },
] as const satisfies readonly { handle: ResizeHandle; label: string }[]

const selectionResizeHandles = computed(() => {
	if (selectedShapeIds.value.length !== 1) return resizeHandles

	const shape = selectedShape.value
	if (!shape) return resizeHandles
	if (props.editor.getShapeUtil(shape).hideResizeHandles(shape)) return []
	if (shape.type === ('vue-material-section' as string)) {
		return resizeHandles.filter(({ handle }) => handle === 'top' || handle === 'bottom')
	}

	return resizeHandles
})

const controller = new VueEditorController({
	editor: props.editor,
	getCurrentGeoShape: () => props.currentGeoShape,
	getCamera: () => camera.value,
	getContainer: () => containerRef.value,
	getCurrentPageShapes: () => shapes.value,
	getGuides: () => guides.value,
	handleShortcut: props.handleShortcut,
	onContextMenuChange: (snapshot) => {
		contextMenu.value = snapshot
	},
	onToolChange: (tool, geoShape) => emit('tool-change', tool, geoShape),
	toolbarTools: props.toolbarTools,
	workspaceBounds,
})

watch(
	() => props.activeTool,
	(tool) => controller.setActiveTool(tool),
	{ immediate: true }
)

function onWindowResize() {
	updateViewportSize()
	controller.updateViewport()
	emitWorkspaceConfigChange()
}

function updateViewportSize() {
	const container = containerRef.value
	if (!container) return
	viewportSize.value = {
		w: container.clientWidth,
		h: container.clientHeight,
	}
}

function onCanvasPointerDown(event: PointerEvent) {
	if (event.button === 2) return
	selectedGuideId.value = null
	controller.pointerDown(event)
}

function onCanvasPointerDownCapture(event: PointerEvent) {
	if (event.button !== 2) return
	selectedGuideId.value = null
	controller.pointerDown(event)
}

function onCanvasPointerMove(event: PointerEvent) {
	controller.pointerMove(event)
}

function onCanvasPointerUp(event: PointerEvent) {
	controller.pointerUp(event)
}

function onCanvasWheel(event: WheelEvent) {
	controller.wheel(event)
}

function onCanvasContextMenu(event: MouseEvent) {
	controller.openContextMenu(event)
}

function onCanvasMouseMoveCapture(event: MouseEvent) {
	if (!controller.isBlockingNativeRightButtonGesture()) return
	if ((event.buttons & 2) === 0) return
	event.preventDefault()
	event.stopPropagation()
}

function onCanvasDoubleClick(event: MouseEvent) {
	controller.doubleClick(event)
}

function onSelectionDoubleClick(event: MouseEvent) {
	event.stopPropagation()
	event.preventDefault()
	controller.editSelectedTextShape()
}

async function onCanvasDrop(event: DragEvent) {
	event.preventDefault()
	controller.updateViewport()
	const file = [...(event.dataTransfer?.files ?? [])].find((item) => item.type.startsWith('image/'))
	if (!file) return
	await assetManager.createImageFromFile(file, props.editor.screenToPage({ x: event.clientX, y: event.clientY }))
}

function onCanvasDragOver(event: DragEvent) {
	if ([...(event.dataTransfer?.items ?? [])].some((item) => item.type.startsWith('image/'))) {
		event.preventDefault()
	}
}

function onWorkspacePageSizeChange(size: WorkspacePageSizeMm) {
	workspaceBounds.setPageSizeMm(size)
	workspacePageSizeMm.value = workspaceBounds.getPageSizeMm()
	workspaceRevision.value++
	pruneGuidesToPage()
	clampCurrentPageShapes()
	controller.updateViewport()
	emitWorkspaceConfigChange()
}

function onWorkspaceZoomIn() {
	controller.zoomIn()
}

function onWorkspaceZoomOut() {
	controller.zoomOut()
}

function onWorkspaceZoomReset() {
	controller.resetZoom()
}

function onGuideCreate(guide: { axis: GuideAxis; position: number }) {
	const position = normalizeGuidePosition(guide.axis, guide.position)
	const nextGuide = {
		axis: guide.axis,
		id: createUniqueGuideId(guide.axis, position),
		position,
	}

	if (!isGuideInsidePage(nextGuide, workspaceBounds.getPageBounds())) return

	const duplicateThreshold = 0.001
	if (
		guides.value.some(
			(currentGuide) =>
				currentGuide.axis === nextGuide.axis &&
				Math.abs(currentGuide.position - nextGuide.position) <= duplicateThreshold
		)
	) {
		return
	}

	guides.value = [...guides.value, nextGuide]
	selectedGuideId.value = nextGuide.id
	emitWorkspaceConfigChange()
}

function onGuidePointerDown(line: GuideLineSegment, event: PointerEvent) {
	if (event.button !== 0) return
	selectedGuideId.value = line.id
	activeGuideDrag = {
		axis: line.axis,
		didMove: false,
		guideId: line.id,
		pointerId: event.pointerId,
	}
	addGuideDragListeners()

	const target = event.currentTarget
	if (target instanceof Element) {
		try {
			target.setPointerCapture(event.pointerId)
		} catch {
			// Ignore capture failures; the drag will still work while the pointer stays on the guide.
		}
	}
}

function onGuidePointerMove(event: PointerEvent) {
	const drag = activeGuideDrag
	if (!drag || drag.pointerId !== event.pointerId) return

	const pagePoint = props.editor.screenToPage({
		x: event.clientX,
		y: event.clientY,
	})
	const nextPosition = normalizeGuidePosition(
		drag.axis,
		drag.axis === 'x' ? pagePoint.x : pagePoint.y
	)

	guides.value = guides.value.map((guide) => {
		if (guide.id !== drag.guideId) return guide
		if (guide.position === nextPosition) return guide
		drag.didMove = true
		return {
			...guide,
			position: nextPosition,
		}
	})
}

function onGuidePointerUp(event: PointerEvent) {
	const drag = activeGuideDrag
	if (!drag || drag.pointerId !== event.pointerId) return

	const target = event.currentTarget
	if (target instanceof Element && target.hasPointerCapture(event.pointerId)) {
		target.releasePointerCapture(event.pointerId)
	}

	activeGuideDrag = null
	removeGuideDragListeners()
	if (drag.didMove) emitWorkspaceConfigChange()
}

function onGuidePointerCancel(event: PointerEvent) {
	const drag = activeGuideDrag
	if (!drag || drag.pointerId !== event.pointerId) return
	activeGuideDrag = null
	removeGuideDragListeners()
}

function deleteGuide(guideId: string | null = selectedGuideId.value) {
	if (!guideId) return
	const nextGuides = guides.value.filter((guide) => guide.id !== guideId)
	if (nextGuides.length === guides.value.length) return

	guides.value = nextGuides
	if (selectedGuideId.value === guideId) selectedGuideId.value = null
	if (activeGuideDrag?.guideId === guideId) {
		activeGuideDrag = null
		removeGuideDragListeners()
	}
	emitWorkspaceConfigChange()
}

function onContextMenuAction(actionId: ContextMenuActionId) {
	void controller.runContextMenuAction(actionId)
}

function closeContextMenu() {
	controller.closeContextMenu()
}

function startToolbarDrag(tool: CanvasTool, geoShape: VueGeoShape | undefined, event: PointerEvent) {
	controller.toolbarDragStart(tool, geoShape, event)
}

function moveToolbarDrag(event: PointerEvent) {
	controller.toolbarDragMove(event)
}

function endToolbarDrag(event: PointerEvent) {
	controller.toolbarDragEnd(event)
}

function cancelToolbarDrag(event: PointerEvent) {
	controller.toolbarDragCancel(event)
}

function onResizeHandlePointerDown(handle: ResizeHandle, event: PointerEvent) {
	controller.resizeHandlePointerDown(handle, event)
}

function onArrowHandlePointerDown(terminal: VueArrowTerminal, event: PointerEvent) {
	event.stopPropagation()
	event.preventDefault()
	controller.arrowHandlePointerDown(terminal, event)
}

function onSelectionPointerDown(event: PointerEvent) {
	if (event.button !== 0) return
	event.stopPropagation()
	event.preventDefault()
	const now = Date.now()
	const lastClick = lastSelectionPointerDown
	lastSelectionPointerDown = { time: now, x: event.clientX, y: event.clientY }
	if (
		lastClick &&
		now - lastClick.time < 700 &&
		Math.hypot(event.clientX - lastClick.x, event.clientY - lastClick.y) < 6 &&
		controller.editSelectedTextShape()
	) {
		return
	}
	controller.selectionPointerDown(event)
}

function onSelectionMouseDown(event: MouseEvent) {
	if (event.button !== 0) return
	const now = Date.now()
	const lastClick = lastSelectionMouseDown
	lastSelectionMouseDown = { time: now, x: event.clientX, y: event.clientY }
	if (
		lastClick &&
		now - lastClick.time < 700 &&
		Math.hypot(event.clientX - lastClick.x, event.clientY - lastClick.y) < 6 &&
		controller.editSelectedTextShape()
	) {
		event.stopPropagation()
		event.preventDefault()
	}
}

function onSelectionPointerMove(event: PointerEvent) {
	event.stopPropagation()
	controller.pointerMove(event)
}

function onSelectionPointerUp(event: PointerEvent) {
	event.stopPropagation()
	controller.pointerUp(event)
}

function onKeyDown(event: KeyboardEvent) {
	if (selectedGuideId.value && !isEditableKeyTarget(event)) {
		if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault()
			deleteGuide()
			return
		}
		if (event.key === 'Escape') {
			event.preventDefault()
			selectedGuideId.value = null
			return
		}
	}
	controller.keyDown(event)
}

function onKeyUp(event: KeyboardEvent) {
	controller.keyUp(event)
}

async function onPaste(event: ClipboardEvent) {
	if (event.defaultPrevented) return
	if (shouldSkipCanvasPaste(event)) return
	const file = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith('image/'))
	const bounds = containerRef.value?.getBoundingClientRect()
	const point = bounds
		? props.editor.screenToPage({
				x: bounds.left + bounds.width / 2,
				y: bounds.top + bounds.height / 2,
			})
		: props.editor.getViewportPageBounds().center

	if (file) {
		event.preventDefault()
		await assetManager.createImageFromFile(file, point)
		return
	}

	if (!event.clipboardData?.types.length) return
	event.preventDefault()
	await controller.pasteClipboardData(point, event.clipboardData)
}

function shouldSkipCanvasPaste(event: ClipboardEvent) {
	const target = event.target as HTMLElement | null
	const activeElement = document.activeElement as HTMLElement | null
	return isEditableDomTarget(target) || isEditableDomTarget(activeElement)
}

function isEditableDomTarget(element: HTMLElement | null) {
	if (!element) return false
	if (element.isContentEditable) return true
	return Boolean(
		element.closest(
			'input, textarea, select, [contenteditable="true"], .lowcode-form-panel, .vue-table-shape'
		)
	)
}

function isEditableKeyTarget(event: KeyboardEvent) {
	const target = event.target as HTMLElement | null
	const activeElement = document.activeElement as HTMLElement | null
	return isEditableDomTarget(target) || isEditableDomTarget(activeElement)
}

function clampCurrentPageShapes() {
	const changes = shapes.value
		.filter((shape) => shape.type === 'vue-box')
		.map((shape) => {
			const clamped = workspaceBounds.clampShapePartial(props.editor, {
				id: shape.id,
				type: shape.type,
			})
			const shapeProps = shape.props as { w: number; h: number }
			const nextProps = (clamped.props ?? {}) as Partial<{ w: number; h: number }>
			const hasChanged =
				clamped.x !== shape.x ||
				clamped.y !== shape.y ||
				(nextProps.w !== undefined && nextProps.w !== shapeProps.w) ||
				(nextProps.h !== undefined && nextProps.h !== shapeProps.h)
			return hasChanged ? clamped : null
		})
		.filter((change): change is NonNullable<typeof change> => change !== null)

	if (!changes.length) return
	props.editor.run(() => props.editor.updateShapes(changes), { history: 'ignore' })
}

function getWorkspaceTemplateConfig(): VueTemplateWorkspaceConfig {
	const currentCamera = props.editor.getCamera()
	return {
		pageSizeMm: workspaceBounds.getPageSizeMm(),
		pageBounds: workspaceBounds.getPageBounds(),
		camera: {
			x: currentCamera.x,
			y: currentCamera.y,
			z: currentCamera.z,
		},
		guides: guides.value.map((guide) => ({ ...guide })),
		viewportSize: { ...viewportSize.value },
		pxPerMm: workspaceBounds.getPxPerMm(),
		printDataSource: printDataSource.value ? cloneJson(printDataSource.value) : undefined,
	}
}

function applyWorkspaceTemplateConfig(config: VueTemplateWorkspaceConfig) {
	let didUpdatePageSize = false
	if (config.pageSizeMm) {
		workspaceBounds.setPageSizeMm(config.pageSizeMm)
		workspacePageSizeMm.value = workspaceBounds.getPageSizeMm()
		workspaceRevision.value++
		didUpdatePageSize = true
	}

	if (config.camera) {
		const camera = config.camera
		props.editor.run(() => props.editor.setCamera(camera, { immediate: true }), {
			history: 'ignore',
		})
	}

	if (didUpdatePageSize) {
		pruneGuidesToPage()
		clampCurrentPageShapes()
	}

	if (config.guides) {
		const page = workspaceBounds.getPageBounds()
		const usedIds = new Set<string>()
		guides.value = config.guides
			.map((guide) => {
				const position = normalizeGuidePosition(guide.axis, guide.position)
				const id = usedIds.has(guide.id) ? createUniqueGuideId(guide.axis, position, usedIds) : guide.id
				usedIds.add(id)
				return {
					axis: guide.axis,
					id,
					position,
				}
			})
			.filter((guide) => isGuideInsidePage(guide, page))
		clearMissingSelectedGuide()
	}

	if (config.printDataSource) {
		printDataSource.value = cloneJson(config.printDataSource)
	}

	controller.updateViewport()
	emitWorkspaceConfigChange()
}

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

function emitWorkspaceConfigChange() {
	emit('workspace-config-change', getWorkspaceTemplateConfig())
}

function pruneGuidesToPage() {
	const page = workspaceBounds.getPageBounds()
	const nextGuides = guides.value.filter((guide) => isGuideInsidePage(guide, page))
	if (nextGuides.length !== guides.value.length) {
		guides.value = nextGuides
		clearMissingSelectedGuide()
	}
}

function normalizeGuidePosition(axis: GuideAxis, position: number) {
	const page = workspaceBounds.getPageBounds()
	const min = axis === 'x' ? page.x : page.y
	const max = axis === 'x' ? page.x + page.w : page.y + page.h
	const pxPerMm = workspaceBounds.getPxPerMm()
	const clampedPosition = Math.max(min, Math.min(max, position))
	const roundedPosition = Math.round(clampedPosition / pxPerMm) * pxPerMm
	return Math.max(min, Math.min(max, roundedPosition))
}

function createUniqueGuideId(axis: GuideAxis, position: number, usedIds?: Set<string>) {
	const used = usedIds ?? new Set(guides.value.map((guide) => guide.id))
	const baseId = createGuideId(axis, position)
	let id = baseId
	while (used.has(id)) {
		guideIdSeed += 1
		id = `${baseId}:${guideIdSeed}`
	}
	return id
}

function clearMissingSelectedGuide() {
	if (!selectedGuideId.value) return
	if (!guides.value.some((guide) => guide.id === selectedGuideId.value)) {
		selectedGuideId.value = null
	}
}

function addGuideDragListeners() {
	removeGuideDragListeners()
	window.addEventListener('pointermove', onWindowGuidePointerMove, true)
	window.addEventListener('pointerup', onWindowGuidePointerUp, true)
	window.addEventListener('pointercancel', onWindowGuidePointerCancel, true)
}

function removeGuideDragListeners() {
	window.removeEventListener('pointermove', onWindowGuidePointerMove, true)
	window.removeEventListener('pointerup', onWindowGuidePointerUp, true)
	window.removeEventListener('pointercancel', onWindowGuidePointerCancel, true)
}

defineExpose({
	applyWorkspaceTemplateConfig,
	closeContextMenu: () => controller.closeContextMenu(),
	cancelToolbarDrag,
	endToolbarDrag,
	getWorkspaceTemplateConfig,
	isContextMenuOpen: () => controller.isContextMenuOpen(),
	moveToolbarDrag,
	startToolbarDrag,
})

onMounted(() => {
	updateViewportSize()
	controller.updateViewport(true)
	emitWorkspaceConfigChange()
	if (containerRef.value) {
		resizeObserver = new ResizeObserver(() => {
			updateViewportSize()
			controller.updateViewport()
			emitWorkspaceConfigChange()
		})
		resizeObserver.observe(containerRef.value)
	}
	window.addEventListener('resize', onWindowResize)
	window.addEventListener('keydown', onKeyDown)
	window.addEventListener('keyup', onKeyUp)
	window.addEventListener('paste', onPaste)
})

onBeforeUnmount(() => {
	window.removeEventListener('resize', onWindowResize)
	window.removeEventListener('keydown', onKeyDown)
	window.removeEventListener('keyup', onKeyUp)
	window.removeEventListener('paste', onPaste)
	resizeObserver?.disconnect()
	removeGuideDragListeners()
	controller.cancel()
})
</script>

<template>
	<div
		ref="containerRef"
		class="vue-canvas"
		:class="`tool-${activeTool}`"
		:style="{ cursor: canvasCursor }"
		tabindex="0"
		@mousemove.capture="onCanvasMouseMoveCapture"
		@pointerdown="onCanvasPointerDown"
		@pointerdown.capture="onCanvasPointerDownCapture"
		@pointermove="onCanvasPointerMove"
		@pointerup="onCanvasPointerUp"
		@pointercancel="onCanvasPointerUp"
		@wheel="onCanvasWheel"
		@dblclick="onCanvasDoubleClick"
		@contextmenu.prevent="onCanvasContextMenu"
		@dragover="onCanvasDragOver"
		@drop="onCanvasDrop"
	>
		<div
			class="shape-layer"
			:style="{
				transform: cameraTransform,
			}"
		>
			<div
				class="workspace-page"
				:style="{
					left: `${workspacePage.x}px`,
					top: `${workspacePage.y}px`,
					width: `${workspacePage.w}px`,
					height: `${workspacePage.h}px`,
					'--inverse-zoom': String(1 / camera.z),
				}"
			/>

			<svg v-if="guideLines.length" class="guide-overlay">
				<g
					v-for="line in guideLines"
					:key="line.id"
					class="guide-group"
					:class="{ 'is-selected': selectedGuideId === line.id }"
				>
					<line
						class="guide-line"
						:class="`guide-line--${line.axis}`"
						:x1="line.x1"
						:y1="line.y1"
						:x2="line.x2"
						:y2="line.y2"
					/>
					<line
						class="guide-hit-line"
						:class="`guide-hit-line--${line.axis}`"
						:x1="line.x1"
						:y1="line.y1"
						:x2="line.x2"
						:y2="line.y2"
						@pointerdown.stop.prevent="onGuidePointerDown(line, $event)"
						@pointermove.stop.prevent="onGuidePointerMove"
						@pointerup.stop.prevent="onGuidePointerUp"
						@pointercancel.stop.prevent="onGuidePointerCancel"
						@dblclick.stop.prevent="deleteGuide(line.id)"
					/>
				</g>
			</svg>

			<VueShapeWrapper
				v-for="shape in shapes"
				:key="shape.id"
				:editor="editor"
				:shape="shape"
				:selected="selectedSet.has(shape.id)"
				:zoom="camera.z"
			/>

			<div
				v-if="brushBox"
				class="brush-overlay"
				:style="{
					left: `${brushBox.x}px`,
					top: `${brushBox.y}px`,
					width: `${brushBox.w}px`,
					height: `${brushBox.h}px`,
					'--inverse-zoom': String(1 / camera.z),
				}"
			/>

			<div
				v-if="selectionControl"
				class="selection-control"
				:class="{
					'is-passive': activeTool !== 'select',
					'is-material-selection': isMaterialSelection,
					'is-table-selection': isTableSelection,
				}"
				:style="{
					width: `${selectionControl.w}px`,
					height: `${selectionControl.h}px`,
					transform: `translate(${selectionControl.x}px, ${selectionControl.y}px) rotate(${selectionControl.rotation}rad)`,
				'--inverse-zoom': String(1 / camera.z),
			}"
				@mousedown="onSelectionMouseDown"
				@pointerdown="onSelectionPointerDown"
				@pointermove="onSelectionPointerMove"
				@pointerup="onSelectionPointerUp"
				@pointercancel="onSelectionPointerUp"
				@dblclick="onSelectionDoubleClick"
			>
				<template v-if="selectedArrowHandles.length === 0 && activeTool === 'select'">
					<button
						v-for="{ handle, label } in selectionResizeHandles"
						:key="handle"
						type="button"
						class="selection-resize-handle"
						:class="`selection-resize-handle--${handle}`"
						:aria-label="label"
						@pointerdown.stop.prevent="onResizeHandlePointerDown(handle, $event)"
					/>
				</template>
			</div>

			<svg v-if="snapLines.length" class="snap-overlay">
				<line
					v-for="line in snapLines"
					:key="line.id"
					class="snap-line"
					:x1="line.x1"
					:y1="line.y1"
					:x2="line.x2"
					:y2="line.y2"
				/>
			</svg>

			<svg
				v-if="arrowTargetOverlay"
				class="arrow-hint-overlay"
				:style="{ '--inverse-zoom': String(1 / camera.z) }"
			>
				<rect
					class="arrow-hint-target"
					:x="arrowTargetOverlay.bounds.x"
					:y="arrowTargetOverlay.bounds.y"
					:width="arrowTargetOverlay.bounds.w"
					:height="arrowTargetOverlay.bounds.h"
				/>
				<line
					class="arrow-hint-stub"
					:x1="arrowTargetOverlay.anchor.x"
					:y1="arrowTargetOverlay.anchor.y"
					:x2="arrowTargetOverlay.terminal.x"
					:y2="arrowTargetOverlay.terminal.y"
				/>
				<circle
					class="arrow-hint-anchor"
					:cx="arrowTargetOverlay.terminal.x"
					:cy="arrowTargetOverlay.terminal.y"
					:r="8 / camera.z"
				/>
				<circle
					v-for="handle in arrowTargetOverlay.handles"
					:key="handle.id"
					class="arrow-hint-handle"
					:cx="handle.x"
					:cy="handle.y"
					:r="4 / camera.z"
				/>
			</svg>

			<button
				v-for="handle in selectedArrowHandles"
				:key="handle.terminal"
				type="button"
				class="arrow-terminal-handle"
				:class="`arrow-terminal-handle--${handle.terminal}`"
				:aria-label="`Drag arrow ${handle.terminal}`"
				:style="{
					transform: `translate(${handle.x}px, ${handle.y}px) translate(-50%, -50%)`,
					'--inverse-zoom': String(1 / camera.z),
				}"
				@pointerdown="onArrowHandlePointerDown(handle.terminal, $event)"
			/>
		</div>

		<VueRulerOverlay
			:camera="camera"
			:viewport="viewportSize"
			:workspace-bounds="workspaceBounds"
			:workspace-revision="workspaceRevision"
			:ruler-size="RULER_SIZE"
			@guide-create="onGuideCreate"
		/>

		<div v-if="guideMarkers.length" class="guide-label-layer">
			<span
				v-for="marker in guideMarkers"
				:key="marker.id"
				class="guide-label"
				:class="`guide-label--${marker.axis}`"
				:data-selected="selectedGuideId === marker.id"
				:style="{ left: `${marker.left}px`, top: `${marker.top}px` }"
			>
				{{ marker.label }}
			</span>
		</div>

		<VueWorkspaceToolbar
			:page-size-mm="workspacePageSizeMm"
			:zoom="camera.z"
			@page-size-change="onWorkspacePageSizeChange"
			@zoom-in="onWorkspaceZoomIn"
			@zoom-out="onWorkspaceZoomOut"
			@zoom-reset="onWorkspaceZoomReset"
		/>

		<VueContextMenu
			v-if="contextMenu"
			:snapshot="contextMenu"
			@action="onContextMenuAction"
			@close="closeContextMenu"
			@contextmenu="onCanvasContextMenu"
		/>
	</div>
</template>
