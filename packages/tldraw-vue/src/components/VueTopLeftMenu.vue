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
	cloneVueTemplateContent,
	cloneVueTemplateRecord,
	createVueTemplateRecord,
	normalizeVueTemplates,
	readLocalVueTemplates,
	writeLocalVueTemplates,
	type VueTemplateLoadHandler,
	type VueTemplateRecord,
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

const controller = new TopMenuController(props.editor)

const PRINT_SAMPLE_ROWS = [
	{
		name: '张三',
		code: 'A001',
		phone: '13800000001',
		address: '上海市浦东新区',
	},
	{
		name: '李四',
		code: 'A002',
		phone: '13800000002',
		address: '北京市朝阳区',
	},
	{
		name: '王五',
		code: 'A003',
		phone: '13800000003',
		address: '广州市天河区',
	},
]

const PRINT_MATERIAL_SAMPLE_COLUMNS: PrintMaterialGridColumn[] = [
	{ type: 'seq', title: '序号', width: 36 },
	{ field: 'materialCode', title: '编码', width: 82 },
	{ field: 'materialName', title: '名称', width: 92 },
	{ field: 'quantity', title: '数量', width: 58 },
	{ field: 'remark', title: '备注', width: 92 },
]

const PRINT_MATERIAL_SAMPLE_ROWS = Array.from({ length: 23 }, (_, index) => {
	const no = index + 1

	return {
		materialCode: `M${String(no).padStart(3, '0')}`,
		materialName: `物料${no}`,
		specification: no % 3 === 0 ? 'M8*35' : '常规',
		unit: no % 2 === 0 ? '箱' : '件',
		quantity: no % 7 === 0 ? 240 + no : 12 + no * 3,
		warehouse: no % 3 === 0 ? '成品仓' : no % 3 === 1 ? '原料仓' : '备件仓',
		remark: no % 5 === 0 ? '加急' : '',
	}
})

const DEFAULT_PRINT_PAGE_SIZE_MM = { w: 80, h: 80 }
const DEFAULT_PRINT_PX_PER_MM = 10
const PRINT_PREVIEW_PAGE_SIZE = 3

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

function toggleMainMenu() {
	if (mainMenuOpen.value) {
		closeMenus()
		return
	}

	pageMenuOpen.value = false
	actionsMenuOpen.value = false
	templateMenuOpen.value = false
	mainMenuOpen.value = true
}

function togglePageMenu() {
	if (pageMenuOpen.value) {
		closeMenus()
		return
	}

	mainMenuOpen.value = false
	actionsMenuOpen.value = false
	templateMenuOpen.value = false
	pageMenuOpen.value = true
}

function toggleActionsMenu() {
	if (actionsMenuOpen.value) {
		closeMenus()
		return
	}

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
	const name = window.prompt('Rename page', currentPage.value.name)
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
	const nextName = window.prompt('Rename page', name)
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
	const materialGrids = createSampleMaterialGridConfigs(shapeIds)
	const workspace = props.getWorkspaceTemplateConfig?.()
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

function createSampleMaterialGridConfigs(
	shapeIds: readonly TLShapeId[]
): PrintMaterialGridCollection | undefined {
	const materialGrids: Record<string, PrintMaterialGridConfig> = {}

	for (const shapeId of shapeIds) {
		const shape = props.editor.getShape(shapeId)
		if (!isVueMaterialShape(shape)) continue
		materialGrids[shape.id] = {
			grid: createSampleVxeGrid(),
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

function createSampleVxeGrid() {
	return {
		getTableData() {
			return {
				visibleData: PRINT_MATERIAL_SAMPLE_ROWS,
				tableData: PRINT_MATERIAL_SAMPLE_ROWS,
				fullData: PRINT_MATERIAL_SAMPLE_ROWS,
			}
		},
		getTableColumn() {
			return {
				visibleColumn: PRINT_MATERIAL_SAMPLE_COLUMNS,
				fullColumn: PRINT_MATERIAL_SAMPLE_COLUMNS,
			}
		},
		getVisibleColumns() {
			return PRINT_MATERIAL_SAMPLE_COLUMNS
		},
		getData() {
			return PRINT_MATERIAL_SAMPLE_ROWS
		},
	}
}

async function toggleTemplateMenu() {
	emit('before-action')

	if (templateMenuOpen.value) {
		closeMenus()
		return
	}

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
		const workspace = props.getWorkspaceTemplateConfig?.()
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
			if (!window.confirm(`已存在模板"${trimmedName}"，是否覆盖？`)) return
			const current = nextTemplates[existingIndex]
			nextTemplates[existingIndex] = {
				...current,
				name: trimmedName,
				updatedAt: Date.now(),
				content: cloneVueTemplateContent(content),
				workspace,
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
	const pageShapeIds = props.editor.getCurrentPageShapeIdsSorted()
	if (
		pageShapeIds.length > 0 &&
		!window.confirm(`加载模板"${template.name}"会替换当前页内容，是否继续？`)
	) {
		return
	}

	emit('before-action')
	closeMenus()

	try {
		props.editor.markHistoryStoppingPoint('load template')
		props.editor.run(
			() => {
				if (pageShapeIds.length > 0) props.editor.deleteShapes(pageShapeIds)
				props.editor.selectNone()
			},
			{ ignoreShapeLock: true }
		)
		if (template.workspace) props.applyWorkspaceTemplateConfig?.(template.workspace)
		props.editor.putContentOntoCurrentPage(cloneVueTemplateContent(template.content), {
			preservePosition: true,
			select: true,
		})
	} catch (error) {
		await showModalAlert(getTemplateErrorMessage(error, '模板加载失败'), '模板加载失败')
	}
}

async function deleteTemplate(template: VueTemplateRecord) {
	if (!window.confirm(`删除模板"${template.name}"？`)) return

	try {
		const nextTemplates = templates.value.filter((item) => item.id !== template.id)
		await saveTemplateRecords(nextTemplates)
	} catch (error) {
		const message = getTemplateErrorMessage(error, '模板删除失败')
		templateError.value = message
		await showModalAlert(message, '模板删除失败')
	}
}

async function getCurrentPageTemplateContent(): Promise<TLContent | undefined> {
	const shapeIds = props.editor.getCurrentPageShapeIdsSorted()
	const content = props.editor.getContentFromCurrentPage(shapeIds)
	return props.editor.resolveAssetsInContent(content)
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
})

onMounted(() => {
	window.addEventListener('pointerdown', onDocumentPointerDown)
	window.addEventListener('keydown', onDocumentKeyDown)
})

onBeforeUnmount(() => {
	window.removeEventListener('pointerdown', onDocumentPointerDown)
	window.removeEventListener('keydown', onDocumentKeyDown)
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
				class="top-menu-icon-button"
				aria-label="Main menu"
				title="Main menu"
				@click="toggleMainMenu"
			>
				&#9776;
			</button>
			<button
				v-if="props.showTemplateControls !== false && canPreviewPrint"
				type="button"
				class="top-menu-icon-button"
				aria-label="加载模板"
				title="加载模板"
				:disabled="isTemplateLoading"
				@click="toggleTemplateMenu"
			>
				&#128194;
			</button>
			<button
				v-if="props.showTemplateControls !== false && canPrint"
				type="button"
				class="top-menu-icon-button"
				aria-label="保存模板"
				title="保存模板"
				:disabled="!hasShapesOnPage || isTemplateSaving"
				@click="saveCurrentTemplate"
			>
				&#128190;
			</button>
			<button
				type="button"
				class="top-menu-page-button"
				aria-label="Page menu"
				:title="pageLabel"
				@click="togglePageMenu"
			>
				<span class="top-menu-page-label">{{ pageLabel }}</span>
				<span class="top-menu-page-caret">&#9662;</span>
			</button>
			<button
				type="button"
				class="top-menu-icon-button"
				aria-label="打印预览"
				title="打印预览"
				:disabled="!hasShapesOnPage || printPreviewLoading"
				@click="previewPrint"
			>
				&#128065;
			</button>
			<button
				type="button"
				class="top-menu-icon-button"
				aria-label="打印"
				title="打印"
				:disabled="!hasShapesOnPage || printPreviewLoading"
				@click="printCurrentPage"
			>
				&#128438;
			</button>
			<div class="top-menu-separator" />
			<div class="top-menu-inline-actions" aria-label="Selection actions">
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
						<span class="top-menu-grid-icon">{{ action.glyph }}</span>
					</button>
				</div>
			</div>
		</div>

		<div
			v-if="props.showTemplateControls !== false && templateMenuOpen"
			class="top-menu-popover top-menu-popover--templates"
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

		<div v-if="mainMenuOpen" class="top-menu-popover top-menu-popover--main">
			<button type="button" class="top-menu-menu-item" :disabled="!canUndo" @click="undo">
				Undo
			</button>
			<button type="button" class="top-menu-menu-item" :disabled="!canRedo" @click="redo">
				Redo
			</button>
			<div class="top-menu-menu-separator" />
			<button type="button" class="top-menu-menu-item" :disabled="!hasSelection" @click="duplicateSelection">
				Duplicate selection
			</button>
			<button type="button" class="top-menu-menu-item" :disabled="!hasSelection" @click="deleteSelection">
				Delete selection
			</button>
			<button
				type="button"
				class="top-menu-menu-item"
				:disabled="!hasShapesOnPage"
				@click="selectAll"
			>
				Select all
			</button>
			<div class="top-menu-menu-separator" />
			<button type="button" class="top-menu-menu-item" @click="zoomTo100">Zoom to 100%</button>
			<button
				type="button"
				class="top-menu-menu-item"
				:disabled="!hasShapesOnPage"
				@click="zoomToFit"
			>
				Zoom to fit
			</button>
			<button
				type="button"
				class="top-menu-menu-item"
				:disabled="!hasSelection"
				@click="zoomToSelection"
			>
				Zoom to selection
			</button>
			<div class="top-menu-menu-separator" />
			<button
				type="button"
				class="top-menu-menu-item"
				:disabled="hasReachedMaxPages"
				@click="createPage"
			>
				New page
			</button>
			<button type="button" class="top-menu-menu-item" @click="renameCurrentPage">Rename current page</button>
			<button type="button" class="top-menu-menu-item" @click="duplicateCurrentPage">Duplicate current page</button>
			<button
				type="button"
				class="top-menu-menu-item"
				:disabled="pages.length <= 1"
				@click="deleteCurrentPage"
			>
				Delete current page
			</button>
		</div>

		<div v-if="pageMenuOpen" class="top-menu-popover top-menu-popover--page">
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
						aria-label="Page actions"
						title="Page actions"
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
							Rename
						</button>
						<button
							type="button"
							class="top-menu-menu-item"
							:disabled="!page.canDuplicate"
							@click="duplicatePage(page.id)"
						>
							Duplicate
						</button>
						<button
							type="button"
							class="top-menu-menu-item"
							:disabled="!page.canMoveUp"
							@click="movePage(page.id, -1)"
						>
							Move up
						</button>
						<button
							type="button"
							class="top-menu-menu-item"
							:disabled="!page.canMoveDown"
							@click="movePage(page.id, 1)"
						>
							Move down
						</button>
						<button
							type="button"
							class="top-menu-menu-item"
							:disabled="!page.canDelete"
							@click="deletePage(page.id)"
						>
							Delete
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
				New page
			</button>
		</div>

		<div v-if="actionsMenuOpen" class="top-menu-popover top-menu-popover--actions">
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

		<div v-if="printPreviewOpen" class="print-preview-layer" @pointerdown.stop @wheel.stop>
			<div class="print-preview-backdrop" @click="closePrintPreview" />
			<section class="print-preview-dialog" role="dialog" aria-modal="true" aria-label="打印预览">
				<header class="print-preview-header">
					<div class="print-preview-title">打印预览</div>
					<button
						type="button"
						class="print-preview-close"
						aria-label="关闭打印预览"
						title="关闭"
						@click="closePrintPreview"
					>
						&#215;
					</button>
				</header>
				<div v-if="printPreviewLoading" class="print-preview-loading">正在生成预览...</div>
				<div v-else-if="printPreviewError" class="print-preview-error">{{ printPreviewError }}</div>
				<div v-else class="print-preview-pages">
					<figure v-for="page in pagedPrintPreviewPages" :key="`${page.pageNo}:${page.index}`" class="print-preview-page">
						<img :src="page.dataUrl" :alt="`Page ${page.pageNo}`" />
						<figcaption>Page {{ page.pageNo }}</figcaption>
					</figure>
				</div>
				<footer class="print-preview-footer">
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
				</footer>
			</section>
		</div>

	</div>
</template>
