import type { PrintDataSourceDetailColumn } from '@/print/types'

/** Give the column editor a detached draft, including its edit-type alias. */
export function createPrintDetailColumnsModel(columns: readonly PrintDataSourceDetailColumn[]) {
	const draft: PrintDataSourceDetailColumn[] = JSON.parse(JSON.stringify(columns))
	const prepare = (items: PrintDataSourceDetailColumn[]) => {
		items.forEach((column) => {
			column.visible ??= true
			column.editType ??= isRecord(column.editRender) ? readString(column.editRender.name) : ''
			if (Array.isArray(column.children)) prepare(column.children)
		})
	}
	prepare(draft)
	return draft
}

/** Live inputs may contain incomplete values while the user is typing. */
export function normalizePrintDetailColumns(value: unknown, validate = true): PrintDataSourceDetailColumn[] {
	if (!Array.isArray(value)) throw new Error('列配置格式无效。')
	return value.filter(isRecord).map((column) => {
		const field = readString(column.field)
		const title = readString(column.title) || field
		const children = Array.isArray(column.children) ? normalizePrintDetailColumns(column.children, validate) : undefined
		if (validate && !field && !children?.length) throw new Error('请填写每一列的字段名。')
		const widthValue = column.width
		const width = widthValue === '' || widthValue == null ? undefined : Number(widthValue)
		if (validate && width !== undefined && (!Number.isFinite(width) || width <= 0)) {
			throw new Error(`列“${title}”的宽度必须是正数，或留空使用自动宽度。`)
		}
		const { editType, __id, __rowKey, ...rest } = column
		return {
			...rest,
			field: validate ? field : String(column.field ?? ''),
			title: validate ? title : String(column.title ?? ''),
			width: width !== undefined && Number.isFinite(width) && width > 0 ? width : undefined,
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
