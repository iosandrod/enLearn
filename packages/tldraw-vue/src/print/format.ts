import { buildPrintDataSourceTree, type PrintDataSourceTreeNode } from '../editor/printDataSourceFields.ts'
import type { PrintDataRow, PrintDataSourceConfig } from './types'

export type PrintValueFormatType = 'number' | 'date'

export type PrintValueFormatOptions = {
	variable: string
	type: PrintValueFormatType
	digits?: number
	useGrouping?: boolean
	dateFormat?: string
}

export type ParsedPrintValueFormat = {
	variable: string
	type: PrintValueFormatType
	digits: number
	useGrouping: boolean
	dateFormat: string
}

const PATH_PATTERN = /^[\p{L}_$][\p{L}\p{N}_$-]*(?:\.[\p{L}_$][\p{L}\p{N}_$-]*)*$/u
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

export function createPrintValueFormat(options: PrintValueFormatOptions) {
	const variable = options.variable.trim()
	if (!isPrintValuePath(variable)) throw new Error('请选择有效的变量。')

	if (options.type === 'number') {
		const digits = options.digits ?? 2
		if (!Number.isInteger(digits) || digits < 0 || digits > 20) {
			throw new Error('小数位必须是 0 到 20 之间的整数。')
		}
		return `{{${variable} | number:${digits}${options.useGrouping ? ':group' : ''}}}`
	}

	const format = options.dateFormat?.trim() || 'YYYY-MM-DD'
	if (!DATE_FORMATS.has(format)) throw new Error('不支持的日期格式。')
	return `{{${variable} | date:${format}}}`
}

export function isPrintValuePath(path: string) {
	return PATH_PATTERN.test(path) && !path.split('.').some(key => FORBIDDEN_KEYS.has(key))
}

/** Read saved formatting so reopening the dialog restores its controls. */
export function getPrintValueFormats(text: string) {
	const result: ParsedPrintValueFormat[] = []
	for (const match of text.matchAll(/{{\s*([^{}]+?)\s*}}/g)) {
		const [rawVariable, ...filters] = match[1].split('|').map(part => part.trim())
		if (!isPrintValuePath(rawVariable)) continue
		for (const filter of filters) {
			const number = /^number(?::(\d+))?(?::(group))?$/.exec(filter)
			if (number) {
				const digits = Number(number[1] ?? 2)
				if (Number.isInteger(digits) && digits >= 0 && digits <= 20) {
					result.push({ variable: rawVariable, type: 'number', digits, useGrouping: number[2] === 'group', dateFormat: 'YYYY-MM-DD' })
				}
				break
			}
			if (filter.startsWith('date:')) {
				const dateFormat = filter.slice('date:'.length).trim()
				if (DATE_FORMATS.has(dateFormat)) {
					result.push({ variable: rawVariable, type: 'date', digits: 2, useGrouping: true, dateFormat })
				}
				break
			}
		}
	}
	return result
}

export function getPrintValueFormat(text: string, variable?: string) {
	return getPrintValueFormats(text).find(item => !variable || item.variable === variable)
}

/** Reformat existing occurrences; a new variable is appended like formula insertion. */
export function applyPrintValueFormat(text: string, variable: string, expression: string) {
	let replaced = false
	const updated = text.replace(/{{\s*([^{}]+?)\s*}}/g, (raw, content: string) => {
		if (content.split('|')[0].trim() !== variable) return raw
		replaced = true
		return expression
	})
	return replaced ? updated : text + expression
}

export function getPrintFormatVariables(source: PrintDataSourceConfig | undefined, rows: readonly PrintDataRow[], text: string) {
	const result = new Map<string, { label: string; value: string }>()
	const add = (path: string, label = path) => {
		if (isPrintValuePath(path) && !result.has(path)) result.set(path, { label: label === path ? path : `${label}（${path}）`, value: path })
	}
	// Existing text variables stay available when data is empty or temporarily unavailable.
	for (const match of text.matchAll(/{{\s*([^{}]+?)\s*}}/g)) add(match[1].split('|')[0].trim())
	const visit = (nodes: PrintDataSourceTreeNode[]) => {
		for (const node of nodes) {
			if (node.path) add(node.path, node.label)
			if (node.children) visit(node.children)
		}
	}
	const inline = source?.type === 'inline' ? source as Extract<PrintDataSourceConfig, { type: 'inline' }> : undefined
	visit(buildPrintDataSourceTree({ ...inline, type: 'inline', rows }))
	return [...result.values()]
}

export const PRINT_DATE_FORMATS = [
	'YYYY-MM-DD',
	'YYYY/MM/DD',
	'YYYY年MM月DD日',
	'YYYY-MM-DD HH:mm',
	'YYYY-MM-DD HH:mm:ss',
	'HH:mm:ss',
] as const

const DATE_FORMATS = new Set<string>(PRINT_DATE_FORMATS)
