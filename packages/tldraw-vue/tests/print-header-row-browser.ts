import '../src/styles.css'
import 'vxe-pc-ui/lib/style.css'
import 'vxe-table/lib/style.css'
import { createApp, h, markRaw, ref } from 'vue'
import VxeUI from 'vxe-pc-ui'
import VxeTable from 'vxe-table'
import { lowCodeHostKey } from '@enlearn/lowcode-framework/core/host'
import { GlobalDialogHost } from '@enlearn/lowcode-framework/runtime'
import PrintDataSourceHeaderTable from '../src/components/PrintDataSourceHeaderTable.vue'
import VueDataSourcePanel from '../src/components/VueDataSourcePanel.vue'
import { createVueEditor } from '../src/editor/createVueEditor'
import { getEditorPrintDataSource } from '../src/editor/workspaceDataSource'

const tables = [
	{ id: 'items', field: 'items', label: '商品明细', dataSourceScript: 'test-items', columns: [{ field: 'amount', title: '金额' }] },
	{ id: 'notes', field: 'notes', label: '备注明细', dataSourceScript: 'test-notes', columns: [{ field: 'amount', title: '内容' }] },
]
const schema = { columns: 1, fields: [{ field: 'code', label: '单号', component: 'vxe-input' }], actions: [] }
const rows = ref([
		{ code: 'A', items: [{ amount: 101, tag: 'A-items' }], notes: [{ amount: 'A-note' }] },
		{ header: { code: 'B' }, extra: { keep: true }, items: [{ amount: 202, tag: 'B-original' }], notes: [{ amount: 'B-note' }] },
])
const readonly = ref(false)
const selectedRow = ref(0)
const panelMode = new URLSearchParams(window.location.search).has('panel')
const editor = panelMode ? createVueEditor(document.getElementById('editor')!, { createDefaultShapes: false }) : undefined
const source = editor ? getEditorPrintDataSource(editor) : undefined
const definition = {
	id: 'row-test', code: 'print-designer.datasource.row-test', name: '表头行测试', enabled: true, table_name: null,
	schema: { ...schema, printDetail: tables },
}
if (source) source.value = {
	type: 'inline', formCode: definition.code, detailField: 'items', detailTables: tables,
	rows: JSON.parse(JSON.stringify(rows.value)),
}
let fetches: Record<string, unknown>[] = []
let saves: Record<string, unknown>[] = []
let releaseFetch: (() => void) | undefined
let deferFetch = false
let failFetch = false
const serviceApi = {
	async invoke(service: string, method: string, payload: Record<string, any> = {}) {
		if (service === 'print' && method === 'resolveDataSource') {
			fetches.push(JSON.parse(JSON.stringify(payload)))
			if (deferFetch) await new Promise<void>(resolve => { releaseFetch = resolve })
			if (failFetch) throw new Error('测试获取失败')
			const code = payload.params.code
			return { records: [{ amount: payload.params.detailField === 'notes' ? `${code}-fetched-note` : code === 'A' ? 101 : 220, tag: `${code}-${payload.params.detailField}` }], metadata: [{ field: 'amount', title: '金额' }, { field: 'tag', title: '标记' }] }
		}
		if (method === 'saveItem') { saves.push(JSON.parse(JSON.stringify(payload))); return {} }
		if (payload.resource !== 'lowcode_form_definitions') return []
		const code = payload.filters?.code
		if (code === definition.code) return [structuredClone(definition)]
		if (code === 'print-designer.datasource-selector') return [{ ...definition, code, schema: { actions: [], fields: [{ field: 'formCode', label: '数据源', component: 'vxe-input' }] } }]
		if (code === 'print-designer.datasource-definition') return [{ ...definition, code, schema: { actions: [], fields: [] } }]
		if (code === 'print-designer.detail-table-columns') return [{ schema: { actions: [], fields: [{ field: 'label', label: '明细名称', component: 'vxe-input' }, { field: 'columns', label: '列', component: 'lc-array-table', props: { columns: [{ field: 'field', title: '字段' }, { field: 'title', title: '标题' }] } }] } }]
		return []
	},
}
let detailEvents = 0
let importEvents = 0
window.addEventListener('enlearn:print-detail-action', () => { detailEvents++ })
window.addEventListener('enlearn:print-data-source-import', () => { importEvents++ })
const app = createApp({ render: () => h('div', [editor ? h(VueDataSourcePanel, { editor: markRaw(editor) }) : h(PrintDataSourceHeaderTable, {
	rows: rows.value,
	schema,
	detailTables: tables,
	readonly: readonly.value,
	activeRowIndex: selectedRow.value,
	saveDetailTables: async (value: typeof tables) => { saves.push(structuredClone(value)); return true },
	'onUpdate:rows': (value: typeof rows.value) => { rows.value = value },
	'onSelect-row': (index: number) => { selectedRow.value = index },
}), h(GlobalDialogHost)]) })
app.use(VxeUI)
app.use(VxeTable)
app.provide(lowCodeHostKey, { serviceApi: serviceApi as never })
app.mount('#panel')
Object.assign(window, { headerRowTest: {
	rows: () => JSON.parse(JSON.stringify(source?.value?.type === 'inline' ? source.value.rows : rows.value)),
	fetches: () => fetches,
	saves: () => saves,
	events: () => ({ detailEvents, importEvents }),
	setReadonly: (value: boolean) => { readonly.value = value },
	selectedRow: () => selectedRow.value,
	deferFetch: (value: boolean) => { deferFetch = value },
	failFetch: (value: boolean) => { failFetch = value },
	releaseFetch: () => { releaseFetch?.(); releaseFetch = undefined },
	dispose: () => { app.unmount(); editor?.dispose() },
} })
