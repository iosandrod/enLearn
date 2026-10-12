<script setup lang="ts">
import type { Editor } from '@tldraw/editor'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getEditorPrintDataSource } from '@/editor/workspaceDataSource'
import { buildPrintDataSourceTree, PRINT_DATA_SOURCE_FIELD_MIME, type PrintDataSourceTreeNode } from '@/editor/printDataSourceFields'

const props = defineProps<{ editor: Editor }>()
const emit = defineEmits<{ configure: []; 'before-drag': []; 'drawer-open': [] }>()
const source = getEditorPrintDataSource(props.editor)
const expanded = ref(true)
const isMobile = ref(typeof window !== 'undefined' && window.matchMedia('(max-width: 1024px)').matches)
const mobileOpen = ref(false)
const mobileDragging = ref(false)
const mobileTrigger = ref<HTMLButtonElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
let mediaQuery: MediaQueryList | null = null

function syncViewport() {
	isMobile.value = mediaQuery?.matches ?? false
	mobileOpen.value = false
	mobileDragging.value = false
}

function openMobileDrawer() {
	mobileOpen.value = true
	emit('drawer-open')
}

function closeMobileDrawer(restoreFocus = false) {
	mobileOpen.value = false
	if (restoreFocus) mobileTrigger.value?.focus({ preventScroll: true })
}

function configure() {
	closeMobileDrawer()
	emit('configure')
}

function onKeyDown(event: KeyboardEvent) {
	if (!isMobile.value || !mobileOpen.value) return
	if (event.key === 'Escape') closeMobileDrawer(true)
	if (event.key === 'Tab') {
		const panel = closeButton.value?.closest('section')
		const buttons = panel ? [...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')] : []
		const first = buttons[0]
		const last = buttons.at(-1)
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault()
			last?.focus()
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault()
			first?.focus()
		}
	}
}

onMounted(() => {
	mediaQuery = window.matchMedia('(max-width: 1024px)')
	syncViewport()
	mediaQuery.addEventListener('change', syncViewport)
	window.addEventListener('keydown', onKeyDown)
})
onBeforeUnmount(() => {
	mediaQuery?.removeEventListener('change', syncViewport)
	window.removeEventListener('keydown', onKeyDown)
})

defineExpose({ closeMobileDrawer })
const collapsedKeys = ref(new Set<string>())
const tree = computed(() => buildPrintDataSourceTree(source.value))
const rows = computed(() => {
	const result: Array<{ node: PrintDataSourceTreeNode; depth: number }> = []
	function visit(nodes: PrintDataSourceTreeNode[], depth: number) {
		for (const node of nodes) {
			result.push({ node, depth })
			if (node.children && !collapsedKeys.value.has(node.key)) visit(node.children, depth + 1)
		}
	}
	visit(tree.value, 0)
	return result
})

function toggleNode(key: string) {
	const next = new Set(collapsedKeys.value)
	if (next.has(key)) next.delete(key)
	else next.add(key)
	collapsedKeys.value = next
}

function startDrag(event: DragEvent, path?: string) {
	if (!path || !event.dataTransfer || props.editor.getIsReadonly()) {
		event.preventDefault()
		return
	}
	emit('before-drag')
	mobileDragging.value = isMobile.value
	event.dataTransfer.effectAllowed = 'copy'
	event.dataTransfer.setData(PRINT_DATA_SOURCE_FIELD_MIME, path)
	event.dataTransfer.setData('text/plain', `{{${path}}}`)
}

function onDragLeave(event: DragEvent) {
	if (!isMobile.value || !mobileDragging.value || !mobileOpen.value) return
	const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
	if (event.clientX < bounds.left || event.clientX >= bounds.right || event.clientY < bounds.top || event.clientY >= bounds.bottom) {
		closeMobileDrawer()
	}
}
</script>

<template>
	<button v-if="isMobile" ref="mobileTrigger" type="button" class="data-source-tree-mobile-toggle"
		:aria-expanded="mobileOpen" aria-label="打开数据源字段抽屉" @click="openMobileDrawer">数据源</button>
	<button v-if="isMobile && mobileOpen" class="data-source-tree-mobile-backdrop" type="button"
		aria-label="关闭数据源字段抽屉" tabindex="-1" @click="closeMobileDrawer(true)" />
	<section class="data-source-tree-panel" :class="{ 'is-collapsed': !expanded && !isMobile, 'is-mobile-open': mobileOpen, 'is-mobile-dragging': mobileDragging }"
		:role="isMobile ? 'dialog' : 'region'" :aria-modal="isMobile && mobileOpen ? true : undefined"
		:aria-hidden="isMobile && !mobileOpen ? true : undefined" :inert="isMobile && !mobileOpen && !mobileDragging"
		aria-label="数据源字段面板" @dragleave="onDragLeave">
		<header class="data-source-tree-panel__header">
			<button type="button" class="data-source-tree-panel__toggle" :aria-expanded="expanded || isMobile" @click="!isMobile && (expanded = !expanded)">
				<span v-if="!isMobile" aria-hidden="true">{{ expanded ? '▾' : '▸' }}</span> 数据源
			</button>
			<button type="button" class="data-source-tree-panel__configure" @click="configure">配置</button>
			<button v-if="isMobile" ref="closeButton" type="button" class="data-source-tree-panel__close"
				aria-label="关闭数据源字段抽屉" @click="closeMobileDrawer(true)">×</button>
		</header>
		<div v-if="expanded || isMobile" class="data-source-tree-panel__body">
			<p class="data-source-tree-panel__hint">拖到画板新增文字，拖到节点追加字段</p>
			<div v-if="rows.length" role="tree" aria-label="数据源字段树">
				<button v-for="{ node, depth } in rows" :key="node.key" type="button" role="treeitem"
					class="data-source-tree-panel__row" :class="{ 'is-field': node.path }"
					:style="{ paddingLeft: `${10 + depth * 16}px` }" :aria-level="depth + 1"
					:aria-expanded="node.children ? !collapsedKeys.has(node.key) : undefined"
					:draggable="Boolean(node.path)" :data-source-field="node.path"
					:title="node.path ? `拖动绑定：{{${node.path}}}` : node.label"
					@click="node.children && toggleNode(node.key)" @dragstart="startDrag($event, node.path)" @dragend="mobileDragging = false">
					<span class="data-source-tree-panel__icon" aria-hidden="true">{{ node.children ? (collapsedKeys.has(node.key) ? '▸' : '▾') : 'T' }}</span>
					<span class="data-source-tree-panel__label">{{ node.label }}</span>
					<small v-if="node.path">{{ node.path }}</small>
				</button>
			</div>
			<p v-else class="data-source-tree-panel__empty">暂无字段，请先配置数据源</p>
		</div>
	</section>
</template>
