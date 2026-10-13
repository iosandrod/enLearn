import type { PrintDataRow, PrintDataSourceConfig, PrintDataSourceDetailColumn, PrintExpressionContext } from './types'
import { getPrintPreviewDetailRows } from './dataSource.ts'

export const PRINT_FORMULA_FUNCTIONS = [
	{ value: 'TOTAL', label: '合计' },
	{ value: 'MAX', label: '最大值' },
	{ value: 'MIN', label: '最小值' },
	{ value: 'AVERAGE', label: '平均值' },
	{ value: 'COUNT', label: '条数' },
] as const

export type PrintFormulaFunction = typeof PRINT_FORMULA_FUNCTIONS[number]['value']
export type PrintFormulaScope = 'all' | 'page'
export interface PrintFormulaSource {
	field: string
	label: string
	fields: { field: string; label: string }[]
}

const PATH_PATTERN = /^[\p{L}_$][\p{L}\p{N}_$-]*(?:\.[\p{L}_$][\p{L}\p{N}_$-]*)*$/u
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

export function isPrintFormula(expression: string) {
	return /[()]/.test(expression)
}

/** A deliberately small grammar: FUNCTION(detail.field[, "all"|"page"]). */
export function evaluatePrintFormula(expression: string, context: PrintExpressionContext): number | null {
	const match = /^([A-Za-z_]+)\s*\(\s*([^,()]+?)\s*(?:,\s*(["'])(all|page)\3\s*)?\)$/i.exec(expression.trim())
	if (!match) throw new Error('公式格式错误，请使用 TOTAL(明细源.字段) 或 TOTAL(明细源.字段, "page")')
	const name = match[1].toUpperCase() === 'SUM' ? 'TOTAL' : match[1].toUpperCase()
	if (!PRINT_FORMULA_FUNCTIONS.some(item => item.value === name)) throw new Error(`不支持公式函数“${match[1]}”`)
	const path = match[2].trim()
	validatePath(path)
	const [detailField, ...keys] = path.split('.')
	const field = keys.join('.')
	if (name !== 'COUNT' && !field) throw new Error(`${name} 需要选择明细字段`)
	const record = context.record ?? context.row
	const definition = getPrintFormulaSources(context.dataSource, [record]).find(item => item.field === detailField)
	const detailValue = ownValue(record, detailField)
	if (!definition && !Array.isArray(detailValue)) throw new Error(`明细源“${detailField}”不存在`)
	if (detailValue != null && !Array.isArray(detailValue)) throw new Error(`明细源“${detailField}”必须是数组`)
	const allRows = Array.isArray(detailValue) ? detailValue.filter(isRecord) : []
	const scope = (match[4]?.toLowerCase() ?? 'all') as PrintFormulaScope
	let rows: readonly PrintDataRow[] = allRows
	if (scope === 'page') {
		const table = ownValue(context.currentTables, detailField) ?? ownValue(context.currentTable, detailField)
		const detail = ownValue(context.currentDetailRows ?? getPrintPreviewDetailRows(context.row), detailField)
		if (isRecord(table) && Array.isArray(table.data)) rows = table.data.filter(isRecord)
		else if (isRecord(detail)) rows = [detail]
		else throw new Error(`明细源“${detailField}”没有本页数据，请配置对应的预览分页源或物料表格`)
	}
	if (field && !definition?.fields.some(item => item.field === field) &&
		![...allRows, ...rows].some(row => hasPath(row, keys))) {
		throw new Error(`明细源“${detailField}”的字段“${field}”不存在`)
	}
	if (name === 'COUNT' && !field) return rows.length
	const numbers = rows.map(row => readPath(row, keys)).flatMap(value => {
		if (typeof value !== 'number' && typeof value !== 'string') return []
		if (typeof value === 'string' && !value.trim()) return []
		const number = Number(value)
		return Number.isFinite(number) ? [number] : []
	})
	if (name === 'COUNT') return numbers.length
	if (!numbers.length) return name === 'TOTAL' ? 0 : null
	if (name === 'MAX') return numbers.reduce((max, number) => Math.max(max, number), -Infinity)
	if (name === 'MIN') return numbers.reduce((min, number) => Math.min(min, number), Infinity)
	const sum = numbers.reduce((total, number) => total + number, 0)
	const result = name === 'AVERAGE' ? sum / numbers.length : sum
	if (!Number.isFinite(result)) throw new Error('公式计算结果超出数值范围')
	return result
}

export function createPrintFormula(
	name: PrintFormulaFunction,
	detailField: string,
	field: string,
	scope: PrintFormulaScope,
	digits?: number,
) {
	const path = name === 'COUNT' ? detailField : `${detailField}.${field}`
	validatePath(path)
	if (!detailField || (name !== 'COUNT' && !field)) throw new Error('请先选择明细源和字段')
	if (digits !== undefined && (!Number.isInteger(digits) || digits < 0 || digits > 20)) {
		throw new Error('小数位必须是 0 到 20 之间的整数')
	}
	return `{{${name}(${path}${scope === 'page' ? ', "page"' : ''})${digits === undefined ? '' : ` | fixed:${digits}`}}}`
}

/** Include configured fields even for an empty source; infer additional fields from sample records. */
export function getPrintFormulaSources(source: PrintDataSourceConfig | undefined, records: readonly PrintDataRow[]): PrintFormulaSource[] {
	const sources = new Map<string, PrintFormulaSource>()
	const addSource = (field: string, label = field, columns: readonly PrintDataSourceDetailColumn[] = []) => {
		if (!isValidPath(field) || field.includes('.')) return undefined
		let item = sources.get(field)
		if (!item) { item = { field, label, fields: [] }; sources.set(field, item) }
		const addColumns = (values: readonly PrintDataSourceDetailColumn[]) => {
			for (const column of values) {
				if (column.children?.length) addColumns(column.children)
				else if (column.field && isValidPath(column.field) && !item!.fields.some(value => value.field === column.field)) {
					item!.fields.push({ field: column.field, label: column.title || column.field })
				}
			}
		}
		addColumns(columns)
		return item
	}
	if (source?.type === 'inline') {
		const inline = source as Extract<PrintDataSourceConfig, { type: 'inline' }>
		for (const table of inline.detailTables ?? []) addSource(table.field, table.label || table.field, table.columns)
		if (inline.detailField) addSource(inline.detailField, inline.detailField, inline.detailColumns)
	}
	for (const record of records) {
		for (const [field, value] of Object.entries(record)) {
			if (!Array.isArray(value)) continue
			const item = addSource(field)
			if (!item) continue
			const infer = (row: PrintDataRow, prefix = '') => {
				for (const [key, child] of Object.entries(row)) {
					const path = prefix ? `${prefix}.${key}` : key
					if (!isValidPath(path)) continue
					if (isRecord(child)) infer(child, path)
					else if (!Array.isArray(child) && !item.fields.some(value => value.field === path)) item.fields.push({ field: path, label: path })
				}
			}
			for (const row of value.filter(isRecord)) infer(row)
		}
	}
	return [...sources.values()]
}

function isValidPath(path: string) {
	return PATH_PATTERN.test(path) && !path.split('.').some(key => FORBIDDEN_KEYS.has(key))
}
function validatePath(path: string) {
	if (!isValidPath(path)) throw new Error(`无效的公式字段路径“${path}”`)
}
function ownValue(source: unknown, key: string): unknown {
	return source && typeof source === 'object' && Object.prototype.hasOwnProperty.call(source, key)
		? (source as Record<string, unknown>)[key] : undefined
}
function readPath(source: unknown, keys: readonly string[]): unknown {
	return keys.reduce<unknown>((value, key) => ownValue(value, key), source)
}
function hasPath(source: unknown, keys: readonly string[]): boolean {
	let value = source
	for (const key of keys) {
		if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key)) return false
		value = ownValue(value, key)
	}
	return true
}
function isRecord(value: unknown): value is PrintDataRow {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
