<script setup lang="ts">
import type {
	ContextMenuActionId,
	ContextMenuSnapshot,
} from '@/editor/interactions/ContextMenuState'
import { reactive } from 'vue'

defineProps<{
	snapshot: ContextMenuSnapshot
}>()

const emit = defineEmits<{
	action: [id: ContextMenuActionId]
	close: []
	contextmenu: [event: MouseEvent]
}>()

const submenuPositions = reactive<Record<string, { left: number; top: number }>>({})

function setSubmenuPosition(key: string, event: MouseEvent) {
	const wrapper = event.currentTarget as HTMLElement | null
	if (!wrapper) return
	const bounds = wrapper.getBoundingClientRect()
	submenuPositions[key] = {
		left: Math.max(4, bounds.right - 2),
		top: Math.max(4, bounds.top - 7),
	}
}

function getSubmenuStyle(key: string) {
	const position = submenuPositions[key]
	return position
		? { left: `${position.left}px`, top: `${position.top}px` }
		: undefined
}

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
			class="context-menu context-menu--root"
			:style="{
				left: `${snapshot.position.x}px`,
				top: `${snapshot.position.y}px`,
			}"
			role="menu"
			aria-label="画布操作菜单"
			@pointerdown.stop
			@contextmenu.stop.prevent
		>
			<template v-for="item in snapshot.items" :key="item.id">
				<div v-if="item.separatorBefore" class="context-menu-separator" />
				<div
					v-if="item.children?.length"
					class="context-menu-item-wrapper"
					@mouseenter="setSubmenuPosition(item.id, $event)"
				>
					<button
						type="button"
						class="context-menu-item"
						:class="{ 'is-destructive': item.destructive }"
						:disabled="item.disabled"
						role="menuitem"
						aria-haspopup="menu"
					>
						<span class="context-menu-label">{{ item.label }}</span>
						<span class="context-menu-chevron" aria-hidden="true">›</span>
					</button>
					<div
						class="context-menu context-menu--submenu"
						:style="getSubmenuStyle(item.id)"
						role="menu"
					>
						<template v-for="child in item.children" :key="child.id">
							<div
								v-if="child.children?.length"
								class="context-menu-item-wrapper"
								@mouseenter="setSubmenuPosition(`${item.id}/${child.id}`, $event)"
							>
								<button type="button" class="context-menu-item" :disabled="child.disabled" role="menuitem" aria-haspopup="menu">
									<span class="context-menu-label">{{ child.label }}</span>
									<span class="context-menu-chevron" aria-hidden="true">›</span>
								</button>
								<div
									class="context-menu context-menu--submenu context-menu--submenu-level-2"
									:style="getSubmenuStyle(`${item.id}/${child.id}`)"
									role="menu"
								>
									<button
										v-for="leaf in child.children"
										:key="leaf.id"
										type="button"
										class="context-menu-item"
										:disabled="leaf.disabled"
										role="menuitem"
										@click.stop.prevent="onItemClick(leaf.id)"
									>
										<span class="context-menu-label">{{ leaf.label }}</span>
									</button>
								</div>
							</div>
							<button
								v-else
								type="button"
								class="context-menu-item"
								:disabled="child.disabled"
								role="menuitem"
								@click.stop.prevent="onItemClick(child.id)"
							>
								<span class="context-menu-label">{{ child.label }}</span>
							</button>
						</template>
					</div>
				</div>
				<button
					v-else
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
