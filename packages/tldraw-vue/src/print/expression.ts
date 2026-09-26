import type { PrintExpressionConfig, PrintExpressionContext } from './types'

const EXPRESSION_PATTERN = /{{\s*([^{}]+?)\s*}}/g

export function resolveTemplateString(
	template: string,
	context: PrintExpressionContext,
	config: PrintExpressionConfig = {}
) {
	return template.replace(EXPRESSION_PATTERN, (raw, expression: string) => {
		const value = resolveExpression(expression.trim(), context, config)
		if (value === undefined) return resolveMissingValue(raw, expression.trim(), context, config)
		return formatExpressionValue(value)
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
	let value = resolvePathExpression(pathExpression, context, config)

	for (const filterExpression of filterExpressions) {
		value = applyFilter(value, filterExpression)
	}

	return value
}

function resolvePathExpression(
	expression: string,
	context: PrintExpressionContext,
	config: PrintExpressionConfig
) {
	const resolver = config.resolvers?.[expression]
	if (resolver) return resolver(context)

	if (expression === 'index') return context.index
	if (expression === 'pageNo') return context.pageNo
	if (expression === 'total') return context.total
	if (expression === 'row') return context.row

	return resolveCurrentRowPath(expression, context.row)
}

/**
 * Detail-table expressions retain their table key in the template (for example,
 * `detail.item_code`), while the renderer passes the matching detail record as
 * `context.row`. Resolve the complete path first so genuinely nested row data
 * keeps precedence, then retry after removing the table key.
 */
function resolveCurrentRowPath(expression: string, row: PrintExpressionContext['row']) {
	const directValue = getPathValue(row, expression)
	if (directValue !== undefined) return directValue

	const separatorIndex = expression.indexOf('.')
	if (separatorIndex <= 0) return directValue

	return getPathValue(row, expression.slice(separatorIndex + 1))
}

function applyFilter(value: unknown, filterExpression: string) {
	const [name, ...args] = filterExpression.split(':').map((part) => part.trim())

	if (name === 'upper') return formatExpressionValue(value).toUpperCase()
	if (name === 'lower') return formatExpressionValue(value).toLowerCase()
	if (name === 'json') return JSON.stringify(value)
	if (name === 'fixed') {
		const digits = Number(args[0] ?? 2)
		const number = Number(value)
		return Number.isFinite(number) ? number.toFixed(Number.isFinite(digits) ? digits : 2) : value
	}

	return value
}

function getPathValue(source: unknown, path: string) {
	if (!path) return undefined
	const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1')
	let current: unknown = source

	for (const key of normalizedPath.split('.')) {
		if (!key) continue
		if (current == null || typeof current !== 'object') return undefined
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
