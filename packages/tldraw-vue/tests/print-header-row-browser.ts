import '../src/styles.css'
import 'vxe-pc-ui/lib/style.css'
import 'vxe-table/lib/style.css'
import { createApp, h, ref } from 'vue'
import VxeUI from 'vxe-pc-ui'
import VxeTable from 'vxe-table'
import { lowCodeHostKey } from '@enlearn/lowcode-framework/core/host'
import { GlobalDialogHost } from '@enlearn/lowcode-framework/runtime'
import PrintDataSourceHeaderTable from '../src/components/PrintDataSourceHeaderTable.vue'

const tables = [
	{ id: 'items', field: 'items', label: '商品明细', dataSourceScript: 'test-items', columns: [{ field: 'amount', title: '金额' }] },
	{ id: 'notes', field: 'notes', label: '备注明细', dataSourceScript: 'test-notes', columns: [{ field: 'amount', title: '内容' }] },
]
const schema = { columns: 1, fields: [{ field: 'code', label: '单号', component: 'vxe-input' }] }
const rows = ref([
		{ code: 'A', items: [{ amount: 101, tag: 'A-items' }], notes: [{ amount: 'A-note' }] },
		{ code: 'B', items: [{ amount: 202, tag: 'B-original' }], notes: [{ amount: 'B-note' }] },
])
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
		if (code === 'print-designer.detail-table-columns') return [{ schema: { fields: [{ field: 'label', label: '明细名称', component: 'vxe-input' }, { field: 'columns', label: '列', component: 'lc-array-table', props: { columns: [{ field: 'field', title: '字段' }, { field: 'title', title: '标题' }] } }] } }]
		return []
	},
}
let detailEvents = 0
let importEvents = 0
window.addEventListener('enlearn:print-detail-action', () => { detailEvents++ })
window.addEventListener('enlearn:print-data-source-import', () => { importEvents++ })
const app = createApp({ render: () => h('div', [h(PrintDataSourceHeaderTable, {
	rows: rows.value,
	schema,
	detailTables: tables,
	readonly: false,
	saveDetailTables: async (value: typeof tables) => { saves.push(structuredClone(value)); return true },
	'onUpdate:rows': (value: typeof rows.value) => { rows.value = value },
}), h(GlobalDialogHost)]) })
app.use(VxeUI)
app.use(VxeTable)
app.provide(lowCodeHostKey, { serviceApi: serviceApi as never })
app.mount('#panel')
Object.assign(window, { headerRowTest: {
	rows: () => JSON.parse(JSON.stringify(rows.value)),
	fetches: () => fetches,
	saves: () => saves,
	events: () => ({ detailEvents, importEvents }),
	deferFetch: (value: boolean) => { deferFetch = value },
	failFetch: (value: boolean) => { failFetch = value },
	releaseFetch: () => { releaseFetch?.(); releaseFetch = undefined },
	dispose: () => { app.unmount() },
} })
