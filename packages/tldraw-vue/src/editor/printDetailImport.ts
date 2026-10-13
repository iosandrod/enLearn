import type { LowCodeHostServiceApi } from '@enlearn/lowcode-framework/core/host'
import { openGlobalDialog } from '@enlearn/lowcode-framework/runtime/global-dialog'
import type { LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode'
import { h } from 'vue'
import * as XLSX from 'xlsx'
import DetailImportTemplatePicker from '../components/DetailImportTemplatePicker.vue'
import type { PrintDataSourceDetailTable } from '../print/types'
import { isLowCodeFormSchema } from './dataSourceForm'

type DetailImportConfig = {
	hasFieldRow: boolean
	hasChineseRow: boolean
	sheetName: string
	mode: 'append' | 'replace'
}

/** This import owns its file picker and returns data without touching workspace records. */
export async function importPrintDetailData(
	serviceApi: LowCodeHostServiceApi,
	table: PrintDataSourceDetailTable,
	options: { title?: string; emptyMessage?: string } = {},
) {
	let schema: LowCodeFormSchema = {
		columns: 2,
		fields: [
			{ field: 'hasFieldRow', label: '包含 field 行', component: 'vxe-switch', defaultValue: true },
			{ field: 'hasChineseRow', label: '包含中文行', component: 'vxe-switch', defaultValue: false },
			{ field: 'sheetName', label: '工作表名称', component: 'vxe-input', props: { placeholder: '留空使用第一个工作表' } },
			{ field: 'mode', label: '导入方式', component: 'vxe-select', options: [
				{ label: '追加到现有数据', value: 'append' },
				{ label: '替换现有数据', value: 'replace' },
			], defaultValue: 'append' },
		],
		actions: [],
	}
	try {
		const definitions = await serviceApi.invoke<Array<{ schema?: unknown }>>('lowcode', 'listItems', {
			resource: 'lowcode_form_definitions',
			filters: { code: 'print-designer.datasource-detail-import', enabled: true }, limit: 1,
		})
		if (isLowCodeFormSchema(definitions[0]?.schema)) schema = structuredClone(definitions[0].schema)
	} catch {
		// Keep local import available when the form catalog cannot be reached.
	}
	const result = await openGlobalDialog<DetailImportConfig>({
		title: options.title ?? '导入明细数据', width: 680,
		model: { hasFieldRow: true, hasChineseRow: false, sheetName: '', mode: 'append' },
		content: [
			{ type: 'form', form: { schema } },
			{ type: 'render', render: context => h(DetailImportTemplatePicker, {
				modelValue: { hasFieldRow: Boolean(context.model.hasFieldRow), hasChineseRow: Boolean(context.model.hasChineseRow) },
				columns: table.columns,
				'onUpdate:modelValue': value => context.updateModel(value),
			}) },
		],
		actions: [
			{ code: 'cancel', label: '取消', role: 'cancel' },
			{ code: 'confirm', label: '开始导入', role: 'confirm', status: 'primary' },
		],
	})
	if (result.action !== 'confirm') return
	const file = await new Promise<File | undefined>(resolve => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.xlsx,.xls,.csv'
		input.addEventListener('change', () => resolve(input.files?.[0]), { once: true })
		input.addEventListener('cancel', () => resolve(undefined), { once: true })
		input.click()
	})
	if (!file) return
	const config = result.values
	const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
	const sheetName = config.sheetName.trim() || workbook.SheetNames[0]
	const sheet = workbook.Sheets[sheetName]
	if (!sheet) throw new Error('未找到指定的 Excel 工作表。')
	const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false })
	const columns = table.columns.filter(column => column.field)
	const dataRows = matrix.map(row => row.map(value => value == null ? '' : String(value)))
	let indexes = columns.map((_column, index) => index)
	if (config.hasFieldRow && dataRows.length) {
		const fieldRow = dataRows.shift()!
		indexes = columns.map((column, index) => {
			const match = fieldRow.findIndex(value => value.trim() === column.field || value.trim() === column.title)
			return match >= 0 ? match : index
		})
	}
	if (config.hasChineseRow) dataRows.shift()
	const rows = dataRows.filter(row => row.some(value => value.trim()))
		.map(row => Object.fromEntries(columns.map((column, index) => [column.field, row[indexes[index]] ?? ''])))
	if (!rows.length) throw new Error(options.emptyMessage ?? 'Excel 中没有可导入的明细数据。')
	return { rows, mode: config.mode }
}
