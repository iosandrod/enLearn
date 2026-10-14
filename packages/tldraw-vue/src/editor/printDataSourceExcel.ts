import * as XLSX from 'xlsx'
import type { PrintDataSourceDetailTable } from '../print/types'

export type ExcelDataSourceImport = {
	tables: PrintDataSourceDetailTable[]
	model: Record<string, Record<string, unknown>[]>
	headerRowCounts: Record<string, number>
}

const isEmpty = (value: unknown) => value == null || String(value).trim() === ''
const text = (value: unknown) => value == null ? '' : String(value).trim()
const isField = (value: unknown) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(text(value))

/** Each populated worksheet becomes a detail table; no header form is required. */
export function analyzePrintDataSourceExcel(
	workbook: XLSX.WorkBook,
	headerRowCounts: Record<string, number> = {},
): ExcelDataSourceImport {
	const result: ExcelDataSourceImport = { tables: [], model: {}, headerRowCounts: {} }
	workbook.SheetNames.forEach((sheetName, sheetIndex) => {
		const sheet = workbook.Sheets[sheetName]
		if (!sheet) return
		const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false, blankrows: true })
		while (matrix.length && matrix[0].every(isEmpty)) matrix.shift()
		if (!matrix.length || matrix.every(row => row.every(isEmpty))) return
		const width = matrix.reduce((max, row) => Math.max(max, row.length), 0)
		const indexes = Array.from({ length: width }, (_, index) => index)
			.filter(index => matrix.some(row => !isEmpty(row[index])))
		const first = indexes.map(index => matrix[0][index])
		const second = indexes.map(index => matrix[1]?.[index])
		const fieldRow = (row: unknown[]) => row.every(value => isEmpty(value) || isField(value)) && row.some(value => !isEmpty(value))
		const titleRow = (row: unknown[]) => row.every(value => isEmpty(value) || typeof value === 'string' && /[\u3400-\u9fff]/.test(value)) && row.some(value => !isEmpty(value))
		const guessedCount = fieldRow(first) && titleRow(second) || titleRow(first) && fieldRow(second)
			? 2 : first.every(value => isEmpty(value) || typeof value === 'string' && !Number.isFinite(Number(value))) ? 1 : 0
		const field = `detail_${sheetIndex + 1}`
		const override = headerRowCounts[field]
		const count = Math.min(matrix.length, override === 0 || override === 1 || override === 2 ? override : guessedCount)
		const reversed = count === 2 && !fieldRow(first) && fieldRow(second)
		const fields = count ? reversed ? second : first : []
		const titles = count === 2 ? reversed ? first : second : count ? first : []
		const reserved = new Set(['__proto__', 'constructor', 'prototype'])
		const used = new Set<string>()
		const columns = indexes.map((index, columnIndex) => {
			const candidate = text(fields[columnIndex])
			const base = isField(candidate) && !reserved.has(candidate) ? candidate : `field_${index + 1}`
			let key = base
			let suffix = 2
			while (used.has(key)) key = `${base}_${suffix++}`
			used.add(key)
			return { field: key, title: text(titles[columnIndex]) || candidate || `列${index + 1}`, width: 120 }
		})
		result.tables.push({ id: `excel-${field}`, field, label: sheetName, columns })
		result.model[field] = matrix.slice(count)
			.filter(row => indexes.some(index => !isEmpty(row[index])))
			.map(row => Object.fromEntries(columns.map((column, index) => [column.field, row[indexes[index]] ?? ''])))
		result.headerRowCounts[field] = count
	})
	if (!result.tables.length) throw new Error('Excel 中没有可生成明细表的字段或数据。')
	return result
}
