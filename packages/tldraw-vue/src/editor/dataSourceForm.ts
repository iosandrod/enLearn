import type { LowCodeField, LowCodeFormSchema } from '@enlearn/lowcode-framework/types/lowcode'
import type {
	PrintDataRow,
	PrintDataSourceConfig,
	PrintDataSourceDetailColumn,
	PrintDataSourceDetailTable,
	PrintDataSourceFieldReference,
} from '@/print/types'

export type PrintDataSourceFormSchema = LowCodeFormSchema & {
	printDetail?: LowCodeField[] | PrintDataSourceDetailTable[]
}

export interface PrintDataSourceFormDefinition {
	id: string
	code: string
	name: string
	description?: string | null
	table_name: string
	schema: PrintDataSourceFormSchema
	enabled: boolean
}

export type PrintDetailField = LowCodeField

export function getPrintDataSourceDetailTables(
	schema: PrintDataSourceFormSchema,
): PrintDataSourceDetailTable[] {
	const detail = schema.printDetail
	if (!Array.isArray(detail) || !detail.length) return []
	if (detail.every(isLowCodeField)) {
		return [createLegacyDetailTable(detail)]
	}
	return detail
		.filter(isRecord)
		.map((table, index) => normalizeDetailTable(table, index))
		.filter((table): table is PrintDataSourceDetailTable => table !== null)
}

export function getPrintDataSourceDetailFields(schema: PrintDataSourceFormSchema): PrintDetailField[] {
	return getPrintDataSourceDetailTables(schema).flatMap((table) =>
		table.columns.map((column) => ({
			field: column.field,
			label: column.title,
			component: 'vxe-input',
			props: { width: column.width },
		})),
	)
}

export function getPrintDataSourceHeaderSchema(schema: PrintDataSourceFormSchema): LowCodeFormSchema {
	const detailFieldNames = new Set(['detail', 'printDetail'])
	const legacyHeader = schema.fields.find((field) => field.field === 'header')
	const nestedSchema = legacyHeader?.props?.schema
	if (isLowCodeFormSchema(nestedSchema)) {
		return {
			...nestedSchema,
			title: schema.title ?? nestedSchema.title,
		}
	}
	return {
		...schema,
		fields: schema.fields.filter((field) => !detailFieldNames.has(field.field)),
		layout: Array.isArray(schema.layout)
			? schema.layout.filter((node) => node.kind !== 'field' || !detailFieldNames.has(node.field))
			: schema.layout,
	}
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
	definition: PrintDataSourceFormDefinition,
	source?: PrintDataSourceConfig,
): Extract<PrintDataSourceConfig, { type: 'inline' }> {
	// LowCodeForm emits a reactive model; JSON cloning unwraps Vue proxies before
	// the data is persisted into the workspace configuration.
	const normalizedModel = cloneJson(model)
	const detailTables = getPrintDataSourceDetailTables(definition.schema)
	const headerSchema = getPrintDataSourceHeaderSchema(definition.schema)
	const detailField = detailTables[0]?.field
	if (detailField) {
		detailTables.forEach((table) => {
			normalizedModel[table.field] = getPrintDataSourceDetailRows(source, table.field)
		})
	}

	return {
		type: 'inline',
		formCode: definition.code,
		tableName: definition.table_name,
		detailField,
		detailColumns: detailTables[0]?.columns ?? [],
		detailTables,
		headerFields: headerSchema.fields.map((field): PrintDataSourceFieldReference => ({
			field: field.field,
			label: field.label,
		})),
		rows: [normalizedModel],
	}
}

export function getPrintDataSourceFormCode(source: PrintDataSourceConfig | undefined) {
	if (!source || source.type !== 'inline') return ''
	return typeof source.formCode === 'string' ? source.formCode : ''
}

export function getPrintDataSourceDetailRows(
	source: PrintDataSourceConfig | undefined,
	field?: string,
) {
	const row = getInlineSourceRow(source)
	if (!row) return []
	const detailField = field || (
		source && source.type === 'inline' && typeof source.detailField === 'string'
			? source.detailField
			: source && source.type === 'inline' && source.detailTables?.[0]?.field
				? source.detailTables[0].field
				: 'detail'
	)
	const alternateDetailField =
		source && source.type === 'inline' && typeof source.detailField === 'string'
			? source.detailField
			: undefined
	const detail = row[detailField] ?? (alternateDetailField ? row[alternateDetailField] : undefined)
	return Array.isArray(detail) ? detail.filter(isRecord) : []
}

export function getPrintDataSourceDetailColumns(
	source: PrintDataSourceConfig | undefined,
	field?: string,
): PrintDataSourceDetailColumn[] {
	if (source && source.type === 'inline' && field && Array.isArray(source.detailTables)) {
		const table = source.detailTables.find((item) => item.field === field)
		if (table?.columns?.length) return table.columns.map((column) => ({ ...column }))
	}
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

function createLegacyDetailTable(fields: LowCodeField[]): PrintDataSourceDetailTable {
	return {
		id: 'detail',
		field: 'detail',
		label: '明细',
		columns: fields.map((field) => ({
			field: field.field,
			title: field.label,
			width: readPositiveNumber(field.props?.width, 100),
		})),
	}
}

function normalizeDetailTable(
	value: Record<string, unknown>,
	index: number,
): PrintDataSourceDetailTable | null {
	const field = readString(value.field, `detail_${index + 1}`)
	const columns = Array.isArray(value.columns)
		? value.columns.filter(isRecord).map((column) => ({
			...column,
			field: readString(column.field),
			title: readString(column.title, readString(column.field)),
			width: readPositiveNumber(column.width, 100),
		})).filter((column) => column.field)
		: []
	if (!columns.length) return null
	return {
		id: readString(value.id, field),
		field,
		label: readString(value.label, `明细${index + 1}`),
		columns,
		...(isRecord(value.gridOptions) ? { gridOptions: value.gridOptions } : {}),
		...(Array.isArray(value.gridEvents) ? { gridEvents: value.gridEvents.filter(isRecord) } : {}),
	}
}

function getInlineSourceRow(source: PrintDataSourceConfig | undefined) {
	if (!source || source.type !== 'inline' || !Array.isArray(source.rows)) return undefined
	return source.rows.find(isRecord)
}

function getFieldModelValue(field: LowCodeField, sourceRow: PrintDataRow | undefined) {
	if (sourceRow && Object.prototype.hasOwnProperty.call(sourceRow, field.field)) {
		return structuredClone(sourceRow[field.field])
	}
	const legacyHeader = sourceRow?.header
	if (isRecord(legacyHeader) && Object.prototype.hasOwnProperty.call(legacyHeader, field.field)) {
		return structuredClone(legacyHeader[field.field])
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

function isLowCodeField(value: unknown): value is LowCodeField {
	return isRecord(value) && typeof value.field === 'string' && typeof value.label === 'string' && typeof value.component === 'string'
}

function getNestedSchema(field: LowCodeField) {
	const schema = field.props?.schema
	return isLowCodeFormSchema(schema) ? schema : undefined
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
