import type { PrintDataSourceConfig, PrintDataSourceDetailColumn } from '../print/types'

export const PRINT_DATA_SOURCE_FIELD_MIME = 'application/x-enlearn-print-data-source-field'

export interface PrintDataSourceTreeNode {
	key: string
	label: string
	path?: string
	children?: PrintDataSourceTreeNode[]
}

/** Use schema fields even when the selected data source has no records yet. */
export function buildPrintDataSourceTree(source: PrintDataSourceConfig | undefined): PrintDataSourceTreeNode[] {
	if (!source || source.type !== 'inline') return []
	const inline = source as Extract<PrintDataSourceConfig, { type: 'inline' }>
	const tables = inline.detailTables?.length ? inline.detailTables : inline.detailColumns?.length
		? [{ field: inline.detailField || 'detail', label: '明细', columns: inline.detailColumns }]
		: []
	const detailFields = new Set(tables.map((table) => table.field))
	const headers: PrintDataSourceTreeNode[] = []
	for (const field of inline.headerFields ?? []) {
		if (field.field && !detailFields.has(field.field)) {
			headers.push({ key: `header:${field.field}`, label: field.label || field.field, path: field.field })
		}
	}
	// Infer fields from all records, including nested objects and detail rows.
	for (const row of inline.rows ?? []) {
		for (const [field, value] of Object.entries(row)) {
			if (detailFields.has(field) || field.startsWith('_')) continue
			mergeValueField(headers, field, value, field)
		}
	}
	const details = tables.map((table) => {
		const children = buildColumnTree(table.columns, table.field)
		for (const row of inline.rows ?? []) {
			const values = row[table.field]
			if (!Array.isArray(values)) continue
			for (const value of values) {
				if (!isRecord(value)) continue
				for (const [field, fieldValue] of Object.entries(value)) {
					if (!field.startsWith('_')) mergeValueField(children, field, fieldValue, `${table.field}.${field}`)
				}
			}
		}
		return { key: `detail:${table.field}`, label: table.label || table.field, children }
	})
	return [
		...(headers.length ? [{ key: 'header', label: '表头', children: headers }] : []),
		...details,
	]
}

function buildColumnTree(columns: readonly PrintDataSourceDetailColumn[], prefix: string): PrintDataSourceTreeNode[] {
	return columns.flatMap<PrintDataSourceTreeNode>((column, index) => {
		if (column.children?.length) {
			return [{ key: `${prefix}:group:${index}:${column.title}`, label: column.title || '分组', children: buildColumnTree(column.children, prefix) }]
		}
		return column.field ? [{ key: `${prefix}.${column.field}`, label: column.title || column.field, path: `${prefix}.${column.field}` }] : []
	})
}

function mergeValueField(nodes: PrintDataSourceTreeNode[], label: string, value: unknown, path: string) {
	let node = findFieldNode(nodes, path)
	if (!node) {
		node = { key: path, label, path }
		nodes.push(node)
	}
	const objects = Array.isArray(value) ? value.filter(isRecord) : isRecord(value) ? [value] : []
	if (!objects.length) return
	delete node.path
	node.children ??= []
	for (const object of objects) {
		for (const [field, childValue] of Object.entries(object)) {
			if (!field.startsWith('_')) mergeValueField(node.children, field, childValue, `${path}.${field}`)
		}
	}
}

function findFieldNode(nodes: PrintDataSourceTreeNode[], path: string): PrintDataSourceTreeNode | undefined {
	for (const node of nodes) {
		if (node.path === path || node.key === path || node.key === `header:${path}`) return node
		const child = node.children && findFieldNode(node.children, path)
		if (child) return child
	}
	return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
