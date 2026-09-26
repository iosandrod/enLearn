<script setup lang="ts">
import type { Editor, TLContent, TLPageId, TLShapeId } from '@tldraw/editor'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { VxeUI } from 'vxe-pc-ui'
import {
	TopMenuController,
	type TopMenuGridActionId,
} from '@/editor/interactions/TopMenuController'
import { isVueMaterialShape } from '@/editor/extensions/material/vueMaterialShape'
import {
	getPrintDataSourceDetailColumns,
	getPrintDataSourceDetailRows,
} from '@/editor/dataSourceForm'
import {
	cloneVueTemplateContent,
	cloneVueTemplateRecord,
	cloneVueTemplateWorkspaceConfig,
	createVueTemplateMetadata,
	createVueTemplateRecord,
	normalizeVueTemplates,
	stripVueTemplateDocumentMetadata,
	readLocalVueTemplates,
	writeLocalVueTemplates,
	type VueTemplateLoadHandler,
	type VueTemplateRecord,
	type VueTemplateDocument,
	type VueTemplateSaveHandler,
	type VueTemplateWorkspaceConfig,
} from '@/editor/templateStore'
import {
	PrintManager,
	type PrintJobConfig,
	type PrintMaterialGridCollection,
	type PrintMaterialGridColumn,
	type PrintMaterialGridConfig,
	type PrintPageRenderResult,
} from '@/print'
import { useEditorValue } from '@/vue/useEditorValue'

const props = defineProps<{
	editor: Editor
	applyWorkspaceTemplateConfig?: (config: VueTemplateWorkspaceConfig) => void
	canRunCommand?: (commandId: string) => boolean
	embedded?: boolean
	getWorkspaceTemplateConfig?: () => VueTemplateWorkspaceConfig
	loadTemplates?: VueTemplateLoadHandler
	saveTemplates?: VueTemplateSaveHandler
	showTemplateControls?: boolean
}>()

const emit = defineEmits<{
	'before-action': []
}>()

const panelRef = ref<HTMLDivElement | null>(null)
const mainMenuOpen = ref(false)
const pageMenuOpen = ref(false)
const actionsMenuOpen = ref(false)
const templateMenuOpen = ref(false)
const openPageSubmenuId = ref<TLPageId | null>(null)
const templates = ref<VueTemplateRecord[]>([])
const templateError = ref<string | null>(null)
const isTemplateLoading = ref(false)
const isTemplateSaving = ref(false)
const printPreviewOpen = ref(false)
const printPreviewLoading = ref(false)
const printPreviewError = ref<string | null>(null)
const printPreviewPages = ref<PrintPageRenderResult[]>([])
const printPreviewPageIndex = ref(0)
const printPreviewModalSize = ref({
	width: 'min(920px, calc(100vw - 40px))',
	height: 'min(720px, calc(100vh - 40px))',
})
const embeddedPopoverStyle = ref<Record<string, string>>({})
let printPreviewResizeObserver: ResizeObserver | null = null

const controller = new TopMenuController(props.editor)

const PRINT_SAMPLE_ROWS = [] as any

const PRINT_MATERIAL_SAMPLE_COLUMNS: PrintMaterialGridColumn[] = [

] as any

const PRINT_MATERIAL_SAMPLE_ROWS = Array.from({ length: 23 }, (_, index) => {
	const no = index + 1

	return {}
})

const DEFAULT_PRINT_PAGE_SIZE_MM = { w: 80, h: 80 }
const DEFAULT_PRINT_PX_PER_MM = 10
const PRINT_PREVIEW_PAGE_SIZE = 3

type TemplatePageContent = { id: TLPageId; name: string; content: TLContent }
type TemplateDocumentContent = VueTemplateDocument

const currentPage = useEditorValue('top menu current page', () => props.editor.getCurrentPage())
const pages = useEditorValue('top menu pages', () => controller.getPages())
const canUndo = useEditorValue('top menu can undo', () => controller.getCanUndo())
const canRedo = useEditorValue('top menu can redo', () => controller.getCanRedo())
const hasSelection = useEditorValue('top menu has selection', () => controller.getHasSelection())
const hasShapesOnPage = useEditorValue(
	'top menu has shapes on page',
	() => props.editor.getCurrentPageShapeIds().size > 0
)
const gridActionGroups = useEditorValue('top menu grid actions', () => controller.getGridActionGroups())

const pageLabel = computed(() => currentPage.value.name || 'Page 1')
const hasReachedMaxPages = computed(() => pages.value.length >= props.editor.options.maxPages)
const canPreviewPrint = computed(() => props.canRunCommand?.('print.preview') ?? false)
const canPrint = computed(() => props.canRunCommand?.('print.print') ?? false)
const printPreviewPageCount = computed(() =>
	Math.max(1, Math.ceil(printPreviewPages.value.length / PRINT_PREVIEW_PAGE_SIZE))
)
const pagedPrintPreviewPages = computed(() => {
	const start = printPreviewPageIndex.value * PRINT_PREVIEW_PAGE_SIZE
	return printPreviewPages.value.slice(start, start + PRINT_PREVIEW_PAGE_SIZE)
})
const printPreviewPageLabel = computed(
	() => `${printPreviewPageIndex.value + 1} / ${printPreviewPageCount.value}`
)

async function showModalAlert(content: string, title = '提示') {
	await VxeUI.modal.confirm({
		title,
		content,
		mask: false,
		lockView: false,
	}).catch(() => false)
}

watch(pageMenuOpen, (open) => {
	if (!open) {
		openPageSubmenuId.value = null
	}
})

watch(printPreviewPageCount, (pageCount) => {
	if (printPreviewPageIndex.value >= pageCount) {
		printPreviewPageIndex.value = pageCount - 1
	}
})

function closeMenus() {
	mainMenuOpen.value = false
	pageMenuOpen.value = false
	actionsMenuOpen.value = false
	templateMenuOpen.value = false
	openPageSubmenuId.value = null
}

function updateEmbeddedPopoverPosition(event?: MouseEvent) {
	if (!props.embedded) {
		embeddedPopoverStyle.value = {}
		return
	}

	const anchor = event?.currentTarget
	const scrollContainer = panelRef.value?.closest('.designer-side-content')
	if (!(anchor instanceof HTMLElement) || !(scrollContainer instanceof HTMLElement) || !panelRef.value) return

	const anchorRect = anchor.getBoundingClientRect()
	const layoutHost = panelRef.value.closest('.designer-tool-section') ?? panelRef.value
	const panelRect = layoutHost.getBoundingClientRect()
	const containerRect = scrollContainer.getBoundingClientRect()
	const preferredHeight = Math.min(460, containerRect.height - 16)
	const preferredTop = anchorRect.bottom + 8
	const top = Math.max(
		containerRect.top + 8,
		Math.min(preferredTop, containerRect.bottom - preferredHeight - 8)
	)
	const maxHeight = Math.max(120, containerRect.bottom - top - 8)

	embeddedPopoverStyle.value = {
		position: 'fixed',
		top: `${Math.round(top)}px`,
		left: `${Math.round(panelRect.left)}px`,
		width: `${Math.round(panelRect.width)}px`,
		maxHeight: `${Math.round(maxHeight)}px`,
		overflowY: 'auto',
	}
}

function toggleMainMenu(event?: MouseEvent) {
	if (mainMenuOpen.value) {
		closeMenus()
		return
	}

	updateEmbeddedPopoverPosition(event)
	pageMenuOpen.value = false
	actionsMenuOpen.value = false
	templateMenuOpen.value = false
	mainMenuOpen.value = true
}

function togglePageMenu(event?: MouseEvent) {
	if (pageMenuOpen.value) {
		closeMenus()
		return
	}

	updateEmbeddedPopoverPosition(event)
	mainMenuOpen.value = false
	actionsMenuOpen.value = false
	templateMenuOpen.value = false
	pageMenuOpen.value = true
}

function toggleActionsMenu(event?: MouseEvent) {
	if (actionsMenuOpen.value) {
		closeMenus()
		return
	}

	updateEmbeddedPopoverPosition(event)
	mainMenuOpen.value = false
	pageMenuOpen.value = false
	templateMenuOpen.value = false
	actionsMenuOpen.value = true
}

function runAndClose(action: () => void) {
	emit('before-action')
	closeMenus()
	action()
}

function undo() {
	runAndClose(() => controller.undo())
}

function redo() {
	runAndClose(() => controller.redo())
}

function duplicateSelection() {
	runAndClose(() => controller.duplicateSelection())
}

function deleteSelection() {
	runAndClose(() => controller.deleteSelection())
}

function selectAll() {
	runAndClose(() => controller.selectAll())
}

function zoomTo100() {
	runAndClose(() => controller.navigation.zoomTo100())
}

function zoomToFit() {
	runAndClose(() => controller.navigation.zoomToFit())
}

function zoomToSelection() {
	runAndClose(() => controller.navigation.zoomToSelection())
}

function createPage() {
	runAndClose(() => controller.createPage())
}

function renameCurrentPage() {
	const name = window.prompt('重命名页面', currentPage.value.name)
	if (name === null) return
	runAndClose(() => controller.renamePage(currentPage.value.id, name))
}

function duplicateCurrentPage() {
	runAndClose(() => controller.duplicatePage(currentPage.value.id))
}

function deleteCurrentPage() {
	runAndClose(() => controller.deletePage(currentPage.value.id))
}

function goToPreviousPage() {
	const pageIndex = pages.value.findIndex((page) => page.id === currentPage.value.id)
	if (pageIndex <= 0) return
	runAndClose(() => controller.switchPage(pages.value[pageIndex - 1].id))
}

function goToNextPage() {
	const pageIndex = pages.value.findIndex((page) => page.id === currentPage.value.id)
	if (pageIndex < 0 || pageIndex >= pages.value.length - 1) return
	runAndClose(() => controller.switchPage(pages.value[pageIndex + 1].id))
}

function openPageSubmenu(pageId: TLPageId) {
	openPageSubmenuId.value = openPageSubmenuId.value === pageId ? null : pageId
}

function renamePage(pageId: TLPageId, name: string) {
	const nextName = window.prompt('重命名页面', name)
	if (nextName === null) return
	runAndClose(() => controller.renamePage(pageId, nextName))
}

function duplicatePage(pageId: TLPageId) {
	runAndClose(() => controller.duplicatePage(pageId))
}

function movePage(pageId: TLPageId, direction: -1 | 1) {
	runAndClose(() => controller.movePage(pageId, direction))
}

function deletePage(pageId: TLPageId) {
	runAndClose(() => controller.deletePage(pageId))
}

function switchPage(pageId: TLPageId) {
	runAndClose(() => controller.switchPage(pageId))
}

function runGridAction(actionId: TopMenuGridActionId) {
	runAndClose(() => controller.runGridAction(actionId))
}

async function previewPrint() {
	emit('before-action')
	closeMenus()
	updatePrintPreviewModalSize()
	printPreviewOpen.value = true
	printPreviewLoading.value = true
	printPreviewError.value = null
	printPreviewPages.value = []
	printPreviewPageIndex.value = 0

	try {
		const manager = new PrintManager(props.editor)
		printPreviewPages.value = await manager.renderPages(createPrintJobConfig())
	} catch (error) {
		printPreviewError.value = getTemplateErrorMessage(error, '打印预览失败')
	} finally {
		printPreviewLoading.value = false
	}
}

async function printCurrentPage() {
	emit('before-action')
	closeMenus()

	try {
		const manager = new PrintManager(props.editor)
		await manager.print(createPrintJobConfig())
	} catch (error) {
		await showModalAlert(getTemplateErrorMessage(error, '打印失败'), '打印失败')
	}
}

async function printPreviewPagesNow() {
	try {
		const manager = new PrintManager(props.editor)
		await manager.print(createPrintJobConfig())
	} catch (error) {
		printPreviewError.value = getTemplateErrorMessage(error, '打印失败')
	}
}

function closePrintPreview() {
	printPreviewOpen.value = false
	printPreviewLoading.value = false
	printPreviewError.value = null
	printPreviewPages.value = []
	printPreviewPageIndex.value = 0
}

function updatePrintPreviewModalSize() {
	const container = props.editor.getContainer()
	const canvasRect = container.getBoundingClientRect()
	const viewportWidth = document.documentElement.clientWidth || window.innerWidth
	const viewportHeight = document.documentElement.clientHeight || window.innerHeight
	const availableWidth = Math.min(canvasRect.width || viewportWidth, viewportWidth) - 32
	const availableHeight = Math.min(canvasRect.height || viewportHeight, viewportHeight) - 32
	const width = Math.max(280, Math.floor(availableWidth))
	const height = Math.max(240, Math.floor(availableHeight))

	printPreviewModalSize.value = {
		width: `${width}px`,
		height: `${height}px`,
	}
}

function goToPreviousPrintPreviewPage() {
	printPreviewPageIndex.value = Math.max(0, printPreviewPageIndex.value - 1)
}

function goToNextPrintPreviewPage() {
	printPreviewPageIndex.value = Math.min(
		printPreviewPageCount.value - 1,
		printPreviewPageIndex.value + 1
	)
}

function createPrintJobConfig(): PrintJobConfig {
	const shapeIds = props.editor.getCurrentPageShapeIdsSorted()
	const workspace = props.getWorkspaceTemplateConfig?.()
	const materialGrids = createMaterialGridConfigs(shapeIds, workspace?.printDataSource)
	const printPage = getCurrentPrintPageConfig()

	return {
		template: {
			shapeIds,
			pageBounds: printPage.pageBounds,
			pxPerMm: printPage.pxPerMm,
			materialGrids,
		},
		data: materialGrids ? [PRINT_SAMPLE_ROWS[0]] : PRINT_SAMPLE_ROWS,
		dataSource: workspace?.printDataSource,
		page: {
			widthMm: printPage.pageSizeMm.w,
			heightMm: printPage.pageSizeMm.h,
			copies: 1,
			background: true,
		},
		export: {
			format: 'png',
			pixelRatio: 2,
			padding: 0,
		},
		printer: {
			type: 'browser',
			title: '打印预览',
		},
	}
}

function getCurrentPrintPageConfig() {
	const workspace = props.getWorkspaceTemplateConfig?.()
	const pxPerMm = workspace?.pxPerMm ?? DEFAULT_PRINT_PX_PER_MM
	const pageBounds = workspace?.pageBounds
	const pageSizeMm =
		workspace?.pageSizeMm ??
		(pageBounds
			? {
					w: pageBounds.w / pxPerMm,
					h: pageBounds.h / pxPerMm,
				}
			: DEFAULT_PRINT_PAGE_SIZE_MM)

	return {
		pageSizeMm,
		pageBounds:
			pageBounds ??
			{
				x: 0,
				y: 0,
				w: pageSizeMm.w * pxPerMm,
				h: pageSizeMm.h * pxPerMm,
			},
		pxPerMm,
	}
}

function createMaterialGridConfigs(
	shapeIds: readonly TLShapeId[],
	dataSource?: VueTemplateWorkspaceConfig['printDataSource']
): PrintMaterialGridCollection | undefined {
	const materialGrids: Record<string, PrintMaterialGridConfig> = {}
	const hasConfiguredDataSource =
		dataSource?.type === 'inline' && typeof dataSource.formCode === 'string'
	const inlineDetail = hasConfiguredDataSource ? getPrintDataSourceDetailRows(dataSource) : null
	const configuredColumns = hasConfiguredDataSource
		? getPrintDataSourceDetailColumns(dataSource)
		: []
	const columns = configuredColumns.length ? configuredColumns : PRINT_MATERIAL_SAMPLE_COLUMNS
	const data = inlineDetail ?? PRINT_MATERIAL_SAMPLE_ROWS

	for (const shapeId of shapeIds) {
		const shape = props.editor.getShape(shapeId)
		if (!isVueMaterialShape(shape)) continue
		materialGrids[shape.id] = {
			data,
			columns,
			headerHeight: 24,
			minRowHeight: 16,
			fontSize: 9,
			lineHeight: 10,
			cellPaddingX: 4,
			cellPaddingY: 3,
			emptyText: '暂无物料',
		}
	}

	return Object.keys(materialGrids).length ? materialGrids : undefined
}

async function toggleTemplateMenu(event?: MouseEvent) {
	emit('before-action')

	if (templateMenuOpen.value) {
		closeMenus()
		return
	}

	updateEmbeddedPopoverPosition(event)
	mainMenuOpen.value = false
	pageMenuOpen.value = false
	actionsMenuOpen.value = false
	openPageSubmenuId.value = null
	templateMenuOpen.value = true
	templateError.value = null
	isTemplateLoading.value = true

	try {
		templates.value = await loadTemplateRecords()
	} catch (error) {
		templateError.value = getTemplateErrorMessage(error, '模板加载失败')
	} finally {
		isTemplateLoading.value = false
	}
}

async function saveCurrentTemplate() {
	if (isTemplateSaving.value) return

	emit('before-action')
	closeMenus()
	templateError.value = null
	isTemplateSaving.value = true

	try {
		const existingTemplates = await loadTemplateRecords()
		const content = await getCurrentPageTemplateContent()
		const workspace = content && isObject(content.workspace)
			? content.workspace as VueTemplateWorkspaceConfig
			: props.getWorkspaceTemplateConfig?.()
		if (!content) {
			await showModalAlert('当前页没有可保存的内容')
			return
		}

		const defaultName = `模板 ${existingTemplates.length + 1}`
		const name = window.prompt('模板名称', defaultName)
		if (name === null) return

		const trimmedName = name.trim()
		if (!trimmedName) {
			await showModalAlert('模板名称不能为空')
			return
		}

		const existingIndex = existingTemplates.findIndex((template) => template.name === trimmedName)
		const nextTemplates = existingTemplates.slice()

		if (existingIndex >= 0) {
			const confirmResult = await VxeUI.modal.confirm({
				title: '覆盖模板',
				content: `已存在模板"${trimmedName}"，是否覆盖？`,
			})
			if (confirmResult !== 'confirm') return
			const current = nextTemplates[existingIndex]
			nextTemplates[existingIndex] = {
				...current,
				name: trimmedName,
				updatedAt: Date.now(),
				content: cloneVueTemplateContent(content),
				workspace,
				metadata: createVueTemplateMetadata(workspace, trimmedName),
			}
		} else {
			nextTemplates.push(createVueTemplateRecord(trimmedName, content, workspace))
		}

		await saveTemplateRecords(nextTemplates)
		await showModalAlert('模板已保存')
	} catch (error) {
		const message = getTemplateErrorMessage(error, '模板保存失败')
		templateError.value = message
		await showModalAlert(message, '模板保存失败')
	} finally {
		isTemplateSaving.value = false
	}
}

async function applyTemplate(template: VueTemplateRecord) {
	if (props.editor.getCurrentPageShapeIdsSorted().length > 0) {
		const confirmResult = await VxeUI.modal.confirm({
			title: '加载模板',
			content: `加载模板"${template.name}"会替换当前页内容，是否继续？`,
		})
		if (confirmResult !== 'confirm') return
	}

	emit('before-action')
	closeMenus()

	try {
		props.editor.markHistoryStoppingPoint('load template')
		applyTemplateDocumentContent(props.editor, template.content as TemplateDocumentContent)
		const contentWorkspace = isObject((template.content as TemplateDocumentContent).workspace)
			? (template.content as TemplateDocumentContent).workspace
			: template.workspace
		if (contentWorkspace) props.applyWorkspaceTemplateConfig?.(contentWorkspace)
	} catch (error) {
		await showModalAlert(getTemplateErrorMessage(error, '模板加载失败'), '模板加载失败')
	}
}

async function deleteTemplate(template: VueTemplateRecord) {
	const confirmResult = await VxeUI.modal.confirm({
		title: '删除模板',
		content: `删除模板"${template.name}"？`,
	})
	if (confirmResult !== 'confirm') return

	try {
		const nextTemplates = templates.value.filter((item) => item.id !== template.id)
		await saveTemplateRecords(nextTemplates)
	} catch (error) {
		const message = getTemplateErrorMessage(error, '模板删除失败')
		templateError.value = message
		await showModalAlert(message, '模板删除失败')
	}
}

async function getCurrentPageTemplateContent(): Promise<TemplateDocumentContent | undefined> {
	const currentPageId = props.editor.getCurrentPageId()
	const pages: TemplatePageContent[] = []
	for (const page of props.editor.getPages()) {
		const shapeIds = [...props.editor.getPageShapeIds(page.id)].sort()
		const content = props.editor.getContentFromCurrentPage(shapeIds, page.id)
		const resolved = await props.editor.resolveAssetsInContent(content)
		if (resolved) pages.push({ id: page.id, name: page.name, content: cloneVueTemplateContent(resolved) })
	}
	if (!pages.length) return undefined
	return {
		pages,
		currentPageId,
		workspace: cloneVueTemplateWorkspaceConfig(props.getWorkspaceTemplateConfig?.()),
	}
}

function applyTemplateDocumentContent(editor: Editor, content: TemplateDocumentContent) {
	const pages = normalizeTemplatePages(editor, content)
	const targetPageIds = new Set(pages.map((page) => page.id))

	editor.run(() => {
		for (const page of pages) {
			if (!editor.getPage(page.id)) editor.createPage({ id: page.id, name: page.name })
			else if (editor.getPage(page.id)?.name !== page.name) editor.renamePage(page.id, page.name)
		}
		editor.setCurrentPage(pages[0].id)
		for (const page of editor.getPages()) {
			if (!targetPageIds.has(page.id) && editor.getPages().length > 1) editor.deletePage(page.id)
		}
		for (const page of pages) {
			if (!editor.getPage(page.id)) continue
			editor.setCurrentPage(page.id)
			const shapeIds = [...editor.getPageShapeIds(page.id)]
			if (shapeIds.length) editor.deleteShapes(shapeIds)
			editor.putContentOntoCurrentPage(cloneVueTemplateContent(page.content), {
				preservePosition: true,
				preserveIds: true,
				select: false,
			})
		}
		editor.setCurrentPage(content.currentPageId && targetPageIds.has(content.currentPageId) ? content.currentPageId : pages[0].id)
		editor.selectNone()
	}, { history: 'ignore', ignoreShapeLock: true })
}

function normalizeTemplatePages(editor: Editor, content: TemplateDocumentContent) {
	const candidatePages = Array.isArray(content.pages) && content.pages.length
		? content.pages
		: [{ id: editor.getCurrentPageId(), name: editor.getCurrentPage().name, content }]
	return candidatePages
		.filter((page): page is TemplatePageContent => Boolean(
			page && typeof page.id === 'string' && typeof page.name === 'string' && isTemplateContent(page.content)
		))
		.map((page) => ({ ...page, content: stripTemplateMetadata(page.content) }))
}

function stripTemplateMetadata(value: TLContent): TLContent {
	return stripVueTemplateDocumentMetadata(value)
}

function isTemplateContent(value: unknown): value is TLContent {
	if (!isObject(value)) return false
	return isObject(value.schema)
		&& Array.isArray(value.shapes)
		&& Array.isArray(value.rootShapeIds)
		&& Array.isArray(value.bindings)
		&& Array.isArray(value.assets)
}

async function loadTemplateRecords() {
	if (props.loadTemplates) {
		const loadedTemplates = await props.loadTemplates()
		return normalizeVueTemplates(loadedTemplates)
	}

	return readLocalVueTemplates()
}

async function saveTemplateRecords(nextTemplates: readonly VueTemplateRecord[]) {
	const normalizedTemplates = normalizeVueTemplates(nextTemplates)
	if (props.saveTemplates) {
		await props.saveTemplates(normalizedTemplates.map(cloneVueTemplateRecord))
	} else {
		writeLocalVueTemplates(normalizedTemplates)
	}
	templates.value = normalizedTemplates
}

function formatTemplateDate(timestamp: number) {
	if (!Number.isFinite(timestamp)) return ''
	const date = new Date(timestamp)
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	const hours = String(date.getHours()).padStart(2, '0')
	const minutes = String(date.getMinutes()).padStart(2, '0')
	return `${year}-${month}-${day} ${hours}:${minutes}`
}

function getTemplateErrorMessage(error: unknown, fallback: string) {
	return error instanceof Error && error.message ? error.message : fallback
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function onDocumentPointerDown(event: PointerEvent) {
	const target = event.target
	if (!(target instanceof Node)) return
	if (!panelRef.value?.contains(target)) closeMenus()
}

function onDocumentKeyDown(event: KeyboardEvent) {
	if (event.key === 'Escape') closeMenus()
}

defineExpose({
	closeMenus,
	previewPrint,
	printCurrentPage,
})

onMounted(() => {
	window.addEventListener('pointerdown', onDocumentPointerDown)
	window.addEventListener('keydown', onDocumentKeyDown)
	updatePrintPreviewModalSize()
	if (typeof ResizeObserver !== 'undefined') {
		printPreviewResizeObserver = new ResizeObserver(updatePrintPreviewModalSize)
		printPreviewResizeObserver.observe(props.editor.getContainer())
	}
})

onBeforeUnmount(() => {
	window.removeEventListener('pointerdown', onDocumentPointerDown)
	window.removeEventListener('keydown', onDocumentKeyDown)
	printPreviewResizeObserver?.disconnect()
	printPreviewResizeObserver = null
})
</script>

<template>
	<div
		ref="panelRef"
		class="top-menu-panel"
		@pointerdown.stop
		@pointermove.stop
		@wheel.stop
		@contextmenu.prevent.stop
	>
		<div class="top-menu-toolbar">
			<button
				type="button"
				class="top-menu-icon-button top-menu-labeled-button"
				aria-label="菜单"
				title="菜单"
				@click="toggleMainMenu($event)"
			>
				<span class="top-menu-button-icon" aria-hidden="true">&#9776;</span>
				<span class="top-menu-button-label">菜单</span>
			</button>
			<button
				v-if="props.showTemplateControls !== false && canPreviewPrint"
				type="button"
				class="top-menu-icon-button top-menu-labeled-button"
				aria-label="加载模板"
				title="加载模板"
				:disabled="isTemplateLoading"
				@click="toggleTemplateMenu($event)"
			>
				<span class="top-menu-button-icon" aria-hidden="true">&#128194;</span>
				<span class="top-menu-button-label">加载模板</span>
			</button>
			<button
				v-if="props.showTemplateControls !== false && canPrint"
				type="button"
				class="top-menu-icon-button top-menu-labeled-button"
				aria-label="保存模板"
				title="保存模板"
				:disabled="!hasShapesOnPage || isTemplateSaving"
				@click="saveCurrentTemplate"
			>
				<span class="top-menu-button-icon" aria-hidden="true">&#128190;</span>
				<span class="top-menu-button-label">保存模板</span>
			</button>
			<button
				type="button"
				class="top-menu-page-button top-menu-labeled-button"
				aria-label="页面"
				:title="pageLabel"
				@click="togglePageMenu($event)"
			>
				<span class="top-menu-button-icon" aria-hidden="true">&#128196;</span>
				<span class="top-menu-button-label">页面</span>
				<span class="top-menu-page-label">{{ pageLabel }}</span>
				<span class="top-menu-page-caret">&#9662;</span>
			</button>
			<button
				type="button"
				class="top-menu-icon-button top-menu-labeled-button"
				aria-label="打印预览"
				title="打印预览"
				:disabled="!hasShapesOnPage || printPreviewLoading"
				@click="previewPrint"
			>
				<span class="top-menu-button-icon" aria-hidden="true">&#128065;</span>
				<span class="top-menu-button-label">预览</span>
			</button>
			<button
				type="button"
				class="top-menu-icon-button top-menu-labeled-button"
				aria-label="打印"
				title="打印"
				:disabled="!hasShapesOnPage || printPreviewLoading"
				@click="printCurrentPage"
			>
				<span class="top-menu-button-icon" aria-hidden="true">&#128438;</span>
				<span class="top-menu-button-label">打印</span>
			</button>
			<div class="top-menu-separator" />
			<div class="top-menu-inline-actions" aria-label="对齐与层级操作">
				<div
					v-for="(group, groupIndex) in gridActionGroups"
					:key="groupIndex"
					class="top-menu-action-group"
				>
					<button
						v-for="action in group"
						:key="action.id"
						type="button"
						class="top-menu-icon-button top-menu-action-button"
						:disabled="action.disabled"
						:title="action.label"
						:aria-label="action.label"
						@click="runGridAction(action.id)"
					>
						<span class="top-menu-grid-icon" aria-hidden="true">{{ action.glyph }}</span>
						<span class="top-menu-action-label">{{ action.label }}</span>
					</button>
				</div>
			</div>
		</div>

		<div
			v-if="props.showTemplateControls !== false && templateMenuOpen"
			class="top-menu-popover top-menu-popover--templates"
			:style="embeddedPopoverStyle"
		>
			<div class="top-menu-template-title">模板</div>
			<div v-if="templateError" class="top-menu-template-state top-menu-template-state--error">
				{{ templateError }}
			</div>
			<div v-else-if="isTemplateLoading" class="top-menu-template-state">加载中...</div>
			<div v-else-if="templates.length === 0" class="top-menu-template-state">暂无模板</div>
			<div v-else class="top-menu-template-list">
				<div v-for="template in templates" :key="template.id" class="top-menu-template-row">
					<button
						type="button"
						class="top-menu-template-load-button"
						:title="template.name"
						@click="applyTemplate(template)"
					>
						<span class="top-menu-template-name">{{ template.name }}</span>
						<span class="top-menu-template-meta">{{ formatTemplateDate(template.updatedAt) }}</span>
					</button>
					<button
						type="button"
						class="top-menu-template-delete-button"
						aria-label="删除模板"
						title="删除模板"
						@click.stop="deleteTemplate(template)"
					>
						&#215;
					</button>
				</div>
			</div>
		</div>

		<div v-if="mainMenuOpen" class="top-menu-popover top-menu-popover--main" :style="embeddedPopoverStyle">
			<button type="button" class="top-menu-menu-item" :disabled="!canUndo" @click="undo">
				撤销
			</button>
			<button type="button" class="top-menu-menu-item" :disabled="!canRedo" @click="redo">
				重做
			</button>
			<div class="top-menu-menu-separator" />
			<button type="button" class="top-menu-menu-item" :disabled="!hasSelection" @click="duplicateSelection">
				复制所选
			</button>
			<button type="button" class="top-menu-menu-item" :disabled="!hasSelection" @click="deleteSelection">
				删除所选
			</button>
			<button
				type="button"
				class="top-menu-menu-item"
				:disabled="!hasShapesOnPage"
				@click="selectAll"
			>
				全选
			</button>
			<div class="top-menu-menu-separator" />
			<button type="button" class="top-menu-menu-item" @click="zoomTo100">缩放至 100%</button>
			<button
				type="button"
				class="top-menu-menu-item"
				:disabled="!hasShapesOnPage"
				@click="zoomToFit"
			>
				适应画布
			</button>
			<button
				type="button"
				class="top-menu-menu-item"
				:disabled="!hasSelection"
				@click="zoomToSelection"
			>
				缩放至所选
			</button>
			<div class="top-menu-menu-separator" />
			<button
				type="button"
				class="top-menu-menu-item"
				:disabled="hasReachedMaxPages"
				@click="createPage"
			>
				新建页面
			</button>
			<button type="button" class="top-menu-menu-item" @click="renameCurrentPage">重命名当前页面</button>
			<button type="button" class="top-menu-menu-item" @click="duplicateCurrentPage">复制当前页面</button>
			<button
				type="button"
				class="top-menu-menu-item"
				:disabled="pages.length <= 1"
				@click="deleteCurrentPage"
			>
				删除当前页面
			</button>
		</div>

		<div v-if="pageMenuOpen" class="top-menu-popover top-menu-popover--page" :style="embeddedPopoverStyle">
			<div class="top-menu-page-list">
				<div v-for="page in pages" :key="page.id" class="top-menu-page-row" :data-current="page.isCurrent">
					<button
						type="button"
						class="top-menu-page-row-button"
						:class="{ 'is-current': page.isCurrent }"
						@click="switchPage(page.id)"
						@dblclick.prevent="renamePage(page.id, page.name)"
					>
						<span class="top-menu-page-row-name">{{ page.name }}</span>
					</button>
					<button
						type="button"
						class="top-menu-page-row-submenu-button"
						aria-label="页面操作"
						title="页面操作"
						@click.stop="openPageSubmenu(page.id)"
					>
						&#8942;
					</button>
					<div
						v-if="openPageSubmenuId === page.id"
						class="top-menu-page-row-submenu"
						@click.stop
					>
						<button type="button" class="top-menu-menu-item" @click="renamePage(page.id, page.name)">
							重命名
						</button>
						<button
							type="button"
							class="top-menu-menu-item"
							:disabled="!page.canDuplicate"
							@click="duplicatePage(page.id)"
						>
							复制
						</button>
						<button
							type="button"
							class="top-menu-menu-item"
							:disabled="!page.canMoveUp"
							@click="movePage(page.id, -1)"
						>
							上移
						</button>
						<button
							type="button"
							class="top-menu-menu-item"
							:disabled="!page.canMoveDown"
							@click="movePage(page.id, 1)"
						>
							下移
						</button>
						<button
							type="button"
							class="top-menu-menu-item"
							:disabled="!page.canDelete"
							@click="deletePage(page.id)"
						>
							删除
						</button>
					</div>
				</div>
			</div>
			<div class="top-menu-menu-separator" />
			<button
				type="button"
				class="top-menu-menu-item"
				:disabled="hasReachedMaxPages"
				@click="createPage"
			>
				新建页面
			</button>
		</div>

		<div v-if="actionsMenuOpen" class="top-menu-popover top-menu-popover--actions" :style="embeddedPopoverStyle">
			<div v-for="(group, groupIndex) in gridActionGroups" :key="groupIndex" class="top-menu-grid-row">
				<template v-for="action in group" :key="action.id">
					<button
						type="button"
						class="top-menu-grid-item"
						:disabled="action.disabled"
						:title="action.label"
						:aria-label="action.label"
						@click="runGridAction(action.id)"
					>
						<span class="top-menu-grid-icon">{{ action.glyph }}</span>
					</button>
				</template>
			</div>
		</div>

		<vxe-modal
			v-model="printPreviewOpen"
			class-name="print-preview-modal"
			title="打印预览"
			:width="printPreviewModalSize.width"
			:height="printPreviewModalSize.height"
			min-width="280px"
			min-height="240px"
			:show-footer="true"
			:show-zoom="false"
			:show-maximize="false"
			:show-close="true"
			:mask-closable="true"
			@hide="closePrintPreview"
		>
			<div class="print-preview-body" @pointerdown.stop @wheel.stop>
				<div v-if="printPreviewLoading" class="print-preview-loading">正在生成预览...</div>
				<div v-else-if="printPreviewError" class="print-preview-error">{{ printPreviewError }}</div>
				<div v-else class="print-preview-pages">
					<figure v-for="page in pagedPrintPreviewPages" :key="`${page.pageNo}:${page.index}`" class="print-preview-page">
						<img :src="page.dataUrl" :alt="`Page ${page.pageNo}`" />
						<figcaption>Page {{ page.pageNo }}</figcaption>
					</figure>
				</div>
			</div>
			<template #footer>
				<div class="print-preview-footer">
					<div v-if="printPreviewPageCount > 1" class="print-preview-pagination">
						<button
							type="button"
							class="print-preview-page-button"
							:disabled="printPreviewPageIndex === 0"
							aria-label="上一页"
							title="上一页"
							@click="goToPreviousPrintPreviewPage"
						>
							&lt;
						</button>
						<span class="print-preview-page-label">{{ printPreviewPageLabel }}</span>
						<button
							type="button"
							class="print-preview-page-button"
							:disabled="printPreviewPageIndex >= printPreviewPageCount - 1"
							aria-label="下一页"
							title="下一页"
							@click="goToNextPrintPreviewPage"
						>
							&gt;
						</button>
					</div>
					<button
						type="button"
						class="print-preview-print-button"
						:disabled="printPreviewLoading || printPreviewPages.length === 0"
						@click="printPreviewPagesNow"
					>
						打印
					</button>
				</div>
			</template>
		</vxe-modal>

	</div>
</template>
