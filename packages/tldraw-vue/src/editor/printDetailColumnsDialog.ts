import type { LowCodeHostServiceApi } from '@enlearn/lowcode-framework/core/host'
import { openGlobalDialog } from '@enlearn/lowcode-framework/runtime/global-dialog'
import type { PrintDataSourceDetailColumn, PrintDataSourceDetailTable } from '@/print/types'
import { isLowCodeFormSchema } from './dataSourceForm'

const DETAIL_COLUMNS_FORM_CODE = 'print-designer.detail-table-columns'

export async function openPrintDetailColumnsDialog(
	serviceApi: LowCodeHostServiceApi,
	table: PrintDataSourceDetailTable,
	onConfirm: (columns: PrintDataSourceDetailColumn[]) => Promise<void> | void,
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
	const columns: PrintDataSourceDetailColumn[] = JSON.parse(JSON.stringify(table.columns))
	const prepareColumns = (items: PrintDataSourceDetailColumn[]) => {
		items.forEach((column) => {
			column.visible ??= true
			column.editType ??= isRecord(column.editRender) ? readString(column.editRender.name) : ''
			if (Array.isArray(column.children)) prepareColumns(column.children)
		})
	}
	prepareColumns(columns)
	const model = { columns }
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
			const normalized = normalizeColumns(values.columns)
			await onConfirm(normalized)
		},
	})
}

function normalizeColumns(value: unknown): PrintDataSourceDetailColumn[] {
	if (!Array.isArray(value)) throw new Error('列配置格式无效。')
	return value.filter(isRecord).map((column) => {
		const field = readString(column.field)
		const title = readString(column.title) || field
		const children = Array.isArray(column.children) ? normalizeColumns(column.children) : undefined
		if (!field && !children?.length) throw new Error('请填写每一列的字段名。')
		const widthValue = column.width
		const width = widthValue === '' || widthValue == null ? undefined : Number(widthValue)
		if (width !== undefined && (!Number.isFinite(width) || width <= 0)) {
			throw new Error(`列“${title}”的宽度必须是正数，或留空使用自动宽度。`)
		}
		const { editType, __id, __rowKey, ...rest } = column
		return {
			...rest,
			field,
			title,
			width,
			...(typeof editType === 'string' ? {
				editRender: editType ? {
					...(isRecord(column.editRender) ? column.editRender : {}), name: editType,
				} : {},
			} : {}),
			...(children ? { children } : {}),
		}
	})
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown) {
	return typeof value === 'string' ? value.trim() : ''
}
