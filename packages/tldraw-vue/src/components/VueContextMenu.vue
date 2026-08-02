<script setup lang="ts">
import type {
	ContextMenuActionId,
	ContextMenuSnapshot,
} from '@/editor/interactions/ContextMenuState'

defineProps<{
	snapshot: ContextMenuSnapshot
}>()

const emit = defineEmits<{
	action: [id: ContextMenuActionId]
	close: []
	contextmenu: [event: MouseEvent]
}>()

function onBackdropPointerDown(event: PointerEvent) {
	if (event.button === 2) return
	emit('close')
}

function onBackdropContextMenu(event: MouseEvent) {
	emit('contextmenu', event)
}

function onItemClick(id: ContextMenuActionId) {
	emit('action', id)
}
</script>

<template>
	<div class="context-menu-layer">
		<div
			class="context-menu-backdrop"
			@pointerdown.stop.prevent="onBackdropPointerDown"
			@contextmenu.stop.prevent="onBackdropContextMenu"
		/>
		<div
			class="context-menu"
			:style="{
				left: `${snapshot.position.x}px`,
				top: `${snapshot.position.y}px`,
			}"
			role="menu"
			aria-label="Context menu"
			@pointerdown.stop
			@contextmenu.stop.prevent
		>
			<template v-for="item in snapshot.items" :key="item.id">
				<div v-if="item.separatorBefore" class="context-menu-separator" />
				<button
					type="button"
					class="context-menu-item"
					:class="{ 'is-destructive': item.destructive }"
					:disabled="item.disabled"
					role="menuitem"
					@click.stop.prevent="onItemClick(item.id)"
				>
					<span class="context-menu-label">{{ item.label }}</span>
					<span v-if="item.shortcut" class="context-menu-shortcut">{{ item.shortcut }}</span>
				</button>
			</template>
		</div>
	</div>
</template>
