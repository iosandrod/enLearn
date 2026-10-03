import { evaluatePrintNodeExpressionSource } from './nodeExpression.ts'
import type { PrintExpressionConfig, PrintExpressionContext, PrintNamedExpression } from './types'

export interface PrintExpressionRecord {
	id: string
	name: string
	code?: string
	description?: string
	purpose?: string
	templateId?: string
	templateType?: string
	expressionSource: string
	enabled: boolean
	updatedAt?: string
}

export interface PrintExpressionServiceApi {
	invoke<T = unknown>(service: string, action: string, payload?: Record<string, unknown>): Promise<T>
}

type ExpressionRegistry = {
	records: PrintExpressionRecord[]
	loadPromise?: Promise<readonly PrintExpressionRecord[]>
	loaded: boolean
	pendingSaves: Map<string, PrintExpressionRecord>
	listeners: Set<() => void>
}

const registries = new WeakMap<PrintExpressionServiceApi, ExpressionRegistry>()

function getRegistry(serviceApi: PrintExpressionServiceApi): ExpressionRegistry {
	let registry = registries.get(serviceApi)
	if (!registry) {
		registry = { records: [], loaded: false, pendingSaves: new Map(), listeners: new Set() }
		registries.set(serviceApi, registry)
	}
	return registry
}

export function getLoadedPrintExpressions(serviceApi: PrintExpressionServiceApi): readonly PrintExpressionRecord[] {
	return getRegistry(serviceApi).records
}

export async function ensurePrintExpressionsLoaded(
	serviceApi: PrintExpressionServiceApi,
	options: { refresh?: boolean } = {},
): Promise<readonly PrintExpressionRecord[]> {
	const registry = getRegistry(serviceApi)
	if (registry.loadPromise) return registry.loadPromise
	if (registry.loaded && !options.refresh) return registry.records
	registry.loaded = false

	registry.loadPromise = loadAllPrintExpressions(serviceApi)
		.then((records) => {
			const byId = new Map(records.map((record) => [record.id, record]))
			for (const id of registry.pendingSaves.keys()) byId.delete(id)
			registry.records = [...registry.pendingSaves.values(), ...byId.values()]
			registry.pendingSaves.clear()
			registry.loaded = true
			notifyRegistry(registry)
			return registry.records
		})
		.finally(() => {
			registry.loadPromise = undefined
		})

	return registry.loadPromise
}

async function loadAllPrintExpressions(serviceApi: PrintExpressionServiceApi) {
	const records: PrintExpressionRecord[] = []
	const limit = 500
	let offset = 0
	while (true) {
		const result = await serviceApi.invoke<unknown>('admin', 'listItems', {
			resource: 'print_expressions',
			sorts: [{ field: 'updated_at', direction: 'desc' }, { field: 'id', direction: 'asc' }],
			limit,
			offset,
		})
		const rows = readRows(result)
		for (const row of rows) {
			const record = mapPrintExpressionRecord(row)
			if (record) records.push(record)
		}
		if (rows.length < limit) return records
		offset += rows.length
	}
}

export function upsertLoadedPrintExpression(serviceApi: PrintExpressionServiceApi, record: PrintExpressionRecord) {
	const registry = getRegistry(serviceApi)
	if (!registry.loaded) registry.pendingSaves.set(record.id, record)
	registry.records = [record, ...registry.records.filter((item) => item.id !== record.id)]
	notifyRegistry(registry)
}

export function subscribeLoadedPrintExpressions(
	serviceApi: PrintExpressionServiceApi,
	listener: () => void,
) {
	const registry = getRegistry(serviceApi)
	registry.listeners.add(listener)
	return () => registry.listeners.delete(listener)
}

export function createPrintExpressionConfig(
	expressions: readonly PrintNamedExpression[],
): Pick<PrintExpressionConfig, 'namedExpressions'> {
	return { namedExpressions: expressions }
}

export function evaluateNamedPrintExpression(
	record: PrintNamedExpression,
	context: PrintExpressionContext,
) {
	try {
		return evaluatePrintNodeExpressionSource(record.expressionSource, context)
	} catch (error) {
		throw new Error(`表达式“${record.name}”执行失败：${getErrorMessage(error)}`)
	}
}

function readRows(value: unknown): Record<string, unknown>[] {
	if (Array.isArray(value)) return value.filter(isRecord)
	if (isRecord(value) && Array.isArray(value.rows)) return value.rows.filter(isRecord)
	throw new Error('打印表达式列表返回格式错误')
}

function mapPrintExpressionRecord(row: Record<string, unknown>): PrintExpressionRecord | undefined {
	const id = readString(row.id)
	const name = readString(row.name)
	const expressionSource = readString(row.expression_source) || readString(row.source)
	if (!id || !name || !expressionSource) return undefined
	return {
		id,
		name,
		code: readString(row.code),
		description: readString(row.description),
		purpose: readString(row.purpose),
		templateId: readString(row.template_id),
		templateType: readString(row.template_type),
		expressionSource,
		enabled: row.enabled !== false,
		updatedAt: readString(row.updated_at),
	}
}

func