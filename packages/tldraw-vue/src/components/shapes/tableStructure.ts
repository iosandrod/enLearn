export interface TableMergeCell {
	row: number
	col: number
	rowspan: number
	colspan: number
}

export function getTableMergeBoundaryGaps(
	merges: readonly TableMergeCell[],
	axis: 'row' | 'col',
	boundaryIndex: number,
	offsets: readonly number[]
) {
	const gaps: Array<{ start: number; end: number }> = []
	for (const merge of merges) {
		const crossesBoundary = axis === 'row'
			? merge.row <= boundaryIndex && boundaryIndex < merge.row + merge.rowspan - 1
			: merge.col <= boundaryIndex && boundaryIndex < merge.col + merge.colspan - 1
		if (!crossesBoundary) continue

		const startIndex = axis === 'row' ? merge.col : merge.row
		const endIndex = startIndex + (axis === 'row' ? merge.colspan : merge.rowspan)
		const start = offsets[startIndex]
		const end = offsets[endIndex]
		if (start !== undefined && end !== undefined && end > start) gaps.push({ start, end })
	}
	return gaps
}

export interface TableSelection {
	rowStart: number
	rowEnd: number
	colStart: number
	colEnd: number
}

export function normalizeTableSelection(
	startRow: number,
	startCol: number,
	endRow: number,
	endCol: number
): TableSelection {
	return {
		rowStart: Math.min(startRow, endRow),
		rowEnd: Math.max(startRow, endRow),
		colStart: Math.min(startCol, endCol),
		colEnd: Math.max(startCol, endCol),
	}
}

export function normalizeTableMergeCells(
	value: unknown,
	rowCount: number,
	columnCount: number
): TableMergeCell[] {
	if (!Array.isArray(value) || rowCount < 1 || columnCount < 1) return []
	const occupied = new Set<string>()
	const result: TableMergeCell[] = []
	for (const item of value) {
		if (!item || typeof item !== 'object') continue
		const source = item as Partial<TableMergeCell>
		const row = Math.trunc(Number(source.row))
		const col = Math.trunc(Number(source.col))
		const rowspan = Math.min(Math.trunc(Number(source.rowspan)), rowCount - row)
		const colspan = Math.min(Math.trunc(Number(source.colspan)), columnCount - col)
		if (
			!Number.isInteger(row) ||
			!Number.isInteger(col) ||
			!Number.isInteger(rowspan) ||
			!Number.isInteger(colspan) ||
			row < 0 || col < 0 || rowspan < 1 || colspan < 1
		) continue
		if (rowspan === 1 && colspan === 1) continue
		const keys: string[] = []
		for (let rowOffset = 0; rowOffset < rowspan; rowOffset += 1) {
			for (let colOffset = 0; colOffset < colspan; colOffset += 1) {
				keys.push(`${row + rowOffset}:${col + colOffset}`)
			}
		}
		if (keys.some(key => occupied.has(key))) continue
		keys.forEach(key => occupied.add(key))
		result.push({ row, col, rowspan, colspan })
	}
	return result
}

export function findTableMerge(
	merges: readonly TableMergeCell[],
	row: number,
	col: number
) {
	return merges.find(merge =>
		row >= merge.row &&
		row < merge.row + merge.rowspan &&
		col >= merge.col &&
		col < merge.col + merge.colspan
	)
}

export function expandSelectionToTableMerges(
	selection: TableSelection,
	merges: readonly TableMergeCell[]
): TableSelection {
	const expanded = { ...selection }
	let changed = true
	while (changed) {
		changed = false
		for (const merge of merges) {
			const overlaps =
				expanded.rowStart <= merge.row + merge.rowspan - 1 &&
				merge.row <= expanded.rowEnd &&
				expanded.colStart <= merge.col + merge.colspan - 1 &&
				merge.col <= expanded.colEnd
			if (!overlaps) continue
			const next = {
				rowStart: Math.min(expanded.rowStart, merge.row),
				rowEnd: Math.max(expanded.rowEnd, merge.row + merge.rowspan - 1),
				colStart: Math.min(expanded.colStart, merge.col),
				colEnd: Math.max(expanded.colEnd, merge.col + merge.colspan - 1),
			}
			changed = Object.keys(next).some(
				key => next[key as keyof TableSelection] !== expanded[key as keyof TableSelection]
			)
			Object.assign(expanded, next)
		}
	}
	return expanded
}

export function tableMergesIntersecting(
	merges: readonly TableMergeCell[],
	selection: TableSelection
) {
	return merges.filter(merge =>
		selection.rowStart <= merge.row + merge.rowspan - 1 &&
		merge.row <= selection.rowEnd &&
		selection.colStart <= merge.col + merge.colspan - 1 &&
		merge.col <= selection.colEnd
	)
}

export function insertTableMergeAxis(
	merges: readonly TableMergeCell[],
	axis: 'row' | 'col',
	index: number,
	count: number
) {
	const spanKey = axis === 'row' ? 'rowspan' : 'colspan'
	return merges.map(merge => {
		const next = { ...merge }
		const start = next[axis]
		const end = start + next[spanKey] - 1
		if (start >= index) next[axis] += count
		else if (end >= index) next[spanKey] += count
		return next
	})
}

export function removeTableMergeAxis(
	merges: readonly TableMergeCell[],
	axis: 'row' | 'col',
	index: number,
	count: number
) {
	const spanKey = axis === 'row' ? 'rowspan' : 'colspan'
	const removeEnd = index + count - 1
	return merges.flatMap(merge => {
		const next = { ...merge }
		const start = next[axis]
		const end = start + next[spanKey] - 1
		if (end < index) return [next]
		if (start > removeEnd) {
			next[axis] -= count
			return [next]
		}
		const before = Math.max(0, index - start)
		const after = Math.max(0, end - removeEnd)
		next[spanKey] = before + after
		if (next[spanKey] < 1) return []
		if (start >= index) next[axis] = index
		return next.rowspan === 1 && next.colspan === 1 ? [] : [next]
	})
}
