import '../src/styles.css'
import 'vxe-pc-ui/lib/style.css'
import { createApp, h, markRaw } from 'vue'
import VxeUI from 'vxe-pc-ui'
import { createShapeId } from '@tldraw/editor'
import { createVueEditor } from '../src/editor/createVueEditor'
import { createVueMaterialShapePartials, getVueMaterialSections } from '../src/editor/extensions/material/vueMaterialShape'
import { getEditorPrintDataSource } from '../src/editor/workspaceDataSource'
import LowCodeFormPanel from '../src/components/LowCodeFormPanel.vue'
import { lowCodeHostKey } from '@enlearn/lowcode-framework/core/host'
import { GlobalDialogHost } from '@enlearn/lowcode-framework/runtime'
import { createLocalPrintJobConfig } from '../src/print/localConfig'
import { PrintRenderer } from '../src/print/renderer'
import { PrintManager } from '../src/print/PrintManager'
import { resolveTemplateString } from '../src/print/expression'
import type { VueTemplateWorkspaceConfig } from '../src/editor/templateStore'
import formulaMigration from '../../../supabase/migrations/20261013100000_print_formula_confirm_form.sql?raw'
import formatMigration from '../../../supabase/migrations/20261015110000_print_format_confirm_form.sql?raw'

const formulaSchema = JSON.parse(formulaMigration.split('$schema$')[1])
const formatSchema = JSON.parse(formatMigration.split('$schema$')[1])
let missingFormulaDefinition = false
const formulaDefinitionRequests: Array<Record<string, unknown>> = []

const editor = createVueEditor(document.getElementById('editor')!, { createDefaultShapes: false })
const textId = createShapeId('formula-text')
const materialId = createShapeId('formula-material')
editor.createShape({ id: textId, type: 'vue-text', x: 0, y: 0, props: { text: '金额合计：', w: 560, h: 80, autoSize: false } })
editor.select(textId)
const source = getEditorPrintDataSource(editor)
source.value = {
	type: 'inline', detailField: 'items', rows: [{ amount: 12345.6, orderDate: '2026-10-15T14:30:00', items: [{ amount: 10 }, { amount: '20' }, { amount: 30 }, { amount: 40 }] }],
	detailTables: [{ id: 'items', field: 'items', label: '订单明细', columns: [{ field: 'amount', title: '金额', width: 400 }] }],
}
let workspace: VueTemplateWorkspaceConfig = { pageSizeMm: { w: 210, h: 297 }, previewSettings: { mode: 'data', detailField: 'items' } }
const serviceApi = {
	async invoke(_service: string, _method: string, payload?: Record<string, unknown>) {
		const formCode = (payload?.filters as Record<string, unknown> | undefined)?.code
		if (payload?.resource === 'lowcode_form_definitions' && formCode === 'print-designer.formula') {
			formulaDefinitionRequests.push(payload)
			if (missingFormulaDefinition) return []
		}
		if (payload?.resource === 'lowcode_form_definitions') return [{
			code: formCode === 'print-designer.formula' || formCode === 'print-designer.format' ? formCode : 'print-designer.property.vue-text',
			schema: formCode === 'print-designer.formula'
				? structuredClone(formulaSchema)
				: formCode === 'print-designer.format'
					? structuredClone(formatSchema)
					: { columns: 1, actions: [], fields: [{ field: 'text', label: '文本', component: 'vxe-textarea' }] },
		}]
		return []
	},
}
const app = createApp({ render: () => h('div', [h(LowCodeFormPanel, { editor: markRaw(editor), getWorkspaceTemplateConfig: () => workspace }), h(GlobalDialogHost)]) })
app.use(VxeUI)
app.provide(lowCodeHostKey, { serviceApi: serviceApi as never })
app.mount('#panel')

Object.assign(window, {
	formulaTest: {
		editor,
		getText: () => editor.getShape(textId)!.props.text,
		undo: () => editor.undo(),
		async render() {
			const before = editor.getShape(textId)!.props.text
			const captures: string[] = []
			const originalExport = editor.toImageDataUrl.bind(editor)
			editor.toImageDataUrl = async (...args: Parameters<typeof originalExport>) => {
				captures.push(String(editor.getShape(textId)!.props.text))
				return originalExport(...args)
			}
			try {
				const pages = await new PrintManager(editor).renderPages(createLocalPrintJobConfig(editor, workspace, source.value))
				return { captures, count: pages.length, images: pages.every(page => page.dataUrl.startsWith('data:image/')), restored: editor.getShape(textId)!.props.text === before }
			} finally { editor.toImageDataUrl = originalExport }
		},
		componentPagination() {
			editor.createShapes(createVueMaterialShapePartials({ id: materialId, rect: { x: 0, y: 100, w: 500, h: 320 }, sectionIds: [] }))
			editor.updateShape({ id: materialId, type: 'vue-material', props: { dataSourceField: 'items', bodyRowHeight: 100, headerRowHeight: 30 } })
			workspace = { ...workspace, previewSettings: { mode: 'component', materialId } }
			const config = createLocalPrintJobConfig(editor, workspace, source.value)
			config.data = [...(source.value as { rows: Record<string, unknown>[] }).rows]
			const renderer = new PrintRenderer(editor)
			const jobs = renderer.createRenderJobs(config)
			return jobs.map((job, index) => {
				const context = renderer.createExpressionContext(config, job, index, jobs.length)
				return { total: resolveTemplateString('{{TOTAL(items.amount)}}', context), subtotal: resolveTemplateString('{{TOTAL(items.amount, "page")}}', context), count: context.currentTables.items.rowCount }
			})
		},
		async materialFooterPagination() {
			const id = createShapeId('footer-pagination')
			editor.createShapes(createVueMaterialShapePartials({ id, rect: { x: 0, y: 0, w: 500, h: 500 }, sectionIds: [] }))
			editor.updateShape({ id, type: 'vue-material', meta: { showTableFooter: true, showPageFooter: true }, props: {
				dataSourceField: 'items', bodyRowHeight: 100, headerRowHeight: 30, columns: [{ field: 'amount', title: '金额', width: 500 }],
			} })
			const sections = getVueMaterialSections(editor, id)
			const body = sections.find(section => section.props.zone === 'tableBody')!
			const footer = sections.find(section => section.props.zone === 'tableFooter')!
			const pageFooter = sections.find(section => section.props.zone === 'pageFooter')!
			const frameId = createShapeId('footer-frame')
			const labelId = createShapeId('footer-label')
			editor.createShape({ id: frameId, type: 'vue-frame', parentId: footer.id, x: 10, y: 5, props: { w: 200, h: 45 } })
			editor.createShape({ id: labelId, type: 'vue-text', parentId: frameId, x: 5, y: 8, isLocked: true, props: { text: '本页合计：{{TOTAL(items.amount, "page")}}', w: 180, h: 25, autoSize: false } })
			const config = createLocalPrintJobConfig(editor, { ...workspace, previewSettings: { mode: 'component', materialId: id } }, source.value)
			config.template!.shapeIds = [id]
			config.data = [{ items: [10, 20, 30, 40, 50].map(amount => ({ amount })) }]
			;(config.template!.materialGrids as Record<string, { data: Record<string, unknown>[] }>)[id].data = config.data[0].items as Record<string, unknown>[]
			const renderer = new PrintRenderer(editor)
			const jobs = renderer.createRenderJobs(config)
			const material = jobs[0].materialGridPlan!.materials.find(material => material.material.id === id)!
			const plan = material.pages.map(page => ({ rows: page.data.length, height: page.tableOverride.renderedHeight }))
			const ids = [...editor.getShapeAndDescendantIds([id])]
			const snapshot = () => JSON.stringify(ids.map(shapeId => editor.getShape(shapeId)))
			const before = snapshot()
			const captures: Record<string, unknown>[] = []
			const originalExport = editor.toImageDataUrl.bind(editor)
			const capture = () => ({
				bodyHeight: editor.getShape(body.id)!.props.h,
				footerY: editor.getShape(footer.id)!.y,
				footerHeight: editor.getShape(footer.id)!.props.h,
				frameY: editor.getShapePageBounds(frameId)!.y,
				labelY: editor.getShapePageBounds(labelId)!.y,
				frameHeight: editor.getShape(frameId)!.props.h,
				labelHeight: editor.getShape(labelId)!.props.h,
				text: editor.getShape(labelId)!.props.text,
				pageFooterY: editor.getShape(pageFooter.id)!.y,
				pageFooterHeight: editor.getShape(pageFooter.id)!.props.h,
			})
			const original = capture()
			try {
				editor.toImageDataUrl = async (...args: Parameters<typeof originalExport>) => { captures.push(capture()); return originalExport(...args) }
				const pages = await new PrintManager(editor).renderPages(config)
				const restored = snapshot() === before
				editor.toImageDataUrl = async () => { throw new Error('test export failure') }
				let failed = false
				try { await renderer.renderPage(config, jobs[0].row, 0, jobs.length, jobs[0]) } catch { failed = true }
				const failureRestored = snapshot() === before
				const emptyConfig = structuredClone(config)
				;(emptyConfig.template!.materialGrids as Record<string, { data: Record<string, unknown>[] }>)[id].data = []
				const empty = renderer.createRenderJobs(emptyConfig)[0].materialGridPlan!.materials[0].pages[0]
				// Exact-fit pages should retain the full table body; no spurious gap.
				const exactConfig = structuredClone(config)
				const exactGrid = (exactConfig.template!.materialGrids as Record<string, { data: Record<string, unknown>[]; minRowHeight: number }>)[id]
				exactGrid.data = [{ amount: 1 }, { amount: 2 }]
				exactGrid.minRowHeight = (body.props.h - 30) / 2
				const exact = renderer.createRenderJobs(exactConfig)[0].materialGridPlan!.materials[0]
				return { plan, captures, original, bodyY: body.y, images: pages.every(page => page.dataUrl.startsWith('data:image/')), restored, failed, failureRestored,
					emptyHeight: empty.tableOverride.renderedHeight, exactHeight: exact.pages[0].tableOverride.renderedHeight, exactBodyHeight: exact.tableBody.props.h }
			} finally { editor.toImageDataUrl = originalExport; editor.deleteShapes([id]) }
		},
		setReadonly: (value: boolean) => editor.updateInstanceState({ isReadonly: value }),
		setSource: (value: typeof source.value) => { source.value = value },
		getFormulaDefinitionRequests: () => formulaDefinitionRequests,
		setMissingDefinition: (value: boolean) => { missingFormulaDefinition = value },
		dispose: () => { app.unmount(); editor.dispose() },
	},
})
