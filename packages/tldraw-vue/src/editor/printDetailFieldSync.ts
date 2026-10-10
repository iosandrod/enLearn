import type { PrintDataSourceDetailColumn } from '../print/types'

/** Append missing fields without changing existing column settings or order. */
export function syncPrintDetailFields(
	columns: readonly PrintDataSourceDetailColumn[],
	metadata: unknown,
	rows: readonly unknown[],
) {
	const metadataFields = readMetadataFields(metadata)
	const candidates = metadataFields.length
		? metadataFields
		: isRecord(rows[0]) ? Object.keys(rows[0]).map((field) => ({ field, title: field })) : []
	const existing = new Set<string>()
	function collectFields(items: readonly PrintDataSourceDetailColumn[]) {
		for (const column of items) {
			if (readString(column.field)) existing.add(readString(column.field))
			if (Array.isArray(column.children)) collectFields(column.children)
		}
	}
	collectFields(columns)
	const additions: PrintDataSourceDetailColumn[] = []
	for (const column of candidates) {
		if (!column.field || existing.has(column.field)) continue
		existing.add(column.field)
		additions.push(column)
	}
	return { columns: [...columns, ...additions], added: additions.length, detected: candidates.length }
}

function readMetadataFields(metadata: unknown): PrintDataSourceDetailColumn[] {
	if (Array.isArray(metadata)) {
		return metadata.flatMap((item) => {
			if (typeof item === 'string') {
				const field = readString(item)
				return field ? [{ field, title: field }] : []
			}
			if (!isRecord(item)) return []
			const field = readString(item.field) || readString(item.name) || readString(item.key) || readString(item.column_name)
			const title = readString(item.title) || readString(item.label) || readString(item.comment) || field
			return field ? [{ field, title }] : []
		})
	}
	if (!isRecord(metadata)) return []
	for (const key of ['fields', 'columns', 'properties']) {
		if (Array.isArray(metadata[key]) || isRecord(metadata[key])) return readMetadataFields(metadata[key])
	}
	return Object.entries(metadata).flatMap(([field, value]) => {
		if (!field || (typeof value !== 'string' && !isRecord(value))) return []
		const title = isRecord(value)
			? readString(value.title) || readString(value.label) || readString(value.comment) || field
			: readString(value) || field
		return [{ field, title }]
	})
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown) {
	return typeof value === 'string' ? value.trim() : ''
}
