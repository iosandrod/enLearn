import type { TLShape } from '@tldraw/editor'
import type { PrintExpressionContext } from './types'

export const PRINT_NODE_EXPRESSION_META_KEY = 'printExpression'
export const PRINT_NODE_EXPRESSION_ID_META_KEY = 'printExpressionId'

type NodeExpressionFunction = (context: Readonly<PrintExpressionContext>) => unknown

const expressionFunctionCache = new Map<string, NodeExpressionFunction>()

export function getPrintNodeExpression(shape: Pick<TLShape, 'meta'>) {
	const source = shape.meta?.[PRINT_NODE_EXPRESSION_META_KEY]
	return typeof source === 'string' ? source : ''
}

export function getPrintNodeExpressionId(shape: Pick<TLShape, 'meta'>) {
	const id = shape.meta?.[PRINT_NODE_EXPRESSION_ID_META_KEY]
	return typeof id === 'string' ? id.trim() : ''
}

export function evaluatePrintNodeExpression(
	shape: TLShape,
	context: PrintExpressionContext,
) {
	const source = getPrintNodeExpression(shape).trim()
	if (!source) return undefined

	try {
		return evaluatePrintNodeExpressionSource(source, context)
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error)
		throw new Error(`节点 ${shape.id} 的打印表达式执行失败：${reason}`)
	}
}

export function evaluatePrintNodeExpressionSource(
	source: string,
	context: PrintExpressionContext,
) {
	const expression = source.trim()
	if (!expression) return undefined
	const evaluate = compilePrintNodeExpressionSource(expression)
	if (!evaluate) return undefined

	const result = evaluate(Object.freeze({ ...context }))
	if (isPromiseLike(result)) {
		void Promise.resolve(result).catch(() => undefined)
		throw new Error('暂不支持 async 函数，请直接返回同步结果')
	}
	return result
}

export function compilePrintNodeExpressionSource(source: string) {
	const expression = source.trim()
	if (!expression) return undefined

	let evaluate = expressionFunctionCache.get(expression)
	if (evaluate) return evaluate

	let candidate: unknown
	try {
		candidate = Function(`"use strict"; return (${expression});`)()
	} catch (error) {
		throw new Error(`函数语法错误：${getErrorMessage(error)}`)
	}
	if (typeof candidate !== 'function') {
		throw new Error('表达式必须是函数，例如 (context) => context.row.name')
	}
	evaluate = candidate as NodeExpressionFunction
	expressionFunctionCache.set(expression, evaluate)
	return evaluate
}

export function applyPrintNodeExpressionResult(
	props: Record<string, unknown>,
	result: unknown,
) {
	if (result === undefined) return props
	if (isPlainObject(result)) {
		const nextProps = { ...props }
		for (const [key, value] of Object.entries(result)) {
			if (!(key in props)) throw new Error(`返回对象包含未知节点属性“${key}”`)
			if (value === undefined) continue
			nextProps[key] = value
		}
		return nextProps
	}

	if (!('text' in props)) {
		throw new Error('该节点没有 text 属性，请返回节点属性对象，例如 { src: context.row.imageUrl }')
	}

	return {
		...props,
		text: formatNodeExpressionValue(result),
	}
}

function formatNodeExpressionValue(value: unknown) {
	if (value == null) return ''
	if (value instanceof Date) return value.toISOString()
	if (typeof value === 'string') return value
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
		return String(value)
	}
	return JSON.stringify(value) ?? String(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false
	const prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return Boolean(value && typeof value === 'object' && typeof (value as PromiseLike<unknown>).then === 'function')
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error)
}
