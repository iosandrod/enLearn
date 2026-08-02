<script setup lang="ts">
import type { Editor } from '@tldraw/editor'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import VueBottomToolbar from './components/VueBottomToolbar.vue'
import VueCanvas from './components/VueCanvas.vue'
import VueComponentPalette from './components/VueComponentPalette.vue'
import VueNavigationPanel from './components/VueNavigationPanel.vue'
import VueStylePanel from './components/VueStylePanel.vue'
import VueTopLeftMenu from './components/VueTopLeftMenu.vue'
import { createVueEditor } from './editor/createVueEditor'
import { getDefaultVueEditorExtensions } from './editor/extensions/defaultExtensions'
import type { CanvasTool, VueGeoShape } from './editor/interactions/types'
import type {
	VueTemplateLoadHandler,
	VueTemplateSaveHandler,
	VueTemplateWorkspaceConfig,
} from './editor/templateStore'
import {
	createVueEditorExtensionRegistry,
	type VueEditorExtension,
} from './editor/vueEditorExtensions'
import {
	createVueEditorPluginRegistry,
	VueEditorPluginHost,
	type VueEditorPlugin,
} from './editor/vuePlugins'

const props = withDefaults(
	defineProps<{
		extensions?: readonly VueEditorExtension[]
		plugins?: readonly VueEditorPlugin[]
		createDefaultShapes?: boolean
		loadTemplates?: VueTemplateLoadHandler
		saveTemplates?: VueTemplateSaveHandler
	}>(),
	{
		createDefaultShapes: true,
	}
)

const emit = defineEmits<{
	ready: [editor: Editor]
	'workspace-config-change': [config: VueTemplateWorkspaceConfig]
}>()

const editorHost = ref<HTMLDivElement | null>(null)
const canvasRef = ref<{
	applyWorkspaceTemplateConfig(config: VueTemplateWorkspaceConfig): void
	cancelToolbarDrag(event: PointerEvent): void
	closeContextMenu(): void
	endToolbarDrag(event: PointerEvent): void
	getWorkspaceTemplateConfig(): VueTemplateWorkspaceConfig
	isContextMenuOpen(): boolean
	moveToolbarDrag(event: PointerEvent): void
	startToolbarDrag(tool: CanvasTool, geoShape: VueGeoShape | undefined, event: PointerEvent): void
} | null>(null)
const topMenuRef = ref<{ closeMenus(): void } | null>(null)
const bottomToolbarRef = ref<{ closeMenus(): void } | null>(null)
const editor = shallowRef<Editor | null>(null)
const activeTool = ref<CanvasTool>('select')
const currentGeoShape = ref<VueGeoShape>('rectangle')
const isCompactLayout = ref(false)
let pluginHost: VueEditorPluginHost | null = null
let hostResizeObserver: ResizeObserver | null = null

const pluginRegistry = computed(() => createVueEditorPluginRegistry(props.plugins ?? []))
const editorExtensions = computed(() => [
	...(props.extensions ?? getDefaultVueEditorExtensions()),
	...pluginRegistry.value.extensions,
])
const toolbarTools = computed(
	() => createVueEditorExtensionRegistry(editorExtensions.value).toolbarTools
)

function updateLayoutMode() {
	const host = editorHost.value
	if (!host) return
	isCompactLayout.value = host.clientWidth < 1320 || host.clientHeight < 760
}

function mountEditor(el: HTMLDivElement) {
	if (editor.value) return
	const nextEditor = createVueEditor(el, {
		createDefaultShapes: props.createDefaultShapes,
		extensions: editorExtensions.value,
	})
	editor.value = nextEditor
	pluginHost = new VueEditorPluginHost(pluginRegistry.value, {
		editor: nextEditor,
		getContainer: () => editorHost.value,
		getWorkspaceTemplateConfig,
		applyWorkspaceTemplateConfig,
	})
	pluginHost.setup()
	emit('ready', nextEditor)
}

function selectTool(tool: CanvasTool, geoShape?: VueGeoShape) {
	canvasRef.value?.closeContextMenu()
	topMenuRef.value?.closeMenus()
	bottomToolbarRef.value?.closeMenus()
	activeTool.value = tool
	if (geoShape) {
		currentGeoShape.value = geoShape
	}
}

function closeContextAndTopMenus() {
	canvasRef.value?.closeContextMenu()
	topMenuRef.value?.closeMenus()
}

function startToolbarDrag(tool: CanvasTool, geoShape: VueGeoShape | undefined, event: PointerEvent) {
	canvasRef.value?.closeContextMenu()
	topMenuRef.value?.closeMenus()
	bottomToolbarRef.value?.closeMenus()
	canvasRef.value?.startToolbarDrag(tool, geoShape, event)
}

function moveToolbarDrag(event: PointerEvent) {
	canvasRef.value?.moveToolbarDrag(event)
}

function endToolbarDrag(event: PointerEvent) {
	canvasRef.value?.endToolbarDrag(event)
}

function cancelToolbarDrag(event: PointerEvent) {
	canvasRef.value?.cancelToolbarDrag(event)
}

function onKeyDown(event: KeyboardEvent) {
	if (event.defaultPrevented) return

	if (canvasRef.value?.isContextMenuOpen()) {
		event.preventDefault()
		if (event.key === 'Escape') {
			canvasRef.value.closeContextMenu()
			topMenuRef.value?.closeMenus()
		}
		return
	}

	if (event.key === 'Escape') {
		topMenuRef.value?.closeMenus()
		return
	}
}

function getEditor() {
	return editor.value
}

function getWorkspaceTemplateConfig() {
	return canvasRef.value?.getWorkspaceTemplateConfig()
}

function applyWorkspaceTemplateConfig(config: VueTemplateWorkspaceConfig) {
	canvasRef.value?.applyWorkspaceTemplateConfig(config)
}

function handlePluginShortcut(event: KeyboardEvent) {
	return pluginHost?.handleKeyDown(event) ?? false
}

function canRunCommand(commandId: string) {
	return pluginHost?.canRunCommand(commandId) ?? false
}

function runCommand(commandId: string, event?: Event) {
	return pluginHost?.runCommand(commandId, event) ?? Promise.resolve(false)
}

function getPluginIds() {
	return pluginHost?.getPluginIds() ?? []
}

defineExpose({
	editor,
	applyWorkspaceTemplateConfig,
	canRunCommand,
	getEditor,
	getPluginIds,
	getWorkspaceTemplateConfig,
	runCommand,
})

onMounted(() => {
	if (editorHost.value) {
		updateLayoutMode()
		hostResizeObserver = new ResizeObserver(updateLayoutMode)
		hostResizeObserver.observe(editorHost.value)
		mountEditor(editorHost.value)
	}
	window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
	window.removeEventListener('keydown', onKeyDown)
	hostResizeObserver?.disconnect()
	hostResizeObserver = null
	pluginHost?.dispose()
	pluginHost = null
	editor.value?.dispose()
})
</script>

<template>
	<main class="app-shell">
		<section ref="editorHost" class="editor-host">
			<VueCanvas
				v-if="editor"
				ref="canvasRef"
				:editor="editor"
				:active-tool="activeTool"
				:current-geo-shape="currentGeoShape"
				:handle-shortcut="handlePluginShortcut"
				:toolbar-tools="toolbarTools"
				@tool-change="selectTool"
				@workspace-config-change="emit('workspace-config-change', $event)"
			/>
			<VueBottomToolbar
				v-if="editor"
				ref="bottomToolbarRef"
				:editor="editor"
				:active-tool="activeTool"
				:current-geo-shape="currentGeoShape"
				:toolbar-tools="toolbarTools"
				@before-action="closeContextAndTopMenus"
				@tool-select="selectTool"
				@tool-drag-cancel="cancelToolbarDrag"
				@tool-drag-end="endToolbarDrag"
				@tool-drag-move="moveToolbarDrag"
				@tool-drag-start="startToolbarDrag"
			/>
			<VueComponentPalette
				v-if="editor"
				:active-tool="activeTool"
				:compact="isCompactLayout"
				:current-geo-shape="currentGeoShape"
				:toolbar-tools="toolbarTools"
				@before-action="closeContextAndTopMenus"
				@tool-select="selectTool"
				@tool-drag-cancel="cancelToolbarDrag"
				@tool-drag-end="endToolbarDrag"
				@tool-drag-move="moveToolbarDrag"
				@tool-drag-start="startToolbarDrag"
			/>
			<VueTopLeftMenu
				v-if="editor"
				ref="topMenuRef"
				:editor="editor"
				:can-run-command="canRunCommand"
				:get-workspace-template-config="canvasRef?.getWorkspaceTemplateConfig"
				:load-templates="props.loadTemplates"
				:apply-workspace-template-config="canvasRef?.applyWorkspaceTemplateConfig"
				:save-templates="props.saveTemplates"
				@before-action="canvasRef?.closeContextMenu()"
			/>
			<VueNavigationPanel
				v-if="editor"
				:editor="editor"
				@before-action="closeContextAndTopMenus"
			/>
			<VueStylePanel v-if="editor" :compact="isCompactLayout" :editor="editor" />
		</section>
	</main>
</template>
