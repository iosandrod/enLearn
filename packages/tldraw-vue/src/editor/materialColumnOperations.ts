import type {
	PrintDataSourceConfig,
	PrintDataSourceDetailColumn,
} from '@/print/types'

export type MaterialColumnInsertResult = {
	columns: PrintDataSourceDetailColumn[]
	field: string
}

export function findMaterialColumn(
	columns: readonly PrintDataSourceDetailColumn[],
	field: string,
): PrintDataSourceDetailColumn | null {
	for (const column of columns) {
		if (column.field === field) return column
		if (column.children?.length) {
			const nested = findMaterialColumn(column.children, field)
			if (nested) return nested
		}
	}
	return null
}

export function getMaterialColumns(
	source: PrintDataSourceConfig | undefined,
	detailField: string,
): readonly PrintDataSourceDetailColumn[] {
	if (!source || source.type !== 'inline') return []
	const table = Array.isArray(source.detailTables)
		? source.detailTables.find((item) => item.field === detailField)
		: undefined
	return table?.columns ?? source.detailColumns ?? []
}

export function updateMaterialColumns(
	source: PrintDataSourceConfig,
	detailField: string,
	update: (columns: readonly PrintDataSourceDetailColumn[]) => PrintDataSourceDetailColumn[],
): PrintDataSourceConfig {
	if (source.type !== 'inline') return source
	const detailTables = Array.isArray(source.detailTables) ? source.detailTables : []
	const tableIndex = detailTables.findIndex((table) => table.field === detailField)
	if (tableIndex >= 0) {
		return {
			...source,
			detailTables: detailTables.map((table, index) =>
				index === tableIndex ? { ...table, columns: update(table.columns) } : table
			),
		}
	}
	return {
		...source,
		detailColumns: update(Array.isArray(source.detailColumns) ? source.detailColumns : []),
	}
}

export function addMaterialColumn(
	columns: readonly PrintDataSourceDetailColumn[],
	selectedField?: string,
): MaterialColumnInsertResult {
	const field = createUniqueColumnField(columns, 'column')
	const column = createColumn(field, '新列')
	const selectedPath = selectedField ? findColumnPath(columns, selectedField) : null
	if (!selectedPath) return { columns: [...columns, column], field }
	const parentPath = selectedPath.slice(0, -1)
	return {
		columns: updateColumnList(columns, parentPath, (siblings) => {
			const next = [...siblings]
			next.splice(selectedPath[selectedPath.length - 1] + 1, 0, column)
			return next
		}),
		field,
	}
}

export function addMaterialChildColumn(
	columns: readonly PrintDataSourceDetailColumn[],
	selectedField: string,
): MaterialColumnInsertResult | null {
	const selectedPath = findColumnPath(columns, selectedField)
	if (!selectedPath) return null
	const field = createUniqueColumnField(columns, `${selectedField}_child`)
	const child = createColumn(field, '新子列')
	return {
		columns: replaceColumnAtPath(columns, selectedPath, (column) => {
			if (column.children?.length) {
				return { ...column, children: [...column.children, child] }
			}
			const groupField = createUniqueColumnField(columns, `${selectedField}_group`)
			const originalLeaf = { ...column }
			delete originalLeaf.children
			return {
				...column,
				field: groupField,
				children: [originalLeaf, child],
			}
		}),
		field,
	}
}

export function removeMaterialColumn(
	columns: readonly PrintDataSourceDetailColumn[],
	field: string,
): { columns: PrintDataSourceDetailColumn[]; nextField: string } | null {
	const path = findColumnPath(columns, field)
	if (!path) return null
	const parentPath = path.slice(0, -1)
	let nextField = ''
	const nextColumns = updateColumnList(columns, parentPath, (siblings) => {
		const index = path[path.length - 1]
		const next = siblings.filter((_, siblingIndex) => siblingIndex !== index)
		nextField = next[Math.min(index, next.length - 1)]?.field ?? ''
		return next
	})
	return { columns: nextColumns, nextField }
}

export function moveMaterialColumn(
	columns: readonly PrintDataSourceDetailColumn[],
	sourceField: string,
	targetField: string,
	position: 'before' | 'after',
): PrintDataSourceDetailColumn[] | null {
	if (sourceField === targetField) return null
	const sourcePath = findColumnPath(columns, sourceField)
	const targetPath = findColumnPath(columns, targetField)
	if (!sourcePath || !targetPath) return null
	const sourceParent = sourcePath.slice(0, -1)
	const targetParent = targetPath.slice(0, -1)
	if (sourceParent.join('.') !== targetParent.join('.')) return null
	return updateColumnList(columns, sourceParent, (siblings) => {
		const source = siblings.find((column) => column.field === sourceField)
		if (!source) return [...siblings]
		const next = siblings.filter((column) => column.field !== sourceField)
		const targetIndex = next.findIndex((column) => column.field === targetField)
		if (targetIndex < 0) return [...siblings]
		next.splice(targetIndex + (position === 'after' ? 1 : 0), 0, source)
		return next
	})
}

export function areMaterialColumnsSiblings(
	columns: readonly PrintDataSourceDetailColumn[],
	firstField: string,
	secondField: string,
) {
	const firstPath = findColumnPath(columns, firstField)
	const secondPath = findColumnPath(columns, secondField)
	if (!firstPath || !secondPath) return false
	return firstPath.slice(0, -1).join('.') === secondPath.slice(0, -1).join('.')
}

function createColumn(field: string, title: string): PrintDataSourceDetailColumn {
	return { field, title, width: 100, visible: true }
}

function createUniqueColumnField(
	columns: readonly PrintDataSourceDetailColumn[],
	base: string,
) {
	const fields = new Set<string>()
	collectColumnFields(columns, fields)
	const normalizedBase = base.replace(/[^a-zA-Z0-9_$]/g, '_') || 'column'
	let candidate = normalizedBase
	let suffix = 1
	while (fields.has(candidate)) candidate = `${normalizedBase}_${suffix++}`
	return candidate
}

function collectColumnFields(
	columns: readonly PrintDataSourceDetailColumn[],
	result: Set<string>,
) {
	columns.forEach((column) => {
		if (column.field) result.add(column.field)
		if (column.children?.length) collectColumnFields(column.children, result)
	})
}

function findColumnPath(
	columns: readonly PrintDataSourceDetailColumn[],
	field: string,
	prefix: number[] = [],
): number[] | null {
	for (let index = 0; index < columns.length; index += 1) {
		const column = columns[index]
		const path = [...prefix, index]
		if (column.field === field) return path
		if (column.children?.length) {
			const nested = findColumnPath(column.children, field, path)
			if (nested) return nested
		}
	}
	return null
}

function updateColumnList(
	columns: readonly PrintDataSourceDetailColumn[],
	parentPath: readonly number[],
	update: (columns: readonly PrintDataSourceDetailColumn[]) => PrintDataSourceDetailColumn[],
): PrintDataSourceDetailColumn[] {
	if (!parentPath.length) return update(columns)
	const [index, ...rest] = parentPath
	return columns.map((column, columnIndex) => {
		if (columnIndex !== index) return column
		return {
			...column,
			children: updateColumnList(column.children ?? [], rest, update),
		}
	})
}

function replaceColumnAtPath(
	columns: readonly PrintDataSourceDetailColumn[],
	path: readonly number[],
	update: (column: PrintDataSourceDetailColumn) => PrintDataSourceDetailColumn,
): PrintDataSourceDetailColumn[] {
	const [index, ...rest] = path
	return columns.map((column, columnIndex) => {
		if (columnIndex !== index) return column
		if (!rest.length) return update(column)
		return { ...column, children: replaceColumnAtPath(column.children ?? [], rest, update) }
	})
}
