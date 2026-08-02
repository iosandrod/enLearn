<script setup lang="ts">
import type { TLCamera } from '@tldraw/editor'
import { computed, ref } from 'vue'
import type { GuideAxis } from '@/editor/interactions/guides'
import type {
	WorkspaceBoundsManager,
	WorkspaceViewportSize,
} from '@/editor/interactions/WorkspaceBoundsManager'

const props = withDefaults(
	defineProps<{
		camera: TLCamera
		viewport: WorkspaceViewportSize
		workspaceBounds: WorkspaceBoundsManager
		workspaceRevision?: number
		rulerSize?: number
	}>(),
	{
		rulerSize: 28,
	}
)

const emit = defineEmits<{
	'guide-create': [guide: { axis: GuideAxis; position: number }]
}>()

const overlayRef = ref<HTMLDivElement | null>(null)

const majorStepMm = computed(() => {
	props.workspaceRevision
	return props.workspaceBounds.getRulerMajorStepMm(props.camera)
})
const topTicks = computed(() => {
	props.workspaceRevision
	return props.workspaceBounds.getRulerTicks(
		'x',
		props.camera,
		props.viewport,
		props.rulerSize,
		majorStepMm.value
	)
})
const leftTicks = computed(() => {
	props.workspaceRevision
	return props.workspaceBounds.getRulerTicks(
		'y',
		props.camera,
		props.viewport,
		props.rulerSize,
		majorStepMm.value
	)
})

function onRulerPointerDown(axis: GuideAxis, event: PointerEvent) {
	if (event.button !== 0 || props.camera.z <= 0) return
	const bounds = overlayRef.value?.getBoundingClientRect()
	if (!bounds) return

	const localX = event.clientX - bounds.left
	const localY = event.clientY - bounds.top
	const position = axis === 'x' ? localX / props.camera.z - props.camera.x : localY / props.camera.z - props.camera.y
	emit('guide-create', { axis, position })
}
</script>

<template>
	<div
		ref="overlayRef"
		class="ruler-overlay"
		:style="{ '--ruler-size': `${rulerSize}px` }"
		aria-label="Canvas rulers"
	>
		<div class="ruler-corner" />
		<div
			class="ruler ruler--x"
			title="Add vertical guide"
			@pointerdown.stop.prevent="onRulerPointerDown('x', $event)"
		>
			<template v-for="tick in topTicks" :key="tick.id">
				<div
					class="ruler-tick"
					:class="`ruler-tick--${tick.strength}`"
					:style="{ left: `${tick.position}px` }"
				/>
				<span
					v-if="tick.label"
					class="ruler-label ruler-label--x"
					:style="{ left: `${tick.position}px` }"
				>
					{{ tick.label }}
				</span>
			</template>
		</div>
		<div
			class="ruler ruler--y"
			title="Add horizontal guide"
			@pointerdown.stop.prevent="onRulerPointerDown('y', $event)"
		>
			<template v-for="tick in leftTicks" :key="tick.id">
				<div
					class="ruler-tick"
					:class="`ruler-tick--${tick.strength}`"
					:style="{ top: `${tick.position}px` }"
				/>
				<span
					v-if="tick.label"
					class="ruler-label ruler-label--y"
					:style="{ top: `${tick.position}px` }"
				>
					{{ tick.label }}
				</span>
			</template>
		</div>
	</div>
</template>
