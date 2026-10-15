import { evaluateNamedPrintExpression } from './expressions.ts'
import { getPrintPreviewDetailRows } from './dataSource.ts'
import { evaluatePrintFormula, isPrintFormula } from './formula.ts'
import { PRINT_DATE_FORMATS } from './format.ts'
import type { PrintExpressionConfig, PrintExpressionContext, PrintNamedExpression } from './types'

const EXPRESSION_PATTERN = /{{\s*([^{}]+?)\s*}}/g

export function resolveTemplateString(
	template: string,
	context: PrintExpressionContext,
	config: PrintExpressionConfig = {}
) {
	return template.replace(EXPRESSION_PATTERN, (raw, expression: string) => {
		try {
			const value = resolveExpression(expression.trim(), context, config)
			if (value === undefined) return resolveMissingValue(raw, expression.trim(), context, config)
			return formatExpressionValue(value)
		} catch (error) {
			if (!isPrintFormula(expression)) throw error
			throw new Error(`公式“${raw}”解析失败：${error instanceof Error ? error.message : String(error)}`)
		}
	})
}

export function resolveObjectExpressions<T>(
	value: T,
	context: PrintExpressionContext,
	config: PrintExpressionConfig = {}
): T {
	if (typeof value === 'string') {
		return resolveTemplateString(value, context, config) as T
	}

	if (Array.isArray(value)) {
		return value.map((item) => resolveObjectExpressions(item, context, config)) as T
	}

	if (value && typeof value === 'object') {
		const result: Record<string, unknown> = {}
		for (const [key, child] of Object.entries(value)) {
			result[key] = resolveObjectExpressions(child, context, config)
		}
		return result as T
	}

	return value
}

function resolveExpression(
	expression: string,
	context: PrintExpressionContext,
	config: PrintExpressionConfig
) {
	const [pathExpression, ...filterExpressions] = expression.split('|').map((part) => part.trim())
	const formula = isPrintFormula(pathExpression)
	let value = formula ? evaluatePrintFormula(pathExpression, context) : resolvePathExpression(pathExpression, context, config)

	for (const filterExpression of filterExpressions) {
		if (formula && !/^(upper|lower|json|fixed(?::\d+)?|number(?::\d+(?::group)?)?|date:.+)$/.test(filterExpression)) {
			throw new Error(`不支持公式格式化“${filterExpression}”`)
		}
		value = applyFilter(value, filterExpression)
	}

	return value
}

function resolvePathExpression(
	expression: string,
	context: PrintExpressionContext,
	config: PrintExpressionConfig
) {
	if (expression.includes('.')) {
		const details = context.currentDetailRows ?? getPrintPreviewDetailRows(context.row)
		const detailValue = getPathValue(details, expression)
		if (detailValue !== undefined) return detailValue
	}
	const rowValue = getPathValue(context.row, expression)
	if (rowValue !== undefined) return rowValue

	const namedExpression = findNamedExpression(expression, config.namedExpressions)
	if (namedExpression) {
		return evaluateNamedPrintExpression(namedExpression, context)
	}

	// Keep the older programmatic API as a final fallback. Template literals and
	// saved expressions always win, so a visible {{key}} is never redirected by
	// hidden node metadata or a built-in alias.
	const resolver = config.resolvers?.[expression]
	if (resolver) return resolver(context)
	if (expression === 'index') return context.index
	if (expression === 'pageNo') return context.pageNo
	if (expression === 'total') return context.total
	if (expression === 'row') return context.row
	return undefined
}

function findNamedExpression(
	name: string,
	expressions: readonly PrintNamedExpression[] | undefined,
) {
	if (!expressions?.length) return undefined
	const literal = name.trim()
	return expressions.find((item) =>
		item.enabled !== false && (item.name.trim() === literal || item.code?.trim() === literal)
	)
}

function applyFilter(value: unknown, filterExpression: string) {
	const separator = filterExpression.indexOf(':')
	const name = (separator < 0 ? filterExpression : filterExpression.slice(0, separator)).trim()
	const args = (separator < 0 ? [] : filterExpression.slice(separator + 1).split(':')).map((part) => part.trim())

	if (name === 'upper') return formatExpressionValue(value).toUpperCase()
	if (name === 'lower') return formatExpressionValue(value).toLowerCase()
	if (name === 'json') return JSON.stringify(value)
	if (name === 'fixed') {
		if (value == null) return value
		const digits = Number(args[0] ?? 2)
		if (!Number.isInteger(digits) || digits < 0 || digits > 100) throw new Error('小数位必须是 0 到 100 之间的整数')
		const number = Number(value)
		return Number.isFinite(number) ? number.toFixed(Number.isFinite(digits) ? digits : 2) : value
	}
	if (name === 'number') {
		if (value == null) return value
		const digits = Number(args[0] ?? 2)
		if (!Number.isInteger(digits) || digits < 0 || digits > 20) throw new Error('小数位必须是 0 到 20 之间的整数')
		const number = Number(value)
		if (!Number.isFinite(number)) return value
		return new Intl.NumberFormat('zh-CN', {
			useGrouping: args[1] === 'group', minimumFractionDigits: digits, maximumFractionDigits: digits,
		}).format(number)
	}
	if (name === 'date') {
		if (value == null || value === '') return value
		const format = args.join(':') || 'YYYY-MM-DD'
		if (!PRINT_DATE_FORMATS.includes(format as typeof PRINT_DATE_FORMATS[number])) throw new Error('不支持的日期格式')
		const date = value instanceof Date ? value : new Date(value as string | number)
		if (Number.isNaN(date.getTime())) throw new Error('日期值无效')
		return formatDate(date, format)
	}

	return value
}

function formatDate(date: Date, format: string) {
	const parts = {
		YYYY: String(date.getFullYear()), MM: String(date.getMonth() + 1).padStart(2, '0'), DD: String(date.getDate()).padStart(2, '0'),
		HH: String(date.getHours()).padStart(2, '0'), mm: String(date.getMinutes()).padStart(2, '0'), ss: String(date.getSeconds()).padStart(2, '0'),
	}
	return format.replace(/YYYY|MM|DD|HH|mm|ss/g, token => parts[token as keyof typeof parts])
}

function getPathValue(source: unknown, path: string) {
	if (!path) return undefined
	const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1')
	let current: unknown = source

	for (const key of normalizedPath.split('.')) {
		if (!key) continue
		if (current == null || typeof current !== 'object') return undefined
		if (!Object.prototype.hasOwnProperty.call(current, key)) return undefined
		current = (current as Record<string, unknown>)[key]
	}

	return current
}

function formatExpressionValue(value: unknown) {
	if (value == null) return ''
	if (value instanceof Date) return value.toISOString()
	if (typeof value === 'string') return value
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
		return String(value)
	}
	return JSON.stringify(value)
}

function resolveMissingValue(
	rawExpression: string,
	expression: string,
	context: PrintExpressionContext,
	config: PrintExpressionConfig
) {
	const missingValue = config.missingValue ?? 'empty'
	if (missingValue === 'keep') return rawExpression
	if (typeof missingValue === 'function') return missingValue(expression, context)
	return ''
}
