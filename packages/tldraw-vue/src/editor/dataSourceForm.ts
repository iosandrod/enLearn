import type { LowCodeField, LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode'
import type {
	PrintDataRow,
	PrintDataSourceConfig,
	PrintDataSourceDetailColumn,
} from '@/print/types'

export interface PrintDataSourceFormDefinition {
	id: string
	code: string
	name: string
	description?: string | null
	table_name: string
	schema: LowCodeFormSchema
	enabled: boolean
}

export function isPrintDataSourceFormDefinition(
	value: unknown
): value is PrintDataSourceFormDefinition {
	if (!isRecord(value)) return false
	return (
		typeof value.id === 'string' &&
		typeof value.code === 'string' &&
		typeof value.name === 'string' &&
		typeof value.table_name === 'string' &&
		value.table_name.trim().length > 0 &&
		value.enabled !== false &&
		isLowCodeFormSchema(value.schema)
	)
}

export function getPrintDataSourceFormModel(
	source: PrintDataSourceConfig | undefined,
	schema: LowCodeFormSchema
): Record<string, unknown> {
	const sourceRow = getInlineSourceRow(source)
	return Object.fromEntries(
		schema.fields.map((field) => [field.field, getFieldModelValue(field, sourceRow)])
	)
}

export function createInlinePrintDataSource(
	model: Record<string, unknown>,
	definition: PrintDataSourceFormDefinition
): Extract<PrintDataSourceConfig, { type: 'inline' }> {
	const subFormField = definition.schema.fields.find((field) => field.component === 'lc-sub-form')
	const detailField = definition.schema.fields.find((field) => field.component === 'lc-array-table')
	const headerValue = subFormField ? model[subFormField.field] : undefined
	const header = isRecord(headerValue) ? { ...headerValue } : {}
	// LowCodeForm emits a reactive model; JSON cloning unwraps Vue proxies before
	// the data is persisted into the workspace configuration.
	const normalizedModel = cloneJson(model)

	if (detailField) {
		normalizedModel[detailField.field] = normalizeDetailRows(model[detailField.field])
	}

	return {
		type: 'inline',
		formCode: definition.code,
		tableName: definition.table_name,
		detailField: detailField?.field,
		detailColumns: detailField ? readDetailColumns(detailField) : [],
		rows: [{ ...header, ...normalizedModel }],
	}
}

export function getPrintDataSourceFormCode(source: PrintDataSourceConfig | undefined) {
	if (!source || source.type !== 'inline') return ''
	return typeof source.formCode === 'string' ? source.formCode : ''
}

export function getPrintDataSourceDetailRows(source: PrintDataSourceConfig | undefined) {
	const row = getInlineSourceRow(source)
	if (!row) return []
	const detailField =
		source && source.type === 'inline' && typeof source.detailField === 'string'
			? source.detailField
			: 'detail'
	const detail = row[detailField]
	return Array.isArray(detail) ? detail.filter(isRecord) : []
}

export function getPrintDataSourceDetailColumns(
	source: PrintDataSourceConfig | undefined
): PrintDataSourceDetailColumn[] {
	if (source && source.type === 'inline' && Array.isArray(source.detailColumns)) {
		const columns = source.detailColumns
			.filter(isRecord)
			.map((column) => ({
				field: readString(column.field),
				title: readString(column.title, readString(column.field)),
				width: readPositiveNumber(column.width, 100),
			}))
			.filter((column) => column.field)
		if (columns.length) return columns
	}

	const firstRow = getPrintDataSourceDetailRows(source)[0]
	if (!firstRow) return []
	return Object.keys(firstRow)
		.filter((field) => !field.startsWith('_'))
		.map((field) => ({ field, title: field, width: 100 }))
}

function getInlineSourceRow(source: PrintDataSourceConfig | undefined) {
	if (!source || source.type !== 'inline' || !Array.isArray(source.rows)) return undefined
	return source.rows.find(isRecord)
}

function getFieldModelValue(field: LowCodeField, sourceRow: PrintDataRow | undefined) {
	if (sourceRow && Object.prototype.hasOwnProperty.call(sourceRow, field.field)) {
		return structuredClone(sourceRow[field.field])
	}

	if (field.component === 'lc-sub-form') {
		const nestedSchema = getNestedSchema(field)
		if (!nestedSchema) return {}
		return Object.fromEntries(
			nestedSchema.fields.map((nestedField) => [
				nestedField.field,
				sourceRow?.[nestedField.field] ?? getDefaultFieldValue(nestedField),
			])
		)
	}

	if (field.component === 'lc-array-table') return []
	return getDefaultFieldValue(field)
}

function getDefaultFieldValue(field: LowCodeField) {
	if (field.defaultValue !== undefined) return structuredClone(field.defaultValue)
	if (field.component === 'vxe-switch') return false
	return ''
}

function getNestedSchema(field: LowCodeField) {
	const schema = field.props?.schema
	return isLowCodeFormSchema(schema) ? schema : undefined
}

function readDetailColumns(field: LowCodeField): PrintDataSourceDetailColumn[] {
	const columns = Array.isArray(field.props?.columns) ? field.props.columns : []
	return columns
		.filter(isRecord)
		.map((column) => ({
			field: readString(column.field),
			title: readString(column.title, readString(column.field)),
			width: readPositiveNumber(column.width, 100),
		}))
		.filter((column) => column.field)
}

function normalizeDetailRows(value: unknown) {
	if (!Array.isArray(value)) return []
	return value.filter(isRecord).map((row, index) => ({
		...row,
		_rowId: row._rowId ?? `detail-${index + 1}`,
	}))
}

export function isLowCodeFormSchema(value: unknown): value is LowCodeFormSchema {
	if (!isRecord(value) || !Array.isArray(value.fields) || !Array.isArray(value.actions)) {
		return false
	}
	if (value.layout !== undefined && !Array.isArray(value.layout)) return false
	return value.fields.every(
		(field) =>
			isRecord(field) &&
			typeof field.field === 'string' &&
			typeof field.label === 'string' &&
			typeof field.component === 'string'
	)
}

function readString(value: unknown, fallback = '') {
	return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function readPositiveNumber(value: unknown, fallback: number) {
	const number = Number(value)
	return Number.isFinite(number) && number > 0 ? number : fallback
}

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
