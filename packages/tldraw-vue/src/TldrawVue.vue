<script setup lang="ts">
import type { Editor } from '@tldraw/editor'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import VueBottomToolbar from './components/VueBottomToolbar.vue'
import VueCanvas from './components/VueCanvas.vue'
import VueComponentPalette from './components/VueComponentPalette.vue'
import VueDataSourcePanel from './components/VueDataSourcePanel.vue'
import VueAnimationPanel from './components/VueAnimationPanel.vue'
import VueBackgroundPanel from './components/VueBackgroundPanel.vue'
import VuePresentationPages from './components/VuePresentationPages.vue'
import VuePresentationPreview from './components/VuePresentationPreview.vue'
import VueLayersPanel from './components/VueLayersPanel.vue'
import LowCodeFormPanel from './components/LowCodeFormPanel.vue'
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
	WorkspaceBackgroundConfig,
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
import {
	clonePresentationConfig,
	DEFAULT_PRESENTATION_CONFIG,
	type DesignerMode,
	type PresentationConfig,
} from './presentation'

const props = withDefaults(
	defineProps<{
		extensions?: readonly VueEditorExtension[]
		plugins?: readonly VueEditorPlugin[]
		createDefaultShapes?: boolean
		loadTemplates?: VueTemplateLoadHandler
		saveTemplates?: VueTemplateSaveHandler
		showTemplateControls?: boolean
		mode?: DesignerMode
		showModeControls?: boolean
	}>(),
	{
		createDefaultShapes: true,
		showTemplateControls: true,
		mode: 'print',
		showModeControls: false,
	}
)

const emit = defineEmits<{
	ready: [editor: Editor]
	'content-change': []
	'workspace-config-change': [config: VueTemplateWorkspaceConfig]
	'mode-change': [mode: DesignerMode]
}>()

const editorHost = ref<HTMLDivElement | null>(null)
const designerStage = ref<HTMLDivElement | null>(null)
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
const topMenuRef = ref<{
	closeMenus(): void
	previewPrint(): Promise<void>
	printCurrentPage(): Promise<void>
} | null>(null)
const bottomToolbarRef = ref<{ closeMenus(): void } | null>(null)
const editor = shallowRef<Editor | null>(null)
const activeTool = ref<CanvasTool>('select')
const currentGeoShape = ref<VueGeoShape>('rectangle')
const activeDesignerTab = ref<
	'tools' | 'components' | 'layers' | 'dataSource' | 'properties' | 'style' | 'background' | 'animation'
>('tools')
const designerMode = ref<DesignerMode>(props.mode)
const presentationConfig = ref<PresentationConfig>(clonePresentationConfig(DEFAULT_PRESENTATION_CONFIG))
const workspaceBackground = ref<WorkspaceBackgroundConfig>({
	color: '#ffffff',
	imageUrl: '',
	imageSize: 'cover',
	imagePosition: 'center',
})
const presentationPreviewOpen = ref(false)
const designerTabs = [
	{ id: 'tools', label: '工具', icon: '✦' },
	{ id: 'components', label: '组件', icon: '◇' },
	{ id: 'layers', label: '图层', icon: '▱' },
	{ id: 'dataSource', label: '数据源', icon: '▤' },
	{ id: 'properties', label: '属性', icon: '⚙' },
	{ id: 'style', label: '样式', icon: '◐' },
	{ id: 'background', label: '背景', icon: '▧' },
	{ id: 'animation', label: '动画', icon: '▶' },
] as const
const workspaceRevision = ref(0)
let pluginHost: VueEditorPluginHost | null = null
let stopEditorChangeListener: (() => void) | null = null

const pluginRegistry = computed(() => createVueEditorPluginRegistry(props.plugins ?? []))
const editorExtensions = computed(() => [
	...(props.extensions ?? getDefaultVueEditorExtensions()),
	...pluginRegistry.value.extensions,
])
const toolbarTools = computed(
	() => createVueEditorExtensionRegistry(editorExtensions.value).toolbarTools
)

function mountEditor(el: HTMLDivElement) {
	if (editor.value) return
	const nextEditor = createVueEditor(el, {
		createDefaultShapes: props.createDefaultShapes,
		extensions: editorExtensions.value,
	})
	editor.value = nextEditor
	stopEditorChangeListener = nextEditor.store.listen(
		() => emit('content-change'),
		{ source: 'user', scope: 'document' }
	)
	pluginHost = new VueEditorPluginHost(pluginRegistry.value, {
		editor: nextEditor,
		getContainer: () => designerStage.value ?? editorHost.value,
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

function cloneTemplateValue<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

async function getTemplateInfo() {
	const currentEditor = editor.value
	if (!currentEditor) return null

	const currentPageId = currentEditor.getCurrentPageId()
	const pages = [] as Array<{ id: string; name: string; content: unknown }>
	for (const page of currentEditor.getPages()) {
		const shapeIds = [...currentEditor.getPageShapeIds(page.id)].sort()
		const pageContent = currentEditor.getContentFromCurrentPage(shapeIds, page.id)
		const resolvedContent = await currentEditor.resolveAssetsInContent(pageContent)
		if (!resolvedContent) continue
		pages.push({
			id: page.id,
			name: page.name,
			content: cloneTemplateValue(resolvedContent),
		})
	}

	if (!pages.length) return null

	const workspace = cloneTemplateValue(getWorkspaceTemplateConfig() ?? {})
	return {
		content: {
			pages: cloneTemplateValue(pages),
			currentPageId,
			workspace,
		},
		pages: cloneTemplateValue(pages),
		currentPageId,
		workspace,
	}
}

function getWorkspaceTemplateConfig() {
	const config = canvasRef.value?.getWorkspaceTemplateConfig()
	return {
		...(config ?? {}),
		designerMode: designerMode.value,
		presentation: clonePresentationConfig(presentationConfig.value),
	}
}

function applyWorkspaceTemplateConfig(config: VueTemplateWorkspaceConfig) {
	if (config.designerMode === 'print' || config.designerMode === 'presentation') {
		designerMode.value = config.designerMode
		notifyDesignerModeState(config.designerMode)
	}
	if (config.presentation) {
		presentationConfig.value = {
			...clonePresentationConfig(DEFAULT_PRESENTATION_CONFIG),
			...clonePresentationConfig(config.presentation),
		}
	}
	if (config.background) {
		workspaceBackground.value = {
			...workspaceBackground.value,
			...config.background,
			imageUrl: config.background.imageUrl ?? '',
		}
	}
	canvasRef.value?.applyWorkspaceTemplateConfig(config)
}

function handleWorkspaceConfigChange(config: VueTemplateWorkspaceConfig) {
	workspaceRevision.value += 1
	if (config.background) {
		workspaceBackground.value = {
			...workspaceBackground.value,
			...config.background,
			imageUrl: config.background.imageUrl ?? '',
		}
	}
	emit('workspace-config-change', {
		...config,
		designerMode: designerMode.value,
		presentation: clonePresentationConfig(presentationConfig.value),
	})
}

function updateWorkspaceBackground(background: WorkspaceBackgroundConfig) {
	workspaceBackground.value = { ...background }
	canvasRef.value?.applyWorkspaceTemplateConfig({ background: { ...background } })
}

function setDesignerMode(mode: DesignerMode) {
	if (designerMode.value === mode) return
	designerMode.value = mode
	if (mode === 'presentation' && presentationConfig.value.pageSizeMm) {
		canvasRef.value?.applyWorkspaceTemplateConfig({ pageSizeMm: presentationConfig.value.pageSizeMm })
	}
	emit('mode-change', mode)
	notifyDesignerModeState(mode)
	handleWorkspaceConfigChange(getWorkspaceTemplateConfig() ?? {})
}

function togglePresentationPreview() {
	presentationPreviewOpen.value = true
}

function notifyDesignerModeState(mode: DesignerMode) {
	if (typeof window === 'undefined') return
	window.dispatchEvent(new CustomEvent('enlearn:print-designer-mode-state', {
		detail: { mode },
	}))
}

function handleExternalDesignerModeChange(event: Event) {
	const mode = (event as CustomEvent<{ mode?: unknown }>).detail?.mode
	if (mode === 'print' || mode === 'presentation') setDesignerMode(mode)
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

function previewPrint() {
	return topMenuRef.value?.previewPrint() ?? Promise.resolve()
}

function printCurrentPage() {
	return topMenuRef.value?.printCurrentPage() ?? Promise.resolve()
}

function getPluginIds() {
	return pluginHost?.getPluginIds() ?? []
}

defineExpose({
	editor,
	applyWorkspaceTemplateConfig,
	canRunCommand,
	getEditor,
	getTemplateInfo,
	getPluginIds,
	getWorkspaceTemplateConfig,
	getDesignerMode: () => designerMode.value,
	setDesignerMode,
	runCommand,
	previewPrint,
	printCurrentPage,
})

onMounted(() => {
	if (designerStage.value) {
		mountEditor(designerStage.value)
	}
	window.addEventListener('keydown', onKeyDown)
	window.addEventListener('enlearn:print-designer-mode-change', handleExternalDesignerModeChange)
	notifyDesignerModeState(designerMode.value)
})

onBeforeUnmount(() => {
	window.removeEventListener('keydown', onKeyDown)
	window.removeEventListener('enlearn:print-designer-mode-change', handleExternalDesignerModeChange)
	stopEditorChangeListener?.()
	stopEditorChangeListener = null
	pluginHost?.dispose()
	pluginHost = null
	editor.value?.dispose()
})
</script>

<template>
	<main class="app-shell" :class="{ 'has-mode-toolbar': props.showModeControls }">
		<header v-if="props.showModeControls" class="designer-mode-toolbar">
			<div class="designer-mode-switch" role="tablist" aria-label="设计模式">
				<button type="button" :class="{ 'is-active': designerMode === 'print' }" @click="setDesignerMode('print')">打印设计</button>
				<button type="button" :class="{ 'is-active': designerMode === 'presentation' }" @click="setDesignerMode('presentation')">PPT 设计</button>
			</div>
			<div v-if="designerMode === 'presentation'" class="designer-mode-actions">
				<button type="button" title="预览当前演示文稿" @click="togglePresentationPreview">▶ 预览</button>
			</div>
		</header>
		<section
			ref="editorHost"
			class="editor-host flex flex-row w-full"
			:class="{
			}"
		>
			<div style="width:350px;" class="designer-side-panel" aria-label="设计器工具面板">
				<nav class="designer-side-tabs" aria-label="设计器功能分类">
					<button
						v-for="tab in designerTabs"
						v-show="tab.id !== 'animation' || designerMode === 'presentation'"
						:key="tab.id"
						type="button"
						class="designer-side-tab"
						:class="{ 'is-active': activeDesignerTab === tab.id }"
						:aria-selected="activeDesignerTab === tab.id"
						@click="activeDesignerTab = tab.id"
					>
						<span class="designer-side-tab__icon" aria-hidden="true">{{ tab.icon }}</span>
						<span>{{ tab.label }}</span>
					</button>
				</nav>
				<div class="designer-side-content">
					<div v-show="activeDesignerTab === 'tools'" class="designer-tool-view designer-tool-view--tools">
						<section class="designer-tool-section" aria-label="绘制工具">
							<h2 class="designer-tool-section__title">绘制工具</h2>
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
							<VueTopLeftMenu
								v-if="editor"
								ref="topMenuRef"
								:editor="editor"
								:can-run-command="canRunCommand"
								:get-workspace-template-config="getWorkspaceTemplateConfig"
								:load-templates="props.loadTemplates"
								:apply-workspace-template-config="applyWorkspaceTemplateConfig"
								:save-templates="props.saveTemplates"
								:show-template-controls="props.showTemplateControls"
								embedded
								@before-action="canvasRef?.closeContextMenu()"
							/>
						</section>
					</div>
					<div v-show="activeDesignerTab === 'components'" class="designer-tool-view">
						<VueComponentPalette
							v-if="editor"
							:active-tool="activeTool"
							:compact="false"
							:current-geo-shape="currentGeoShape"
							:toolbar-tools="toolbarTools"
							@before-action="closeContextAndTopMenus"
							@tool-select="selectTool"
							@tool-drag-cancel="cancelToolbarDrag"
							@tool-drag-end="endToolbarDrag"
							@tool-drag-move="moveToolbarDrag"
							@tool-drag-start="startToolbarDrag"
						/>
					</div>
					<div v-show="activeDesignerTab === 'layers'" class="designer-tool-view designer-tool-view--layers">
						<VueLayersPanel v-if="editor" :editor="editor" />
					</div>
					<div v-show="activeDesignerTab === 'dataSource'" class="designer-tool-view designer-tool-view--data-source">
						<VueDataSourcePanel
							v-if="editor"
							:editor="editor"
							:workspace-revision="workspaceRevision"
							:get-workspace-template-config="canvasRef?.getWorkspaceTemplateConfig"
							:apply-workspace-template-config="canvasRef?.applyWorkspaceTemplateConfig"
						/>
					</div>
					<div v-show="activeDesignerTab === 'properties'" class="designer-tool-view designer-tool-view--properties">
						<LowCodeFormPanel
							v-if="editor"
							:editor="editor"
							:workspace-revision="workspaceRevision"
							:get-workspace-template-config="canvasRef?.getWorkspaceTemplateConfig"
							:apply-workspace-template-config="canvasRef?.applyWorkspaceTemplateConfig"
						/>
					</div>
					<div v-show="activeDesignerTab === 'style'" class="designer-tool-view">
						<VueStylePanel v-if="editor" :compact="false" :editor="editor" />
					</div>
					<div v-show="activeDesignerTab === 'background'" class="designer-tool-view">
						<VueBackgroundPanel
							:background="workspaceBackground"
							@update:background="updateWorkspaceBackground"
						/>
					</div>
					<div v-show="activeDesignerTab === 'animation'" class="designer-tool-view">
						<VueAnimationPanel v-if="editor && designerMode === 'presentation'" :editor="editor" />
					</div>
				</div>
			</div>
			<div style="flex:1;" ref="designerStage" class="designer-stage flex-1">
				<VueCanvas
					v-if="editor"
					ref="canvasRef"
					:editor="editor"
					:active-tool="activeTool"
					:current-geo-shape="currentGeoShape"
					:handle-shortcut="handlePluginShortcut"
					:toolbar-tools="toolbarTools"
					@tool-change="selectTool"
					@workspace-config-change="handleWorkspaceConfigChange"
				/>
				<VueNavigationPanel
					v-if="editor"
					:editor="editor"
					@before-action="closeContextAndTopMenus"
				>
					<template #presentation-pages>
						<VuePresentationPages
							v-if="designerMode === 'presentation'"
							class="presentation-pages--dock"
							:editor="editor"
							:page-size-mm="presentationConfig.pageSizeMm"
						/>
					</template>
				</VueNavigationPanel>
			</div>
		</section>
		<VuePresentationPreview
			v-if="editor && presentationPreviewOpen && designerMode === 'presentation'"
			:editor="editor"
			@close="presentationPreviewOpen = false"
		/>
	</main>
</template>
