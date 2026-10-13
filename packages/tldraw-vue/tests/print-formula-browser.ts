import '../src/styles.css'
import 'vxe-pc-ui/lib/style.css'
import { createApp, h, markRaw } from 'vue'
import VxeUI from 'vxe-pc-ui'
import { createShapeId } from '@tldraw/editor'
import { createVueEditor } from '../src/editor/createVueEditor'
import { createVueMaterialShapePartials } from '../src/editor/extensions/material/vueMaterialShape'
import { getEditorPrintDataSource } from '../src/editor/workspaceDataSource'
import LowCodeFormPanel from '../src/components/LowCodeFormPanel.vue'
import { lowCodeHostKey } from '@enlearn/lowcode-framework/core/host'
import { createLocalPrintJobConfig } from '../src/print/localConfig'
import { PrintRenderer } from '../src/print/renderer'
import { PrintManager } from '../src/print/PrintManager'
import { resolveTemplateString } from '../src/print/expression'
import type { VueTemplateWorkspaceConfig } from '../src/editor/templateStore'

const editor = createVueEditor(document.getElementById('editor')!, { createDefaultShapes: false })
const textId = createShapeId('formula-text')
const materialId = createShapeId('formula-material')
editor.createShape({ id: textId, type: 'vue-text', x: 0, y: 0, props: { text: '金额合计：', w: 560, h: 80, autoSize: false } })
editor.select(textId)
const source = getEditorPrintDataSource(editor)
source.value = {
	type: 'inline', detailField: 'items', rows: [{ items: [{ amount: 10 }, { amount: '20' }, { amount: 30 }, { amount: 40 }] }],
	detailTables: [{ id: 'items', field: 'items', label: '订单明细', columns: [{ field: 'amount', title: '金额', width: 400 }] }],
}
let workspace: VueTemplateWorkspaceConfig = { pageSizeMm: { w: 210, h: 297 }, previewSettings: { mode: 'data', detailField: 'items' } }
const serviceApi = {
	async invoke(_service: string, _method: string, payload?: Record<string, unknown>) {
		if (payload?.resource === 'lowcode_form_definitions') return [{
			code: 'print-designer.property.vue-text', schema: { columns: 1, actions: [], fields: [{ field: 'text', label: '文本', component: 'vxe-textarea' }] },
		}]
		return []
	},
}
const app = createApp({ render: () => h(LowCodeFormPanel, { editor: markRaw(editor), getWorkspaceTemplateConfig: () => workspace }) })
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
		setReadonly: (value: boolean) => editor.updateInstanceState({ isReadonly: value }),
		dispose: () => { app.unmount(); editor.dispose() },
	},
})
