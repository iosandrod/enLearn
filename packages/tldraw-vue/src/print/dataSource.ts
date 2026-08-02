import type { PrintDataRow, PrintDataSourceConfig, PrintDataSourceProvider } from './types'

const providerRegistry = new Map<string, PrintDataSourceProvider>()

type InlinePrintDataSourceConfig = Extract<PrintDataSourceConfig, { type: 'inline' }>
type JsonPrintDataSourceConfig = Extract<PrintDataSourceConfig, { type: 'json' }>
type CsvPrintDataSourceConfig = Extract<PrintDataSourceConfig, { type: 'csv' }>
type HttpPrintDataSourceConfig = Extract<PrintDataSourceConfig, { type: 'http' }>

registerPrintDataSourceProvider({
	type: 'inline',
	async resolve(config: InlinePrintDataSourceConfig) {
		return normalizeRows(config.rows)
	},
})

registerPrintDataSourceProvider({
	type: 'json',
	async resolve(config: JsonPrintDataSourceConfig) {
		const parsed = parseJsonValue(config.value, 'JSON data source value must be valid JSON.')
		return normalizeRows(readPath(parsed, config.dataPath))
	},
})

registerPrintDataSourceProvider({
	type: 'csv',
	async resolve(config: CsvPrintDataSourceConfig) {
		return parseCsv(config.value, config)
	},
})

registerPrintDataSourceProvider({
	type: 'http',
	async resolve(config: HttpPrintDataSourceConfig) {
		const response = await fetch(config.url, {
			method: config.method ?? 'GET',
			headers: normalizeHeaders(config.headers),
			body: createHttpBody(config),
			...config.requestInit,
		})

		if (!response.ok) {
			throw new Error(`Print data source request failed: ${response.status} ${response.statusText}`)
		}

		const contentType = response.headers.get('content-type') ?? ''
		const value = contentType.includes('application/json') ? await response.json() : await response.text()
		return normalizeRows(readPath(value, config.dataPath))
	},
})

export function registerPrintDataSourceProvider(provider: PrintDataSourceProvider) {
	if (!provider.type.trim()) throw new Error('Print data source provider type is required.')
	providerRegistry.set(provider.type, provider)
	return () => {
		if (providerRegistry.get(provider.type) === provider) providerRegistry.delete(provider.type)
	}
}

export function getPrintDataSourceProvider(type: string) {
	return providerRegistry.get(type)
}

export async function resolvePrintDataSource(
	dataSource: PrintDataSourceConfig | undefined,
	context: { signal?: AbortSignal } = {}
): Promise<PrintDataRow[] | undefined> {
	if (!dataSource || dataSource.type === 'none') return undefined
	throwIfAborted(context.signal)

	const provider = providerRegistry.get(dataSource.type)
	if (!provider) throw new Error(`No print data source provider registered for "${dataSource.type}".`)

	const rows = await provider.resolve(dataSource as never, context)
	throwIfAborted(context.signal)
	return normalizeRows(rows)
}

export function normalizeRows(value: unknown): PrintDataRow[] {
	const rows = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
	return rows.map((row) => (isRecord(row) ? { ...row } : { value: row }))
}

function createHttpBody(config: HttpPrintDataSourceConfig) {
	if (config.body === undefined || config.body === null) return undefined
	if (typeof config.body === 'string') return config.body
	return JSON.stringify(config.body)
}

function normalizeHeaders(headers: unknown): HeadersInit | undefined {
	if (!isRecord(headers)) return undefined
	const result: Record<string, string> = {}
	for (const [key, value] of Object.entries(headers)) {
		if (value === undefined || value === null) continue
		result[key] = String(value)
	}
	return result
}

function parseJsonValue(value: unknown, message: string): unknown {
	if (typeof value !== 'string') return value
	try {
		return JSON.parse(value)
	} catch {
		throw new Error(message)
	}
}

function parseCsv(
	value: string,
	config: CsvPrintDataSourceConfig
): PrintDataRow[] {
	const delimiter = config.delimiter ?? ','
	const rows = parseDelimitedRows(value, delimiter)
	if (!rows.length) return []

	const hasHeader = config.header !== false
	const headers = hasHeader ? rows[0] : rows[0].map((_, index) => `col${index + 1}`)
	const bodyRows = hasHeader ? rows.slice(1) : rows

	return bodyRows
		.filter((row) => row.some((cell) => cell !== ''))
		.map((row) => {
			const result: PrintDataRow = {}
			for (let index = 0; index < headers.length; index++) {
				result[headers[index] || `col${index + 1}`] = row[index] ?? ''
			}
			return result
		})
}

function parseDelimitedRows(source: string, delimiter: string) {
	const rows: string[][] = []
	let row: string[] = []
	let cell = ''
	let quoted = false

	for (let index = 0; index < source.length; index++) {
		const char = source[index]
		const next = source[index + 1]

		if (quoted) {
			if (char === '"' && next === '"') {
				cell += '"'
				index++
				continue
			}
			if (char === '"') {
				quoted = false
				continue
			}
			cell += char
			continue
		}

		if (char === '"') {
			quoted = true
			continue
		}

		if (char === delimiter) {
			row.push(cell)
			cell = ''
			continue
		}

		if (char === '\n') {
			row.push(cell)
			rows.push(row)
			row = []
			cell = ''
			continue
		}

		if (char === '\r') continue
		cell += char
	}

	row.push(cell)
	rows.push(row)
	return rows
}

function readPath(value: unknown, path: string | undefined) {
	if (!path) return value
	return path.split('.').reduce<unknown>((current, key) => {
		if (!isRecord(current) && !Array.isArray(current)) return undefined
		return (current as Record<string, unknown>)[key]
	}, value)
}

function throwIfAborted(signal: AbortSignal | undefined) {
	if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError')
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
