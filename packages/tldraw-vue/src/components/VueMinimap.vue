<script setup lang="ts">
import { Box, Vec, type Editor, type TLCamera } from '@tldraw/editor'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { MinimapManager } from '@/editor/interactions/MinimapManager'

const CLICK_JITTER_THRESHOLD_SQ = 4

const props = defineProps<{
	editor: Editor
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)

let minimap: MinimapManager | null = null
let pointing = false
let activePointerId: number | null = null
let originScreenPoint = new Vec()

function onDoubleClick(event: MouseEvent) {
	event.preventDefault()
	event.stopPropagation()

	if (!props.editor.getCurrentPageShapeIds().size || !minimap) return

	const { clientX: x, clientY: y } = event
	const clampedPoint = minimap.minimapScreenPointToPagePoint(x, y, false, true)
	minimap.originPagePoint.setTo(clampedPoint)
	minimap.originPageCenter.setTo(props.editor.getViewportPageBounds().center)

	const point = minimap.minimapScreenPointToPagePoint(x, y, false, false)
	props.editor.centerOnPoint(point, {
		animation: { duration: props.editor.options.animationMediumMs },
	})
}

function onPointerDown(event: PointerEvent) {
	event.preventDefault()
	event.stopPropagation()

	if (!minimap || event.button !== 0) return

	const elem = event.currentTarget as HTMLCanvasElement
	elem.setPointerCapture(event.pointerId)
	if (!props.editor.getCurrentPageShapeIds().size) return

	const { clientX: x, clientY: y } = event

	pointing = true
	activePointerId = event.pointerId
	originScreenPoint = new Vec(x, y)
	minimap.isInViewport = false

	const point = minimap.minimapScreenPointToPagePoint(x, y, false, false)
	const viewportPageBounds = props.editor.getViewportPageBounds()
	const commonBounds = minimap.getContentPageBounds()
	const allowedBounds = new Box(
		commonBounds.x - viewportPageBounds.width / 2,
		commonBounds.y - viewportPageBounds.height / 2,
		commonBounds.width + viewportPageBounds.width,
		commonBounds.height + viewportPageBounds.height
	)

	if (allowedBounds.containsPoint(point) && !viewportPageBounds.containsPoint(point)) {
		const delta = Vec.Sub(viewportPageBounds.center, viewportPageBounds.point)
		const pagePoint = Vec.Add(point, delta)
		minimap.originPagePoint.setTo(pagePoint)
		minimap.originPageCenter.setTo(point)
		props.editor.centerOnPoint(point, {
			animation: { duration: props.editor.options.animationMediumMs },
		})
	} else {
		const clampedPoint = minimap.minimapScreenPointToPagePoint(x, y, false, true)
		minimap.isInViewport = viewportPageBounds.containsPoint(clampedPoint)
		minimap.originPagePoint.setTo(clampedPoint)
		minimap.originPageCenter.setTo(viewportPageBounds.center)
	}

	const body = props.editor.getContainerDocument().body
	const endDrag = () => {
		if (activePointerId !== null && elem.hasPointerCapture(activePointerId)) {
			elem.releasePointerCapture(activePointerId)
		}

		pointing = false
		activePointerId = null
		body.removeEventListener('pointerup', endDrag)
		body.removeEventListener('pointercancel', endDrag)
		body.removeEventListener('contextmenu', endDrag, true)
	}

	body.addEventListener('pointerup', endDrag)
	body.addEventListener('pointercancel', endDrag)
	body.addEventListener('contextmenu', endDrag, true)
}

function onPointerMove(event: PointerEvent) {
	event.preventDefault()
	event.stopPropagation()

	if (!minimap) return

	const { clientX: x, clientY: y } = event
	const point = minimap.minimapScreenPointToPagePoint(x, y, event.shiftKey, true)

	if (!pointing) return

	if (Vec.Dist2(originScreenPoint, new Vec(x, y)) <= CLICK_JITTER_THRESHOLD_SQ) {
		return
	}

	if (minimap.isInViewport) {
		const delta = minimap.originPagePoint.clone().sub(minimap.originPageCenter)
		centerOnPoint(Vec.Sub(point, delta))
		return
	}

	centerOnPoint(point)
}

function onWheel(event: WheelEvent) {
	event.preventDefault()
	event.stopPropagation()

	const currentCamera = props.editor.getCamera()

	if (event.ctrlKey || event.metaKey) {
		const point = props.editor.getViewportScreenCenter()
		const nextZoom = clampZoom(currentCamera.z * (event.deltaY > 0 ? 0.9 : 1.1))
		props.editor.run(() => {
			props.editor.setCamera(getZoomedCamera(currentCamera, nextZoom, point), { immediate: true })
		}, { history: 'ignore' })
		return
	}

	props.editor.run(() => {
		props.editor.setCamera(
			{
				x: currentCamera.x - event.deltaX / currentCamera.z,
				y: currentCamera.y - event.deltaY / currentCamera.z,
				z: currentCamera.z,
			},
			{ immediate: true }
		)
	}, { history: 'ignore' })
}

function centerOnPoint(point: Vec) {
	props.editor.run(() => {
		props.editor.centerOnPoint(point, { immediate: true })
	}, { history: 'ignore' })
}

function clampZoom(zoom: number) {
	const cameraOptions = props.editor.getCameraOptions()
	const baseZoom = props.editor.getBaseZoom()
	const minZoom = cameraOptions.zoomSteps[0] * baseZoom
	const maxZoom = cameraOptions.zoomSteps[cameraOptions.zoomSteps.length - 1] * baseZoom
	return Math.min(maxZoom, Math.max(minZoom, zoom))
}

function getZoomedCamera(camera: TLCamera, nextZoom: number, point: Vec) {
	return new Vec(
		camera.x + (point.x / nextZoom - point.x) - (point.x / camera.z - point.x),
		camera.y + (point.y / nextZoom - point.y) - (point.y / camera.z - point.y),
		nextZoom
	)
}

onMounted(() => {
	const canvas = canvasRef.value
	if (!canvas) return

	minimap = new MinimapManager(props.editor, canvas, props.editor.getContainer())
	minimap.render()
})

onBeforeUnmount(() => {
	minimap?.close()
	minimap = null
})
</script>

<template>
	<div class="vue-minimap">
		<canvas
			ref="canvasRef"
			role="img"
			aria-label="Minimap"
			class="vue-minimap__canvas"
			@dblclick="onDoubleClick"
			@pointerdown="onPointerDown"
			@pointermove="onPointerMove"
			@wheel="onWheel"
		/>
	</div>
</template>
