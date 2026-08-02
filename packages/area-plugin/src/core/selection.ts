import { isColumnAreaDisabled } from './guards'
import { getStore } from './store'
import { hideCellAreaOverlays, showCellArea, showCellAreaByAnchorOffset, showInactiveCellArea, showInactiveCellAreaByAnchorOffset } from '../dom/overlay'
import { closestByClass, findDescendantByClass, findDescendantsByClass } from '../dom/traversal'
import type { CellAreaAnchorOffsetPosition } from '../dom/overlay'
import type { CellAreaInput, CellAreaRange, CellAreaSelectionInfo, ExtendCellAreaOptions } from '../types'

const AUTO_SCROLL_EDGE_SIZE = 48
const AUTO_SCROLL_INTERVAL = 45
const AUTO_SCROLL_MAX_STEP = 48
const RESIZE_EDGE_GUARD_SIZE = 8
const scrollRepaintCleanups = new WeakMap<any, () => void>()
const scrollRepaintFrames = new WeakMap<any, number>()
const tableDomRefsMap = new WeakMap<any, {
  root: HTMLElement | null
  bodyWrapper: HTMLElement | null
  bodyScrollElement: HTMLElement | null
  scrollElements: HTMLElement[]
}>()

interface RangeCellInfo {
  row: any
  column: any
  cell: HTMLElement
  rowIndex: number
  columnIndex: number
}

interface RangeCells {
  startCell: HTMLElement
  endCell: HTMLElement
  startCellInfo: RangeCellInfo
  endCellInfo: RangeCellInfo
}

interface BodyIndexRange {
  rowStartIndex: number
  rowEndIndex: number
  columnStartIndex: number
  columnEndIndex: number
}

type ColumnFixedType = 'left' | 'right' | null

function createSingleCellArea ($table: any, params: any): CellAreaRange {
  const type = params.type === 'header' || params.cell?.classList?.contains('vxe-header--column') ? 'header' : 'body'
  const rows = getRows($table, params.visibleData || params.data || [])
  const columns = getColumns($table, params.columns || params.items || [])
  const rowIndex = params.row ? getRowIndex($table, rows, params.row) : -1
  const columnIndex = getColumnIndex($table, columns, params.column)
  const fixed = getCellFixedType(params.cell, params.column)
  const area: CellAreaRange = {
    type,
    fixed,
    startRow: params.row || null,
    endRow: params.row || null,
    startColumn: params.column,
    endColumn: params.column,
    activeRow: params.row || null,
    activeColumn: params.column,
    rows: params.row ? [params.row] : [],
    columns: params.column ? [params.column] : [],
    startRowid: getRowid($table, params.row),
    endRowid: getRowid($table, params.row),
    activeRowid: getRowid($table, params.row),
    startColumnId: getColumnId(params.column),
    endColumnId: getColumnId(params.column),
    activeColumnId: getColumnId(params.column),
    rowIds: params.row ? [getRowid($table, params.row)].filter((rowid): rowid is string => !!rowid) : [],
    columnIds: params.column ? [getColumnId(params.column)].filter((columnId): columnId is string => !!columnId) : [],
    startRowIndex: rowIndex,
    endRowIndex: rowIndex,
    activeRowIndex: rowIndex,
    startColumnIndex: columnIndex,
    endColumnIndex: columnIndex,
    activeColumnIndex: columnIndex
  }
  if (type === 'body' && rowIndex > -1 && columnIndex > -1) {
    const expandedRange = constrainRangeByFixedColumns(columns, area.fixed, expandRangeByMergedCells($table, rows, columns, rowIndex, rowIndex, columnIndex, columnIndex))
    updateAreaDataByIndexes($table, area, rows, columns, expandedRange.rowStartIndex, expandedRange.rowEndIndex, expandedRange.columnStartIndex, expandedRange.columnEndIndex)
  } else {
    syncAreaData($table, area, rows, columns)
  }
  return area
}

function getRootElement ($table: any): HTMLElement | null {
  return $table.getRefMaps?.().refElem?.value || null
}

function getRefElement (ref: any): HTMLElement | null {
  const value = ref?.value || ref
  return value instanceof HTMLElement ? value : null
}

function getElemStoreElement ($table: any, key: string): HTMLElement | null {
  return getRefElement($table.internalData?.elemStore?.[key])
}

function queryTableDomRefs ($table: any) {
  const refMaps = $table.getRefMaps?.() || {}
  const root = getRefElement(refMaps.refElem)
  const bodyInnerWrapper = getElemStoreElement($table, 'main-body-scroll')
  const scrollYHandle = getRefElement(refMaps.refScrollYHandleElem)
  const scrollXHandle = getRefElement(refMaps.refScrollXHandleElem)
  const bodyWrapper = getElemStoreElement($table, 'main-body-wrapper')
  const refs = {
    root,
    bodyWrapper,
    bodyScrollElement: bodyInnerWrapper || scrollYHandle || bodyWrapper,
    scrollElements: Array.from(new Set([
      bodyInnerWrapper,
      scrollYHandle,
      scrollXHandle,
      bodyWrapper
    ].filter((el): el is HTMLElement => !!el)))
  }
  tableDomRefsMap.set($table, refs)
  return refs
}

function getTableDomRefs ($table: any) {
  const cachedRefs = tableDomRefsMap.get($table)
  if (cachedRefs?.root?.isConnected && (!cachedRefs.bodyWrapper || cachedRefs.bodyWrapper.isConnected)) {
    return cachedRefs
  }
  return queryTableDomRefs($table)
}

function getRows ($table: any, fallbackRows: any[] = []) {
  return $table.getTableData?.().visibleData || fallbackRows
}

function getColumns ($table: any, fallbackColumns: any[] = []) {
  return $table.getColumns?.() || fallbackColumns
}

function toKey (value: any) {
  return value === null || value === undefined ? null : `${value}`
}

function getRowid ($table: any, row: any) {
  if (!row) {
    return null
  }
  return toKey($table.getRowid?.(row))
}

function getColumnId (column: any) {
  return toKey(column?.id || column?.field)
}

function getColumnWidth (column: any) {
  const width = Number(column?.renderWidth || column?.resizeWidth || column?.width || column?.minWidth)
  return Number.isFinite(width) && width > 0 ? width : 120
}

function getColumnRest ($table: any, column: any) {
  const columnId = getColumnId(column)
  return columnId ? $table.internalData?.fullColumnIdData?.[columnId] : null
}

function getColumnLeft ($table: any, columns: any[], columnIndex: number) {
  const column = columns[columnIndex]
  const restLeft = Number(getColumnRest($table, column)?.oLeft)
  if (Number.isFinite(restLeft)) {
    return restLeft
  }

  let left = 0
  for (let index = 0; index < columnIndex; index++) {
    left += getColumnWidth(columns[index])
  }
  return left
}

function getColumnRight ($table: any, columns: any[], columnIndex: number) {
  return getColumnLeft($table, columns, columnIndex) + getColumnWidth(columns[columnIndex])
}

function getRowRest ($table: any, row: any) {
  const rowid = getRowid($table, row)
  return rowid ? $table.internalData?.fullAllDataRowIdData?.[rowid] : null
}

function getRowHeight ($table: any, row: any, fallbackHeight = 48) {
  const apiHeight = Number($table.getRowHeight?.(row))
  if (Number.isFinite(apiHeight) && apiHeight > 0) {
    return apiHeight
  }

  const rowRest = getRowRest($table, row)
  const restHeight = Number(rowRest?.resizeHeight || rowRest?.height)
  if (Number.isFinite(restHeight) && restHeight > 0) {
    return restHeight
  }
  const tableRowHeight = Number($table.reactData?.rowHeight)
  if (Number.isFinite(tableRowHeight) && tableRowHeight > 0) {
    return tableRowHeight
  }
  return fallbackHeight
}

function getRowTop ($table: any, rows: any[], rowIndex: number) {
  const row = rows[rowIndex]
  const restTop = Number(getRowRest($table, row)?.oTop)
  if (Number.isFinite(restTop)) {
    return restTop
  }

  let top = 0
  for (let index = 0; index < rowIndex; index++) {
    top += getRowHeight($table, rows[index])
  }
  return top
}

function getRowBottom ($table: any, rows: any[], rowIndex: number) {
  const row = rows[rowIndex]
  return getRowTop($table, rows, rowIndex) + getRowHeight($table, row)
}

function getBodyWrapper ($table: any): HTMLElement | null {
  return getTableDomRefs($table).bodyWrapper
}

function getBodyScrollElement ($table: any): HTMLElement | null {
  return getTableDomRefs($table).bodyScrollElement
}

function getScrollElements ($table: any) {
  return getTableDomRefs($table).scrollElements
}

function getScrollTop ($table: any) {
  const scrollInfo = $table.getScroll?.()
  if (scrollInfo && typeof scrollInfo.scrollTop === 'number') {
    return scrollInfo.scrollTop
  }
  if (scrollInfo && typeof scrollInfo.top === 'number') {
    return scrollInfo.top
  }
  return getBodyScrollElement($table)?.scrollTop || 0
}

function getScrollLeft ($table: any) {
  const scrollInfo = $table.getScroll?.()
  if (scrollInfo && typeof scrollInfo.scrollLeft === 'number') {
    return scrollInfo.scrollLeft
  }
  if (scrollInfo && typeof scrollInfo.left === 'number') {
    return scrollInfo.left
  }
  return getBodyScrollElement($table)?.scrollLeft || 0
}

function getMaxScrollLeft ($table: any, scrollEl: HTMLElement) {
  const scrollInfo = $table.getScroll?.()
  if (
    scrollInfo &&
    typeof scrollInfo.scrollWidth === 'number' &&
    typeof scrollInfo.clientWidth === 'number'
  ) {
    return Math.max(0, scrollInfo.scrollWidth - scrollInfo.clientWidth)
  }
  return Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth)
}

function getMaxScrollTop ($table: any, scrollEl: HTMLElement) {
  const scrollInfo = $table.getScroll?.()
  if (
    scrollInfo &&
    typeof scrollInfo.scrollHeight === 'number' &&
    typeof scrollInfo.clientHeight === 'number'
  ) {
    return Math.max(0, scrollInfo.scrollHeight - scrollInfo.clientHeight)
  }
  return Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight)
}

function clamp (value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function toPositiveNumber (value: any, fallback: number) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback
}

function rangesOverlap (startA: number, endA: number, startB: number, endB: number) {
  return startA <= endB && startB <= endA
}

function getColumnFixedType (column: any): ColumnFixedType {
  return column?.fixed === 'left' ? 'left' : column?.fixed === 'right' ? 'right' : null
}

function getCellFixedType (cell: HTMLElement | null | undefined, column: any): ColumnFixedType {
  const columnFixed = getColumnFixedType(column)
  if (columnFixed) {
    return columnFixed
  }
  if (!cell) {
    return null
  }
  if (closestByClass(cell, 'vxe-table--fixed-left-wrapper') || closestByClass(cell, 'fixed-left--wrapper')) {
    return 'left'
  }
  if (closestByClass(cell, 'vxe-table--fixed-right-wrapper') || closestByClass(cell, 'fixed-right--wrapper')) {
    return 'right'
  }
  return null
}

function isCellInColumnRegion (cell: HTMLElement, fixed: ColumnFixedType) {
  const isLeft = !!(closestByClass(cell, 'vxe-table--fixed-left-wrapper') || closestByClass(cell, 'fixed-left--wrapper'))
  const isRight = !!(closestByClass(cell, 'vxe-table--fixed-right-wrapper') || closestByClass(cell, 'fixed-right--wrapper'))
  if (fixed === 'left') {
    return isLeft
  }
  if (fixed === 'right') {
    return isRight
  }
  return !isLeft && !isRight
}

function getColumnRegionIndexRange (columns: any[], fixed: ColumnFixedType) {
  let startIndex = -1
  let endIndex = -1
  columns.forEach((column, index) => {
    if (getColumnFixedType(column) === fixed) {
      if (startIndex < 0) {
        startIndex = index
      }
      endIndex = index
    }
  })

  return startIndex > -1 && endIndex > -1
    ? { startIndex, endIndex }
    : null
}

function constrainRangeByFixedColumns (columns: any[], fixed: ColumnFixedType, range: BodyIndexRange): BodyIndexRange {
  const columnRegionRange = getColumnRegionIndexRange(columns, fixed)
  if (!columnRegionRange) {
    return range
  }

  const columnStartIndex = clamp(range.columnStartIndex, columnRegionRange.startIndex, columnRegionRange.endIndex)
  const columnEndIndex = clamp(range.columnEndIndex, columnRegionRange.startIndex, columnRegionRange.endIndex)
  return {
    ...range,
    columnStartIndex: Math.min(columnStartIndex, columnEndIndex),
    columnEndIndex: Math.max(columnStartIndex, columnEndIndex)
  }
}

function normalizeBodyIndexRange (rows: any[], columns: any[], rowStartIndex: number, rowEndIndex: number, columnStartIndex: number, columnEndIndex: number): BodyIndexRange {
  const rowMaxIndex = Math.max(0, rows.length - 1)
  const columnMaxIndex = Math.max(0, columns.length - 1)
  return {
    rowStartIndex: clamp(Math.min(rowStartIndex, rowEndIndex), 0, rowMaxIndex),
    rowEndIndex: clamp(Math.max(rowStartIndex, rowEndIndex), 0, rowMaxIndex),
    columnStartIndex: clamp(Math.min(columnStartIndex, columnEndIndex), 0, columnMaxIndex),
    columnEndIndex: clamp(Math.max(columnStartIndex, columnEndIndex), 0, columnMaxIndex)
  }
}

function expandRangeByMergedCells ($table: any, rows: any[], columns: any[], rowStartIndex: number, rowEndIndex: number, columnStartIndex: number, columnEndIndex: number): BodyIndexRange {
  const mergeCells = $table.getMergeCells?.() || []
  const rowMaxIndex = rows.length - 1
  const columnMaxIndex = columns.length - 1
  const range = normalizeBodyIndexRange(rows, columns, rowStartIndex, rowEndIndex, columnStartIndex, columnEndIndex)
  if (!Array.isArray(mergeCells) || !mergeCells.length || rowMaxIndex < 0 || columnMaxIndex < 0) {
    return range
  }

  let changed = true
  while (changed) {
    changed = false
    mergeCells.forEach((merge) => {
      const mergeRow = Number(merge.row)
      const mergeColumn = Number(merge.col)
      if (!Number.isFinite(mergeRow) || !Number.isFinite(mergeColumn)) {
        return
      }

      const rowspan = toPositiveNumber(merge.rowspan || merge._rowspan, 1)
      const colspan = toPositiveNumber(merge.colspan || merge._colspan, 1)
      const mergeRowStartIndex = clamp(mergeRow, 0, rowMaxIndex)
      const mergeRowEndIndex = clamp(mergeRow + rowspan - 1, 0, rowMaxIndex)
      const mergeColumnStartIndex = clamp(mergeColumn, 0, columnMaxIndex)
      const mergeColumnEndIndex = clamp(mergeColumn + colspan - 1, 0, columnMaxIndex)
      if (
        mergeRowStartIndex > mergeRowEndIndex ||
        mergeColumnStartIndex > mergeColumnEndIndex ||
        !rangesOverlap(range.rowStartIndex, range.rowEndIndex, mergeRowStartIndex, mergeRowEndIndex) ||
        !rangesOverlap(range.columnStartIndex, range.columnEndIndex, mergeColumnStartIndex, mergeColumnEndIndex)
      ) {
        return
      }

      const nextRowStartIndex = Math.min(range.rowStartIndex, mergeRowStartIndex)
      const nextRowEndIndex = Math.max(range.rowEndIndex, mergeRowEndIndex)
      const nextColumnStartIndex = Math.min(range.columnStartIndex, mergeColumnStartIndex)
      const nextColumnEndIndex = Math.max(range.columnEndIndex, mergeColumnEndIndex)
      if (
        nextRowStartIndex !== range.rowStartIndex ||
        nextRowEndIndex !== range.rowEndIndex ||
        nextColumnStartIndex !== range.columnStartIndex ||
        nextColumnEndIndex !== range.columnEndIndex
      ) {
        range.rowStartIndex = nextRowStartIndex
        range.rowEndIndex = nextRowEndIndex
        range.columnStartIndex = nextColumnStartIndex
        range.columnEndIndex = nextColumnEndIndex
        changed = true
      }
    })
  }
  return range
}

function getRowIndex ($table: any, rows: any[], row: any) {
  const index = $table.getVTRowIndex ? $table.getVTRowIndex(row) : -1
  return index > -1 ? index : rows.indexOf(row)
}

function getColumnIndex ($table: any, columns: any[], column: any) {
  const index = $table.getVTColumnIndex ? $table.getVTColumnIndex(column) : -1
  return index > -1 ? index : columns.indexOf(column)
}

function findRowIndexById ($table: any, rows: any[], rowid: string | null) {
  if (!rowid) {
    return -1
  }
  return rows.findIndex(row => getRowid($table, row) === rowid)
}

function findColumnIndexById (columns: any[], columnId: string | null) {
  if (!columnId) {
    return -1
  }
  return columns.findIndex(column => getColumnId(column) === columnId)
}

function resolveRowIndex ($table: any, rows: any[], row: any, rowid: string | null, fallbackIndex: number) {
  const vtIndex = row ? getRowIndex($table, rows, row) : -1
  if (vtIndex > -1) {
    return vtIndex
  }
  const rowidIndex = findRowIndexById($table, rows, rowid)
  if (rowidIndex > -1) {
    return rowidIndex
  }
  return fallbackIndex > -1 && fallbackIndex < rows.length ? fallbackIndex : -1
}

function resolveColumnIndex ($table: any, columns: any[], column: any, columnId: string | null, fallbackIndex: number) {
  const vtIndex = column ? getColumnIndex($table, columns, column) : -1
  if (vtIndex > -1) {
    return vtIndex
  }
  const columnIdIndex = findColumnIndexById(columns, columnId)
  if (columnIdIndex > -1) {
    return columnIdIndex
  }
  return fallbackIndex > -1 && fallbackIndex < columns.length ? fallbackIndex : -1
}

function updateAreaDataByIndexes ($table: any, area: CellAreaRange, rows: any[], columns: any[], rowStartIndex: number, rowEndIndex: number, columnStartIndex: number, columnEndIndex: number) {
  const normalizedRowStartIndex = area.type === 'body' ? clamp(Math.min(rowStartIndex, rowEndIndex), 0, rows.length - 1) : -1
  const normalizedRowEndIndex = area.type === 'body' ? clamp(Math.max(rowStartIndex, rowEndIndex), 0, rows.length - 1) : -1
  const normalizedColumnStartIndex = clamp(Math.min(columnStartIndex, columnEndIndex), 0, columns.length - 1)
  const normalizedColumnEndIndex = clamp(Math.max(columnStartIndex, columnEndIndex), 0, columns.length - 1)

  area.startRowIndex = normalizedRowStartIndex
  area.endRowIndex = normalizedRowEndIndex
  area.startColumnIndex = normalizedColumnStartIndex
  area.endColumnIndex = normalizedColumnEndIndex
  area.startRow = normalizedRowStartIndex > -1 ? rows[normalizedRowStartIndex] : null
  area.endRow = normalizedRowEndIndex > -1 ? rows[normalizedRowEndIndex] : null
  area.startColumn = columns[normalizedColumnStartIndex]
  area.endColumn = columns[normalizedColumnEndIndex]
  area.rows = normalizedRowStartIndex > -1 && normalizedRowEndIndex > -1 ? rows.slice(normalizedRowStartIndex, normalizedRowEndIndex + 1) : []
  area.columns = columns.slice(normalizedColumnStartIndex, normalizedColumnEndIndex + 1)
  area.startRowid = getRowid($table, area.startRow)
  area.endRowid = getRowid($table, area.endRow)
  area.startColumnId = getColumnId(area.startColumn)
  area.endColumnId = getColumnId(area.endColumn)
  area.rowIds = area.rows.map(row => getRowid($table, row)).filter((rowid): rowid is string => !!rowid)
  area.columnIds = area.columns.map(column => getColumnId(column)).filter((columnId): columnId is string => !!columnId)
}

function syncAreaData ($table: any, area: CellAreaRange, rows: any[] = getRows($table), columns: any[] = getColumns($table)) {
  const startColumnIndex = resolveColumnIndex($table, columns, area.startColumn, area.startColumnId, area.startColumnIndex)
  const endColumnIndex = resolveColumnIndex($table, columns, area.endColumn, area.endColumnId, area.endColumnIndex)
  const activeColumnIndex = resolveColumnIndex($table, columns, area.activeColumn, area.activeColumnId, area.activeColumnIndex)
  if (startColumnIndex < 0 || endColumnIndex < 0 || activeColumnIndex < 0) {
    return false
  }

  area.activeColumnIndex = activeColumnIndex
  area.activeColumn = columns[activeColumnIndex]
  area.activeColumnId = getColumnId(area.activeColumn)

  if (area.type === 'body') {
    const startRowIndex = resolveRowIndex($table, rows, area.startRow, area.startRowid, area.startRowIndex)
    const endRowIndex = resolveRowIndex($table, rows, area.endRow, area.endRowid, area.endRowIndex)
    const activeRowIndex = resolveRowIndex($table, rows, area.activeRow, area.activeRowid, area.activeRowIndex)
    if (startRowIndex < 0 || endRowIndex < 0 || activeRowIndex < 0) {
      return false
    }
    area.activeRowIndex = activeRowIndex
    area.activeRow = rows[activeRowIndex]
    area.activeRowid = getRowid($table, area.activeRow)
    const expandedRange = constrainRangeByFixedColumns(columns, area.fixed, expandRangeByMergedCells($table, rows, columns, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex))
    updateAreaDataByIndexes($table, area, rows, columns, expandedRange.rowStartIndex, expandedRange.rowEndIndex, expandedRange.columnStartIndex, expandedRange.columnEndIndex)
    return true
  }

  updateAreaDataByIndexes($table, area, rows, columns, -1, -1, startColumnIndex, endColumnIndex)
  return true
}

function getColumnIdFromCell (cell: HTMLElement) {
  const colid = cell.getAttribute('colid')
  if (colid) {
    return colid
  }
  const classNames = Array.from(cell.classList)
  return classNames.find(name => /^col_/.test(name)) || null
}

function getRowFromCell ($table: any, rows: any[], cell: HTMLElement) {
  const rowNode = $table.getRowNode?.(cell.parentElement)
  if (rowNode && rowNode.item) {
    return rowNode.item
  }
  const rowid = closestByTagName(cell, 'TR')?.getAttribute('rowid')
  if (!rowid) {
    return null
  }
  return rows.find(row => `${$table.getRowid?.(row)}` === rowid) || null
}

function getColumnFromCell ($table: any, columns: any[], cell: HTMLElement) {
  const columnNode = $table.getColumnNode?.(cell)
  if (columnNode && columnNode.item) {
    return columnNode.item
  }
  const colid = getColumnIdFromCell(cell)
  if (!colid) {
    return null
  }
  return columns.find(column => column.id === colid) || null
}

function closestByTagName (start: Element | null, tagName: string) {
  const normalizedTagName = tagName.toUpperCase()
  let el = start instanceof HTMLElement ? start : null
  while (el) {
    if (el.tagName === normalizedTagName) {
      return el
    }
    el = el.parentElement
  }
  return null
}

function isSameRow ($table: any, rowA: any, rowB: any) {
  if (rowA === rowB) {
    return true
  }
  if (!rowA || !rowB) {
    return false
  }
  const rowAId = $table.getRowid?.(rowA)
  const rowBId = $table.getRowid?.(rowB)
  return rowAId !== null &&
    rowAId !== undefined &&
    rowBId !== null &&
    rowBId !== undefined &&
    `${rowAId}` === `${rowBId}`
}

function isSameColumn (columnA: any, columnB: any) {
  if (columnA === columnB) {
    return true
  }
  if (!columnA || !columnB) {
    return false
  }
  return !!columnA.id && !!columnB.id && `${columnA.id}` === `${columnB.id}`
}

function isCellForRangeTarget ($table: any, rows: any[], columns: any[], cell: HTMLElement, row: any, column: any) {
  const cellRow = getRowFromCell($table, rows, cell)
  const cellColumn = getColumnFromCell($table, columns, cell)
  return isSameRow($table, cellRow, row) && isSameColumn(cellColumn, column)
}

function getBodyCellFromPoint ($table: any, clientX: number, clientY: number, clampToBody = false) {
  const root = getRootElement($table)
  const bodyWrapper = getBodyWrapper($table)
  let pointX = clientX
  let pointY = clientY
  if (clampToBody && bodyWrapper) {
    const bodyRect = bodyWrapper.getBoundingClientRect()
    const scrollInfo = $table.getScroll?.()
    const scrollbarWidth = scrollInfo && typeof scrollInfo.scrollbarWidth === 'number' ? scrollInfo.scrollbarWidth : 0
    const scrollbarHeight = scrollInfo && typeof scrollInfo.scrollbarHeight === 'number' ? scrollInfo.scrollbarHeight : 0
    pointX = clamp(pointX, bodyRect.left + 1, bodyRect.right - scrollbarWidth - 1)
    pointY = clamp(pointY, bodyRect.top + 1, bodyRect.bottom - scrollbarHeight - 1)
  }

  const target = document.elementFromPoint(pointX, pointY)
  const cell = target instanceof HTMLElement ? closestByClass(target, 'vxe-body--column') : null
  if (cell && root && root.contains(cell) && closestByClass(cell, 'vxe-table--body-wrapper')) {
    return cell
  }
  return null
}

function getCellParamsFromElement ($table: any, baseParams: any, cell: HTMLElement) {
  const rows = getRows($table, baseParams.visibleData || baseParams.data || [])
  const columns = getColumns($table, baseParams.columns || baseParams.items || [])
  const row = getRowFromCell($table, rows, cell)
  const column = getColumnFromCell($table, columns, cell)
  if (!row || !column) {
    return null
  }
  return {
    row,
    column,
    cell,
    rows,
    columns
  }
}

function shouldSkipCellAreaMousedownForResize (evnt: MouseEvent, cell: HTMLElement) {
  const target = evnt.target instanceof HTMLElement ? evnt.target : null
  if (
    closestByClass(target, 'vxe-cell--col-resizable') ||
    closestByClass(target, 'vxe-cell--row-resizable')
  ) {
    return true
  }

  const cellRect = cell.getBoundingClientRect()
  const hasColumnResizeHandle = !!findDescendantByClass(cell, 'vxe-cell--col-resizable')
  const hasRowResizeHandle = !!findDescendantByClass(cell, 'vxe-cell--row-resizable')
  const nearColumnResizeEdge = evnt.clientX - cellRect.left <= RESIZE_EDGE_GUARD_SIZE ||
    cellRect.right - evnt.clientX <= RESIZE_EDGE_GUARD_SIZE
  const nearRowResizeEdge = evnt.clientY - cellRect.top <= RESIZE_EDGE_GUARD_SIZE ||
    cellRect.bottom - evnt.clientY <= RESIZE_EDGE_GUARD_SIZE

  return (hasColumnResizeHandle && nearColumnResizeEdge) ||
    (hasRowResizeHandle && nearRowResizeEdge)
}

function normalizeArea ($table: any, area: CellAreaRange, rows: any[], columns: any[], targetRow: any, targetColumn: any, options: ExtendCellAreaOptions) {
  const activeRowIndex = resolveRowIndex($table, rows, area.activeRow, area.activeRowid, area.activeRowIndex)
  const targetRowIndex = resolveRowIndex($table, rows, targetRow, getRowid($table, targetRow), -1)
  const activeColumnIndex = resolveColumnIndex($table, columns, area.activeColumn, area.activeColumnId, area.activeColumnIndex)
  const targetColumnIndex = resolveColumnIndex($table, columns, targetColumn, getColumnId(targetColumn), -1)
  if (activeRowIndex < 0 || targetRowIndex < 0 || activeColumnIndex < 0 || targetColumnIndex < 0) {
    return false
  }

  const expandedRange = constrainRangeByFixedColumns(columns, area.fixed, expandRangeByMergedCells($table, rows, columns, activeRowIndex, targetRowIndex, activeColumnIndex, targetColumnIndex))
  const rowStartIndex = expandedRange.rowStartIndex
  const rowEndIndex = expandedRange.rowEndIndex
  const columnStartIndex = expandedRange.columnStartIndex
  const columnEndIndex = expandedRange.columnEndIndex
  const rangeColumns = columns.slice(columnStartIndex, columnEndIndex + 1)
  const disabledColumn = rangeColumns.find(column => isColumnAreaDisabled({ $table, column }, options))
  if (disabledColumn) {
    return false
  }

  area.activeRowIndex = activeRowIndex
  area.activeRow = rows[activeRowIndex]
  area.activeRowid = getRowid($table, area.activeRow)
  area.activeColumnIndex = activeColumnIndex
  area.activeColumn = columns[activeColumnIndex]
  area.activeColumnId = getColumnId(area.activeColumn)
  updateAreaDataByIndexes($table, area, rows, columns, rowStartIndex, rowEndIndex, columnStartIndex, columnEndIndex)
  return true
}

function isVisibleCell ($table: any, cell: HTMLElement) {
  const root = getRootElement($table)
  const bodyWrapper = closestByClass(cell, 'vxe-table--body-wrapper')
  const headerWrapper = closestByClass(cell, 'vxe-table--header-wrapper')
  const wrapper = bodyWrapper || headerWrapper
  if (!root || !root.contains(cell) || !wrapper) {
    return false
  }
  const cellRect = cell.getBoundingClientRect()
  const wrapperRect = wrapper.getBoundingClientRect()
  return cellRect.width > 0 &&
    cellRect.height > 0 &&
    cellRect.right > wrapperRect.left &&
    cellRect.left < wrapperRect.right &&
    cellRect.bottom > wrapperRect.top &&
    cellRect.top < wrapperRect.bottom
}

function getVisibleBodyCellForRangeTarget ($table: any, rows: any[], columns: any[], row: any, column: any, fixed: ColumnFixedType) {
  const cell = $table.getCellElement?.(row, column)
  if (
    cell instanceof HTMLElement &&
    isCellInColumnRegion(cell, fixed) &&
    isVisibleCell($table, cell) &&
    isCellForRangeTarget($table, rows, columns, cell, row, column)
  ) {
    return cell
  }

  const root = getRootElement($table)
  if (!root) {
    return null
  }
  return findDescendantsByClass(root, 'vxe-body--column').find((cellEl) => {
    return isCellInColumnRegion(cellEl, fixed) &&
      isVisibleCell($table, cellEl) &&
      isCellForRangeTarget($table, rows, columns, cellEl, row, column)
  }) || null
}

function getVisibleRangeCells ($table: any, area: CellAreaRange): RangeCells | null {
  if (area.type !== 'body' || !area.rows.length || !area.columns.length) {
    return null
  }

  const rows = getRows($table)
  const columns = getColumns($table)
  const visibleRows = getVisibleRowIndexRange($table, rows)
  const visibleColumns = getVisibleColumnIndexRange($table, columns, area.fixed)
  if (!visibleRows || !visibleColumns) {
    return null
  }

  const rowStartIndex = Math.max(area.startRowIndex, visibleRows.startIndex)
  const rowEndIndex = Math.min(area.endRowIndex, visibleRows.endIndex)
  const columnStartIndex = Math.max(area.startColumnIndex, visibleColumns.startIndex)
  const columnEndIndex = Math.min(area.endColumnIndex, visibleColumns.endIndex)
  if (rowStartIndex > rowEndIndex || columnStartIndex > columnEndIndex) {
    return null
  }

  const startCellInfo = findVisibleRangeCell($table, rows, columns, rowStartIndex, rowEndIndex, columnStartIndex, columnEndIndex, area.fixed, false)
  const endCellInfo = findVisibleRangeCell($table, rows, columns, rowStartIndex, rowEndIndex, columnStartIndex, columnEndIndex, area.fixed, true)
  const startCell = startCellInfo?.cell
  const endCell = endCellInfo?.cell

  if (
    startCell instanceof HTMLElement &&
    endCell instanceof HTMLElement &&
    startCellInfo &&
    endCellInfo
  ) {
    return {
      startCell,
      endCell,
      startCellInfo,
      endCellInfo
    }
  }
  return null
}

function findVisibleRangeCell ($table: any, rows: any[], columns: any[], rowStartIndex: number, rowEndIndex: number, columnStartIndex: number, columnEndIndex: number, fixed: ColumnFixedType, reverse: boolean) {
  const rowStep = reverse ? -1 : 1
  const columnStep = reverse ? -1 : 1
  for (let rowIndex = reverse ? rowEndIndex : rowStartIndex; reverse ? rowIndex >= rowStartIndex : rowIndex <= rowEndIndex; rowIndex += rowStep) {
    const row = rows[rowIndex]
    if (!row) {
      continue
    }
    for (let columnIndex = reverse ? columnEndIndex : columnStartIndex; reverse ? columnIndex >= columnStartIndex : columnIndex <= columnEndIndex; columnIndex += columnStep) {
      const column = columns[columnIndex]
      if (!column) {
        continue
      }
      const cell = getVisibleBodyCellForRangeTarget($table, rows, columns, row, column, fixed)
      if (cell) {
        return {
          row,
          column,
          cell,
          rowIndex,
          columnIndex
        }
      }
    }
  }
  return null
}

function getRangeCells ($table: any, area: CellAreaRange): RangeCells | null {
  const rows = getRows($table)
  const columns = getColumns($table)
  if (!syncAreaData($table, area, rows, columns)) {
    return null
  }

  if (area.type === 'body') {
    const startCell = getVisibleBodyCellForRangeTarget($table, rows, columns, area.startRow, area.startColumn, area.fixed)
    const endCell = getVisibleBodyCellForRangeTarget($table, rows, columns, area.endRow, area.endColumn, area.fixed)
    if (startCell && endCell) {
      return {
        startCell,
        endCell,
        startCellInfo: {
          row: area.startRow,
          column: area.startColumn,
          cell: startCell,
          rowIndex: area.startRowIndex,
          columnIndex: area.startColumnIndex
        },
        endCellInfo: {
          row: area.endRow,
          column: area.endColumn,
          cell: endCell,
          rowIndex: area.endRowIndex,
          columnIndex: area.endColumnIndex
        }
      }
    }
    return getVisibleRangeCells($table, area)
  }

  const startCell = $table.getCellElement?.(area.startRow, area.startColumn)
  const endCell = $table.getCellElement?.(area.endRow, area.endColumn)
  if (
    startCell instanceof HTMLElement &&
    endCell instanceof HTMLElement &&
    isVisibleCell($table, startCell) &&
    isVisibleCell($table, endCell) &&
    isCellForRangeTarget($table, rows, columns, startCell, area.startRow, area.startColumn) &&
    isCellForRangeTarget($table, rows, columns, endCell, area.endRow, area.endColumn)
  ) {
    return {
      startCell,
      endCell,
      startCellInfo: {
        row: area.startRow,
        column: area.startColumn,
        cell: startCell,
        rowIndex: area.startRowIndex,
        columnIndex: area.startColumnIndex
      },
      endCellInfo: {
        row: area.endRow,
        column: area.endColumn,
        cell: endCell,
        rowIndex: area.endRowIndex,
        columnIndex: area.endColumnIndex
      }
    }
  }
  return getVisibleRangeCells($table, area)
}

function getFullAreaAnchorOffset ($table: any, area: CellAreaRange, anchorInfo: RangeCellInfo): CellAreaAnchorOffsetPosition | null {
  const columns = getColumns($table)
  if (area.startColumnIndex < 0 || area.endColumnIndex < 0 || anchorInfo.columnIndex < 0) {
    return null
  }

  const startColumnLeft = getColumnLeft($table, columns, area.startColumnIndex)
  const endColumnRight = getColumnRight($table, columns, area.endColumnIndex)
  const anchorColumnLeft = getColumnLeft($table, columns, anchorInfo.columnIndex)
  const width = endColumnRight - startColumnLeft
  if (!Number.isFinite(width) || width <= 0) {
    return null
  }

  const anchorRect = anchorInfo.cell.getBoundingClientRect()
  let offsetTop = 0
  let height = anchorRect.height
  if (area.type === 'body') {
    const rows = getRows($table)
    if (area.startRowIndex < 0 || area.endRowIndex < 0 || anchorInfo.rowIndex < 0) {
      return null
    }

    const startRowTop = getRowTop($table, rows, area.startRowIndex)
    const endRowBottom = getRowBottom($table, rows, area.endRowIndex)
    const anchorRowTop = getRowTop($table, rows, anchorInfo.rowIndex)
    height = endRowBottom - startRowTop
    offsetTop = startRowTop - anchorRowTop
  }

  if (!Number.isFinite(height) || height <= 0) {
    return null
  }

  return {
    offsetLeft: startColumnLeft - anchorColumnLeft,
    offsetTop,
    width,
    height
  }
}

function getVisibleRowIndexRange ($table: any, rows: any[]) {
  if (!rows.length) {
    return null
  }
  const scrollInfo = $table.getScroll?.()
  const scrollTop = scrollInfo && typeof scrollInfo.scrollTop === 'number' ? scrollInfo.scrollTop : 0
  const clientHeight = scrollInfo && typeof scrollInfo.clientHeight === 'number' ? scrollInfo.clientHeight : 0
  const scrollHeight = scrollInfo && typeof scrollInfo.scrollHeight === 'number' ? scrollInfo.scrollHeight : 0
  if (!clientHeight || !scrollHeight || scrollHeight <= clientHeight) {
    return {
      startIndex: 0,
      endIndex: rows.length - 1
    }
  }
  const estimatedRowHeight = Math.max(1, Math.round(scrollHeight / rows.length))
  const startIndex = clamp(Math.floor(scrollTop / estimatedRowHeight) - 1, 0, rows.length - 1)
  const endIndex = clamp(Math.ceil((scrollTop + clientHeight) / estimatedRowHeight) + 1, 0, rows.length - 1)
  return {
    startIndex,
    endIndex
  }
}

function getScrollableColumnIndexRange ($table: any, columns: any[]) {
  if (!columns.length) {
    return null
  }
  const scrollInfo = $table.getScroll?.()
  const scrollLeft = scrollInfo && typeof scrollInfo.scrollLeft === 'number' ? scrollInfo.scrollLeft : 0
  const clientWidth = scrollInfo && typeof scrollInfo.clientWidth === 'number' ? scrollInfo.clientWidth : 0
  const scrollWidth = scrollInfo && typeof scrollInfo.scrollWidth === 'number' ? scrollInfo.scrollWidth : 0
  if (!clientWidth || !scrollWidth || scrollWidth <= clientWidth) {
    return {
      startIndex: 0,
      endIndex: columns.length - 1
    }
  }

  let left = 0
  let startIndex = 0
  let endIndex = columns.length - 1
  for (let index = 0; index < columns.length; index++) {
    const right = left + getColumnWidth(columns[index])
    if (right > scrollLeft && startIndex === 0 && !(scrollLeft <= 0 && index === 0)) {
      startIndex = Math.max(0, index - 1)
    }
    if (left < scrollLeft + clientWidth) {
      endIndex = index
    } else {
      break
    }
    left = right
  }
  return {
    startIndex,
    endIndex: clamp(endIndex + 1, 0, columns.length - 1)
  }
}

function getVisibleColumnIndexRange ($table: any, columns: any[], fixed: ColumnFixedType) {
  const columnRegionRange = getColumnRegionIndexRange(columns, fixed)
  if (!columnRegionRange) {
    return null
  }
  if (fixed) {
    return columnRegionRange
  }

  const scrollableRange = getScrollableColumnIndexRange($table, columns)
  if (!scrollableRange) {
    return columnRegionRange
  }
  const startIndex = Math.max(columnRegionRange.startIndex, scrollableRange.startIndex)
  const endIndex = Math.min(columnRegionRange.endIndex, scrollableRange.endIndex)
  return startIndex <= endIndex
    ? { startIndex, endIndex }
    : null
}

function isObjectLike (value: any): value is Record<string, any> {
  return !!value && typeof value === 'object'
}

function getAreaInputSource (input: CellAreaInput): Record<string, any> {
  if (!isObjectLike(input)) {
    return {}
  }
  const inputRecord = input as Record<string, any>
  const areaRecord = isObjectLike(inputRecord.area) ? inputRecord.area : null
  return areaRecord
    ? { ...areaRecord, ...inputRecord }
    : inputRecord
}

function toIndex (value: any, fallback = -1) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : fallback
}

function getRangeIndex (range: any, key: 'startIndex' | 'endIndex', fallback = -1) {
  if (Array.isArray(range)) {
    return toIndex(range[key === 'startIndex' ? 0 : 1], fallback)
  }
  return toIndex(range?.[key], fallback)
}

function getArrayEdgeValue (values: any, edge: 'start' | 'end') {
  if (!Array.isArray(values) || !values.length) {
    return null
  }
  return edge === 'start' ? values[0] : values[values.length - 1]
}

function normalizeKeyList (values: any): string[] {
  return Array.isArray(values)
    ? values.map(value => toKey(value)).filter((value): value is string => !!value)
    : []
}

function getInputRowObject (row: any) {
  return isObjectLike(row) ? row : null
}

function getInputColumnObject (column: any) {
  return isObjectLike(column) ? column : null
}

function getInputRowid ($table: any, row: any, rowid: any) {
  const explicitRowid = toKey(rowid)
  if (explicitRowid) {
    return explicitRowid
  }
  if (!isObjectLike(row)) {
    return toKey(row)
  }
  return getRowid($table, row)
}

function getInputColumnId (column: any, columnId: any) {
  const explicitColumnId = toKey(columnId)
  if (explicitColumnId) {
    return explicitColumnId
  }
  if (!isObjectLike(column)) {
    return toKey(column)
  }
  return getColumnId(column)
}

function getInputFixedType (source: Record<string, any>, columns: any[], startColumnIndex: number): ColumnFixedType {
  if (source.fixed === 'left' || source.fixed === 'right' || source.fixed === null) {
    return source.fixed
  }
  return startColumnIndex > -1 ? getColumnFixedType(columns[startColumnIndex]) : null
}

function getInputType (source: Record<string, any>): 'body' | 'header' {
  return source.type === 'header' ? 'header' : 'body'
}

function hasDisabledColumn ($table: any, area: CellAreaRange, options: ExtendCellAreaOptions) {
  return area.columns.some(column => isColumnAreaDisabled({ $table, column }, options))
}

function normalizeCellAreaInput ($table: any, input: CellAreaInput, options: ExtendCellAreaOptions = {}): CellAreaRange | null {
  const source = getAreaInputSource(input)
  const type = getInputType(source)
  const rows = getRows($table)
  const columns = getColumns($table)
  const sourceRows = Array.isArray(source.rows) ? source.rows : []
  const sourceColumns = Array.isArray(source.columns) ? source.columns : []
  const rowIds = normalizeKeyList(source.rowIds)
  const columnIds = normalizeKeyList(source.columnIds)
  const startRowSource = source.startRow ?? getArrayEdgeValue(sourceRows, 'start')
  const endRowSource = source.endRow ?? getArrayEdgeValue(sourceRows, 'end') ?? startRowSource
  const activeRowSource = source.activeRow ?? startRowSource
  const startColumnSource = source.startColumn ?? getArrayEdgeValue(sourceColumns, 'start')
  const endColumnSource = source.endColumn ?? getArrayEdgeValue(sourceColumns, 'end') ?? startColumnSource
  const activeColumnSource = source.activeColumn ?? startColumnSource
  const rowStartFallbackIndex = toIndex(source.startRowIndex, getRangeIndex(source.rowRange, 'startIndex'))
  const rowEndFallbackIndex = toIndex(source.endRowIndex, getRangeIndex(source.rowRange, 'endIndex', rowStartFallbackIndex))
  const columnStartFallbackIndex = toIndex(source.startColumnIndex, getRangeIndex(source.columnRange, 'startIndex'))
  const columnEndFallbackIndex = toIndex(source.endColumnIndex, getRangeIndex(source.columnRange, 'endIndex', columnStartFallbackIndex))
  const startRowid = getInputRowid($table, startRowSource, source.startRowid ?? rowIds[0])
  const endRowid = getInputRowid($table, endRowSource, source.endRowid ?? getArrayEdgeValue(rowIds, 'end') ?? startRowid)
  const activeRowid = getInputRowid($table, activeRowSource, source.activeRowid ?? startRowid)
  const startColumnId = getInputColumnId(startColumnSource, source.startColumnId ?? columnIds[0])
  const endColumnId = getInputColumnId(endColumnSource, source.endColumnId ?? getArrayEdgeValue(columnIds, 'end') ?? startColumnId)
  const activeColumnId = getInputColumnId(activeColumnSource, source.activeColumnId ?? startColumnId)
  const startColumnIndex = resolveColumnIndex($table, columns, getInputColumnObject(startColumnSource), startColumnId, columnStartFallbackIndex)
  const endColumnIndex = resolveColumnIndex($table, columns, getInputColumnObject(endColumnSource), endColumnId, columnEndFallbackIndex)
  const activeColumnIndex = resolveColumnIndex($table, columns, getInputColumnObject(activeColumnSource), activeColumnId, toIndex(source.activeColumnIndex, startColumnIndex))
  if (startColumnIndex < 0 || endColumnIndex < 0 || activeColumnIndex < 0) {
    return null
  }

  const startRowIndex = type === 'body'
    ? resolveRowIndex($table, rows, getInputRowObject(startRowSource), startRowid, rowStartFallbackIndex)
    : -1
  const endRowIndex = type === 'body'
    ? resolveRowIndex($table, rows, getInputRowObject(endRowSource), endRowid, rowEndFallbackIndex)
    : -1
  const activeRowIndex = type === 'body'
    ? resolveRowIndex($table, rows, getInputRowObject(activeRowSource), activeRowid, toIndex(source.activeRowIndex, startRowIndex))
    : -1
  if (type === 'body' && (startRowIndex < 0 || endRowIndex < 0 || activeRowIndex < 0)) {
    return null
  }

  const area: CellAreaRange = {
    type,
    fixed: getInputFixedType(source, columns, startColumnIndex),
    startRow: type === 'body' ? rows[startRowIndex] : null,
    endRow: type === 'body' ? rows[endRowIndex] : null,
    startColumn: columns[startColumnIndex],
    endColumn: columns[endColumnIndex],
    activeRow: type === 'body' ? rows[activeRowIndex] : null,
    activeColumn: columns[activeColumnIndex],
    rows: [],
    columns: [],
    startRowid: type === 'body' ? getRowid($table, rows[startRowIndex]) : null,
    endRowid: type === 'body' ? getRowid($table, rows[endRowIndex]) : null,
    activeRowid: type === 'body' ? getRowid($table, rows[activeRowIndex]) : null,
    startColumnId: getColumnId(columns[startColumnIndex]),
    endColumnId: getColumnId(columns[endColumnIndex]),
    activeColumnId: getColumnId(columns[activeColumnIndex]),
    rowIds: [],
    columnIds: [],
    startRowIndex,
    endRowIndex,
    activeRowIndex,
    startColumnIndex,
    endColumnIndex,
    activeColumnIndex
  }

  if (!syncAreaData($table, area, rows, columns) || hasDisabledColumn($table, area, options)) {
    return null
  }
  return area
}

export function getCellAreaSelectionInfo ($table: any, area: CellAreaRange | null = getStore($table).activeArea): CellAreaSelectionInfo | null {
  if (!area) {
    return null
  }
  const rows = getRows($table)
  const columns = getColumns($table)
  if (!syncAreaData($table, area, rows, columns)) {
    return null
  }
  return {
    area,
    rows: area.rows.slice(0),
    columns: area.columns.slice(0),
    rowIds: area.rowIds.slice(0),
    columnIds: area.columnIds.slice(0),
    rowRange: {
      startIndex: area.startRowIndex,
      endIndex: area.endRowIndex
    },
    columnRange: {
      startIndex: area.startColumnIndex,
      endIndex: area.endColumnIndex
    },
    startRow: area.startRow,
    endRow: area.endRow,
    startColumn: area.startColumn,
    endColumn: area.endColumn
  }
}

export function getCellAreaRows ($table: any, area: CellAreaRange | null = getStore($table).activeArea) {
  return getCellAreaSelectionInfo($table, area)?.rows || []
}

export function getCellAreaColumns ($table: any, area: CellAreaRange | null = getStore($table).activeArea) {
  return getCellAreaSelectionInfo($table, area)?.columns || []
}

export function getCellAreaSelections ($table: any): CellAreaSelectionInfo[] {
  return getStore($table).cellAreas
    .map(area => getCellAreaSelectionInfo($table, area))
    .filter((selection): selection is CellAreaSelectionInfo => !!selection)
}

export function setCellAreas ($table: any, areas: CellAreaInput[], options: ExtendCellAreaOptions = {}) {
  const store = getStore($table)
  const normalizedAreas = Array.isArray(areas)
    ? areas
      .map(area => normalizeCellAreaInput($table, area, options))
      .filter((area): area is CellAreaRange => !!area)
    : []

  store.cellAreas = normalizedAreas
  store.activeArea = normalizedAreas[normalizedAreas.length - 1] || null
  store.extendArea = null
  store.isSelecting = false
  store.isExtending = false
  unbindCellAreaScrollRepaint($table)

  if (store.activeArea) {
    repaintActiveCellArea($table)
  } else {
    hideCellAreaOverlays($table)
  }
  $table.dispatchEvent?.('cell-area-selection-set', { cellAreas: store.cellAreas }, null)
  return store.cellAreas
}

export function addCellArea ($table: any, area: CellAreaInput, options: ExtendCellAreaOptions = {}) {
  const normalizedArea = normalizeCellAreaInput($table, area, options)
  if (!normalizedArea) {
    return null
  }
  const store = getStore($table)
  store.cellAreas.push(normalizedArea)
  store.activeArea = normalizedArea
  store.extendArea = null
  store.isSelecting = false
  store.isExtending = false
  unbindCellAreaScrollRepaint($table)
  repaintActiveCellArea($table)
  $table.dispatchEvent?.('cell-area-selection-add', { area: normalizedArea, cellAreas: store.cellAreas }, null)
  return normalizedArea
}

export function removeCellArea ($table: any, index: number) {
  const store = getStore($table)
  const normalizedIndex = toIndex(index)
  if (normalizedIndex < 0 || normalizedIndex >= store.cellAreas.length) {
    return null
  }

  const removedArea = store.cellAreas.splice(normalizedIndex, 1)[0]
  if (store.activeArea === removedArea) {
    store.activeArea = store.cellAreas[Math.min(normalizedIndex, store.cellAreas.length - 1)] || null
  }
  if (store.copyArea === removedArea) {
    store.copyArea = null
  }
  if (store.extendArea === removedArea) {
    store.extendArea = null
  }

  if (store.activeArea) {
    repaintActiveCellArea($table)
  } else {
    hideCellAreaOverlays($table)
  }
  $table.dispatchEvent?.('cell-area-selection-remove', { area: removedArea, index: normalizedIndex, cellAreas: store.cellAreas }, null)
  return removedArea
}

interface RenderAreaOptions {
  keepVisibleOnMiss?: boolean
}

function renderInactiveCellAreas ($table: any, activeArea: CellAreaRange) {
  const store = getStore($table)
  store.cellAreas.forEach((area) => {
    if (area === activeArea) {
      return
    }

    const cells = getRangeCells($table, area)
    if (!cells) {
      return
    }

    const fullPosition = getFullAreaAnchorOffset($table, area, cells.startCellInfo)
    if (fullPosition && showInactiveCellAreaByAnchorOffset($table, cells.startCellInfo.cell, fullPosition)) {
      return
    }
    showInactiveCellArea($table, cells.startCell, cells.endCell)
  })
}

function renderArea ($table: any, area: CellAreaRange, fallbackCell?: HTMLElement, options: RenderAreaOptions = {}) {
  const cells = getRangeCells($table, area)
  if (cells) {
    const fullPosition = getFullAreaAnchorOffset($table, area, cells.startCellInfo)
    if (fullPosition && showCellAreaByAnchorOffset($table, area, cells.startCellInfo.cell, fullPosition)) {
      renderInactiveCellAreas($table, area)
      return true
    }
    showCellArea($table, area, cells.startCell, cells.endCell)
    renderInactiveCellAreas($table, area)
    return true
  } else if (fallbackCell) {
    showCellArea($table, area, fallbackCell, fallbackCell)
    renderInactiveCellAreas($table, area)
    return true
  }
  if (options.keepVisibleOnMiss) {
    return false
  }
  hideCellAreaOverlays($table)
  return false
}

function isCellAreaDrawing ($table: any) {
  const store = getStore($table)
  return !!(store.isSelecting || store.isExtending)
}

export function repaintActiveCellArea ($table: any, options: RenderAreaOptions = {}) {
  const store = getStore($table)
  if (!store.activeArea) {
    hideCellAreaOverlays($table)
    return false
  }
  return renderArea($table, store.activeArea, undefined, options)
}

function scheduleScrollRepaint ($table: any) {
  if (!isCellAreaDrawing($table)) {
    const oldFrame = scrollRepaintFrames.get($table)
    if (oldFrame) {
      window.cancelAnimationFrame(oldFrame)
      scrollRepaintFrames.delete($table)
    }
    return
  }

  const oldFrame = scrollRepaintFrames.get($table)
  if (oldFrame) {
    window.cancelAnimationFrame(oldFrame)
  }
  const frame = window.requestAnimationFrame(() => {
    if (!isCellAreaDrawing($table)) {
      scrollRepaintFrames.delete($table)
      return
    }
    repaintActiveCellArea($table, { keepVisibleOnMiss: true })
    const secondFrame = window.requestAnimationFrame(() => {
      scrollRepaintFrames.delete($table)
      if (!isCellAreaDrawing($table)) {
        return
      }
      repaintActiveCellArea($table, { keepVisibleOnMiss: true })
    })
    scrollRepaintFrames.set($table, secondFrame)
  })
  scrollRepaintFrames.set($table, frame)
}

export function bindCellAreaScrollRepaint ($table: any) {
  if (scrollRepaintCleanups.has($table)) {
    return
  }

  const handleScroll = () => {
    scheduleScrollRepaint($table)
  }
  const root = getRootElement($table)
  const elements = getScrollElements($table)
  elements.forEach(el => el.addEventListener('scroll', handleScroll))
  root?.addEventListener('scroll', handleScroll, true)

  scrollRepaintCleanups.set($table, () => {
    elements.forEach(el => el.removeEventListener('scroll', handleScroll))
    root?.removeEventListener('scroll', handleScroll, true)
    const frame = scrollRepaintFrames.get($table)
    if (frame) {
      window.cancelAnimationFrame(frame)
      scrollRepaintFrames.delete($table)
    }
    scrollRepaintCleanups.delete($table)
  })
}

export function unbindCellAreaScrollRepaint ($table: any) {
  scrollRepaintCleanups.get($table)?.()
}

export function handleCellAreaMousedown ($table: any, options: ExtendCellAreaOptions, evnt: MouseEvent, params: any) {
  if (evnt.button !== 0) {
    return
  }
  const cell = params.cell || evnt.currentTarget
  if (!(cell instanceof HTMLElement)) {
    return
  }
  if (shouldSkipCellAreaMousedownForResize(evnt, cell)) {
    return
  }

  const guardParams = {
    $table,
    row: params.row,
    column: params.column,
    cell,
    $event: evnt
  }

  if (isColumnAreaDisabled(guardParams, options)) {
    $table.dispatchEvent?.('cell-area-selection-invalid', guardParams, evnt)
    return
  }

  const type: 'body' | 'header' = cell.classList.contains('vxe-header--column') ? 'header' : 'body'
  const beforeParams = {
    ...guardParams,
    type
  }
  if (options.beforeSelectMethod && options.beforeSelectMethod(beforeParams) === false) {
    return
  }

  evnt.preventDefault()
  const store = getStore($table)
  const isMulti = !!(options.allowMulti !== false && (evnt.ctrlKey || evnt.metaKey))
  const isShiftRange = !!(
    evnt.shiftKey &&
    store.activeArea &&
    store.activeArea.type === type &&
    type === 'body' &&
    params.row &&
    params.column
  )
  let area: CellAreaRange

  if (isShiftRange) {
    area = store.activeArea as CellAreaRange
    const rows = getRows($table, params.visibleData || params.data || [])
    const columns = getColumns($table, params.columns || params.items || [])
    const updated = normalizeArea($table, area, rows, columns, params.row, params.column, options)
    if (!updated) {
      $table.dispatchEvent?.('cell-area-selection-invalid', guardParams, evnt)
      return
    }
    if (!isMulti) {
      store.cellAreas = [area]
    } else if (!store.cellAreas.includes(area)) {
      store.cellAreas.push(area)
    }
  } else {
    area = createSingleCellArea($table, { ...params, cell, type })

    if (!isMulti) {
      store.cellAreas = []
    }
    store.cellAreas.push(area)
  }
  store.activeArea = area
  store.isSelecting = true
  bindCellAreaScrollRepaint($table)

  renderArea($table, area, cell)
  $table.dispatchEvent?.('cell-area-selection-start', { area, cellAreas: store.cellAreas }, evnt)

  let lastClientX = evnt.clientX
  let lastClientY = evnt.clientY
  let lastMoveDirectionX = 0
  let lastMoveDirectionY = 0
  let lastEvent: Event = evnt
  let autoScrollFrame: number | null = null
  let autoScrollLastRunTime = 0
  let autoScrollDeltaX = 0
  let autoScrollDeltaY = 0
  let autoScrollPending = false

  const updateAreaFromPoint = (clientX: number, clientY: number, sourceEvent: Event, clampToBody = false) => {
    const targetCell = getBodyCellFromPoint($table, clientX, clientY, clampToBody)
    if (!targetCell) {
      return false
    }
    const targetParams = getCellParamsFromElement($table, params, targetCell)
    if (!targetParams) {
      return false
    }
    const updated = normalizeArea($table, area, targetParams.rows, targetParams.columns, targetParams.row, targetParams.column, options)
    if (!updated) {
      $table.dispatchEvent?.('cell-area-selection-invalid', {
        $table,
        row: targetParams.row,
        column: targetParams.column,
        cell: targetCell,
        $event: sourceEvent
      }, sourceEvent)
      return false
    }
    renderArea($table, area, targetCell)
    $table.dispatchEvent?.('cell-area-selection-drag', { area, cellAreas: store.cellAreas }, sourceEvent)
    return true
  }

  const stopAutoScroll = () => {
    if (autoScrollFrame !== null) {
      window.cancelAnimationFrame(autoScrollFrame)
      autoScrollFrame = null
    }
    autoScrollLastRunTime = 0
    autoScrollDeltaX = 0
    autoScrollDeltaY = 0
    autoScrollPending = false
  }

  const getAutoScrollDeltaX = () => {
    const bodyWrapper = getBodyWrapper($table)
    if (!bodyWrapper) {
      return 0
    }
    const bodyRect = bodyWrapper.getBoundingClientRect()
    if (lastClientY < bodyRect.top || lastClientY > bodyRect.bottom) {
      return 0
    }

    const rightOffset = lastClientX - (bodyRect.right - AUTO_SCROLL_EDGE_SIZE)
    if (rightOffset > 0 && lastClientX > bodyRect.right && lastMoveDirectionX >= 0) {
      return Math.round(clamp(rightOffset / AUTO_SCROLL_EDGE_SIZE, 0.2, 1) * AUTO_SCROLL_MAX_STEP)
    }

    const leftOffset = (bodyRect.left + AUTO_SCROLL_EDGE_SIZE) - lastClientX
    if (leftOffset > 0 && lastClientX < bodyRect.left && lastMoveDirectionX <= 0) {
      return -Math.round(clamp(leftOffset / AUTO_SCROLL_EDGE_SIZE, 0.2, 1) * AUTO_SCROLL_MAX_STEP)
    }
    return 0
  }

  const getAutoScrollDeltaY = () => {
    const bodyWrapper = getBodyWrapper($table)
    if (!bodyWrapper) {
      return 0
    }
    const bodyRect = bodyWrapper.getBoundingClientRect()
    if (lastClientX < bodyRect.left || lastClientX > bodyRect.right) {
      return 0
    }

    const bottomOffset = lastClientY - (bodyRect.bottom - AUTO_SCROLL_EDGE_SIZE)
    if (bottomOffset > 0 && lastClientY > bodyRect.bottom && lastMoveDirectionY >= 0) {
      return Math.round(clamp(bottomOffset / AUTO_SCROLL_EDGE_SIZE, 0.2, 1) * AUTO_SCROLL_MAX_STEP)
    }

    const topOffset = (bodyRect.top + AUTO_SCROLL_EDGE_SIZE) - lastClientY
    if (topOffset > 0 && lastClientY < bodyRect.top && lastMoveDirectionY <= 0) {
      return -Math.round(clamp(topOffset / AUTO_SCROLL_EDGE_SIZE, 0.2, 1) * AUTO_SCROLL_MAX_STEP)
    }
    return 0
  }

  const performAutoScroll = () => {
    if (!store.isSelecting || (!autoScrollDeltaX && !autoScrollDeltaY) || autoScrollPending) {
      return
    }

    const scrollEl = getBodyScrollElement($table)
    if (!scrollEl) {
      stopAutoScroll()
      return
    }

    const maxScrollLeft = getMaxScrollLeft($table, scrollEl)
    const currentScrollLeft = getScrollLeft($table)
    const nextScrollLeft = clamp(currentScrollLeft + autoScrollDeltaX, 0, maxScrollLeft)
    const hasScrollX = nextScrollLeft !== currentScrollLeft

    const maxScrollTop = getMaxScrollTop($table, scrollEl)
    const currentScrollTop = getScrollTop($table)
    const nextScrollTop = clamp(currentScrollTop + autoScrollDeltaY, 0, maxScrollTop)
    const hasScrollY = nextScrollTop !== currentScrollTop

    if (!hasScrollX && !hasScrollY) {
      return
    }

    autoScrollPending = true
    Promise.resolve($table.scrollTo?.(hasScrollX ? nextScrollLeft : null, hasScrollY ? nextScrollTop : null)).finally(() => {
      autoScrollPending = false
      if (store.isSelecting) {
        updateAreaFromPoint(lastClientX, lastClientY, lastEvent, true)
      }
    })
  }

  const runAutoScroll = (timestamp: number) => {
    autoScrollFrame = null
    if (!store.isSelecting || (!autoScrollDeltaX && !autoScrollDeltaY)) {
      return
    }
    if (!autoScrollLastRunTime || timestamp - autoScrollLastRunTime >= AUTO_SCROLL_INTERVAL) {
      autoScrollLastRunTime = timestamp
      performAutoScroll()
    }
    if (store.isSelecting && (autoScrollDeltaX || autoScrollDeltaY)) {
      autoScrollFrame = window.requestAnimationFrame(runAutoScroll)
    }
  }

  const updateAutoScroll = () => {
    autoScrollDeltaX = getAutoScrollDeltaX()
    autoScrollDeltaY = getAutoScrollDeltaY()
    if (!autoScrollDeltaX && !autoScrollDeltaY) {
      stopAutoScroll()
      return
    }
    if (autoScrollFrame === null) {
      autoScrollFrame = window.requestAnimationFrame(runAutoScroll)
    }
  }

  const handleMousemove = (moveEvent: MouseEvent) => {
    const previousClientX = lastClientX
    const previousClientY = lastClientY
    lastClientX = moveEvent.clientX
    lastClientY = moveEvent.clientY
    if (moveEvent.clientX !== previousClientX) {
      lastMoveDirectionX = Math.sign(moveEvent.clientX - previousClientX)
    }
    if (moveEvent.clientY !== previousClientY) {
      lastMoveDirectionY = Math.sign(moveEvent.clientY - previousClientY)
    }
    lastEvent = moveEvent
    updateAreaFromPoint(moveEvent.clientX, moveEvent.clientY, moveEvent)
    updateAutoScroll()
  }

  const handleScroll = () => {
    window.requestAnimationFrame(() => {
      if (store.isSelecting) {
        updateAreaFromPoint(lastClientX, lastClientY, lastEvent, true)
      }
    })
  }

  const handleWheel = (wheelEvent: WheelEvent) => {
    lastClientX = wheelEvent.clientX
    lastClientY = wheelEvent.clientY
    lastEvent = wheelEvent
    handleScroll()
  }

  const handleMouseup = (upEvent: MouseEvent) => {
    document.removeEventListener('mousemove', handleMousemove)
    document.removeEventListener('mouseup', handleMouseup)
    document.removeEventListener('wheel', handleWheel)
    getBodyScrollElement($table)?.removeEventListener('scroll', handleScroll)
    stopAutoScroll()
    store.isSelecting = false
    unbindCellAreaScrollRepaint($table)
    $table.dispatchEvent?.('cell-area-selection-end', { area, cellAreas: store.cellAreas }, upEvent)
  }

  document.addEventListener('mousemove', handleMousemove)
  document.addEventListener('mouseup', handleMouseup)
  document.addEventListener('wheel', handleWheel, { passive: true })
  getBodyScrollElement($table)?.addEventListener('scroll', handleScroll)
}
