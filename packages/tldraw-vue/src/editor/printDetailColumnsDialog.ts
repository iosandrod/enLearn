import type { LowCodeHostServiceApi } from '@enlearn/lowcode-framework/core/host'
import { openGlobalDialog } from '@enlearn/lowcode-framework/runtime/global-dialog'
import type { PrintDataSourceDetailTable } from '@/print/types'
import { isLowCodeFormSchema } from './dataSourceForm'
import { createPrintDetailColumnsModel, normalizePrintDetailColumns } from './printDetailColumns'

const DETAIL_COLUMNS_FORM_CODE = 'print-designer.detail-table-columns'

export async function openPrintDetailColumnsDialog(
	serviceApi: LowCodeHostServiceApi,
	table: PrintDataSourceDetailTable,
	onConfirm: (config: PrintDataSourceDetailTable) => Promise<void> | void,
) {
	const rows = await serviceApi.invoke<Array<{ schema?: unknown }>>('lowcode', 'listItems', {
		resource: 'lowcode_form_definitions',
		filters: { code: DETAIL_COLUMNS_FORM_CODE, enabled: true },
		limit: 1,
	})
	const schema = Array.isArray(rows) ? rows[0]?.schema : undefined
	if (!isLowCodeFormSchema(schema) || !schema.fields.some((field) => field.field === 'columns')) {
		throw new Error(`低代码表单“${DETAIL_COLUMNS_FORM_CODE}”不存在、已停用或 schema 无效。`)
	}
	// Stored column definitions are JSON. Clone nested formatter/renderer options
	// as well so cancelling the dialog cannot change the original definition.
	const columns = createPrintDetailColumnsModel(table.columns)
	const model = { ...table, columns }
	return openGlobalDialog<typeof model>({
		title: `配置明细列 - ${table.label}`,
		width: 'min(1100px, calc(100vw - 40px))',
		model,
		form: { schema: structuredClone(schema), model },
		actions: [
			{ code: 'cancel', label: '取消', role: 'cancel' },
			{ code: 'confirm', label: '确定', role: 'confirm', status: 'primary' },
		],
		onConfirm: async ({ model: values }) => {
			const normalized = normalizePrintDetailColumns(values.columns)
			values={...values, columns: normalized}
			await onConfirm(values)//
		},
	})
}
