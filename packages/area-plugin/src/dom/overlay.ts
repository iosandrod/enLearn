import type { CellAreaRange } from '../types'
import { closestByClasses, findDescendantByClass, findDescendantsByClass, findDescendantsByClasses } from './traversal'

interface AreaOverlayRefs {
  wrapperEl: HTMLElement | null
  areaEl: HTMLElement
  mainAreaEl: HTMLElement | null
  activeAreaEl: HTMLElement | null
  multiAreaEl: HTMLElement | null
  areaParts: HTMLElement[]
}

interface StylePosition {
  display: string
  left: string
  top: string
  width: string
  height: string
}

export interface CellAreaAnchorOffsetPosition {
  offsetLeft: number
  offsetTop: number
  width: number
  height: number
}

const overlayRefsMap = new WeakMap<any, AreaOverlayRefs[]>()

function getRootElement ($table: any): HTMLElement | null {
  const refMaps = $table.getRefMaps ? $table.getRefMaps() : {}
  return refMaps.refElem && refMaps.refElem.value ? refMaps.refElem.value : null
}

function createAreaOverlayRefs (areaEl: HTMLElement): AreaOverlayRefs {
  return {
    wrapperEl: closestByClasses(areaEl, ['vxe-table--body-wrapper', 'vxe-table--header-wrapper']),
    areaEl,
    mainAreaEl: findDescendantByClass(areaEl, 'vxe-table--cell-main-area'),
    activeAreaEl: findDescendantByClass(areaEl, 'vxe-table--cell-active-area'),
    multiAreaEl: findDescendantByClass(areaEl, 'vxe-table--cell-multi-area'),
    areaParts: findDescendantsByClasses(areaEl, [
      'vxe-table--cell-main-area',
      'vxe-table--cell-clip-area',
      'vxe-table--cell-extend-area',
      'vxe-table--cell-active-area',
      'vxe-table--cell-row-status-area',
      'vxe-table--cell-col-status-area'
    ])
  }
}

function queryAreaOverlayRefs ($table: any) {
  const root = getRootElement($table)
  if (!root) {
    return []
  }

  const refs = findDescendantsByClass(root, 'vxe-table--cell-area').map(createAreaOverlayRefs)
  overlayRefsMap.set($table, refs)
  return refs
}

function getAreaOverlayRefs ($table: any, force = false) {
  if (force) {
    return queryAreaOverlayRefs($table)
  }

  const cachedRefs = overlayRefsMap.get($table)
  if (cachedRefs?.length && cachedRefs.every(ref => ref.areaEl.isConnected)) {
    return cachedRefs
  }

  return queryAreaOverlayRefs($table)
}

function setHidden (el: HTMLElement) {
  el.style.display = ''
  el.removeAttribute('half')
}

export function hideCellAreaOverlays ($table: any) {
  getAreaOverlayRefs($table, true).forEach((refs) => {
    refs.areaEl.style.display = ''
    refs.areaParts.forEach(setHidden)
    if (refs.multiAreaEl) {
      refs.multiAreaEl.innerHTML = ''
    }
  })
}

function getCellAreaRefs ($table: any, cell: HTMLElement) {
  const wrapper = closestByClasses(cell, ['vxe-table--body-wrapper', 'vxe-table--header-wrapper'])
  if (!wrapper) {
    return null
  }
  return getAreaOverlayRefs($table).find(refs => refs.wrapperEl === wrapper) ||
    getAreaOverlayRefs($table, true).find(refs => refs.wrapperEl === wrapper) ||
    null
}

function toStylePosition (position: { left: number, top: number, width: number, height: number }): StylePosition {
  return {
    display: 'block',
    left: `${position.left}px`,
    top: `${position.top}px`,
    width: `${Math.max(0, position.width)}px`,
    height: `${Math.max(0, position.height)}px`
  }
}

function getCellContentPosition (areaEl: HTMLElement, cell: HTMLElement) {
  const rootEl = areaEl.parentElement
  const rootRect = rootEl?.getBoundingClientRect()
  const cellRect = cell.getBoundingClientRect()
  if (!rootEl || !rootRect) {
    return null
  }

  const left = cellRect.left - rootRect.left + rootEl.scrollLeft
  const top = cellRect.top - rootRect.top + rootEl.scrollTop

  return {
    left,
    top,
    width: cellRect.width,
    height: cellRect.height
  }
}

function getAreaPosition (areaEl: HTMLElement, startCell: HTMLElement, endCell: HTMLElement) {
  const startPosition = getCellContentPosition(areaEl, startCell)
  const endPosition = getCellContentPosition(areaEl, endCell)
  if (!startPosition || !endPosition) {
    return null
  }

  const left = Math.max(0, Math.min(startPosition.left, endPosition.left))
  const top = Math.max(0, Math.min(startPosition.top, endPosition.top))
  const right = Math.max(startPosition.left + startPosition.width, endPosition.left + endPosition.width)
  const bottom = Math.max(startPosition.top + startPosition.height, endPosition.top + endPosition.height)

  return toStylePosition({
    left,
    top,
    width: right - left,
    height: bottom - top
  })
}

function applyCellAreaPosition (refs: AreaOverlayRefs, position: ReturnType<typeof toStylePosition>) {
  const { areaEl, mainAreaEl, activeAreaEl } = refs
  if (!mainAreaEl || !activeAreaEl) {
    return false
  }

  areaEl.style.display = 'block'
  Object.assign(mainAreaEl.style, position)
  Object.assign(activeAreaEl.style, position)

  const handle = findDescendantByClass(mainAreaEl, 'vxe-table--cell-main-area-btn')
  if (handle) {
    handle.style.display = 'block'
  }
  return true
}

function appendCellItemPosition (refs: AreaOverlayRefs, position: StylePosition) {
  if (!refs.multiAreaEl) {
    return false
  }
  const itemEl = document.createElement('span')
  itemEl.className = 'vxe-table--cell-item-area'
  Object.assign(itemEl.style, position)
  refs.areaEl.style.display = 'block'
  refs.multiAreaEl.appendChild(itemEl)
  return true
}

export function showCellArea ($table: any, area: CellAreaRange, startCell: HTMLElement, endCell: HTMLElement = startCell) {
  const refs = getCellAreaRefs($table, startCell)
  const areaEl = refs?.areaEl
  if (!refs || !areaEl) {
    return false
  }

  const position = getAreaPosition(areaEl, startCell, endCell)
  if (!position) {
    return false
  }

  hideCellAreaOverlays($table)
  return applyCellAreaPosition(refs, position)
}

export function showInactiveCellArea ($table: any, startCell: HTMLElement, endCell: HTMLElement = startCell) {
  const refs = getCellAreaRefs($table, startCell)
  const areaEl = refs?.areaEl
  if (!refs || !areaEl) {
    return false
  }

  const position = getAreaPosition(areaEl, startCell, endCell)
  return position ? appendCellItemPosition(refs, position) : false
}

export function showCellAreaByAnchorOffset ($table: any, area: CellAreaRange, anchorCell: HTMLElement, position: CellAreaAnchorOffsetPosition) {
  const refs = getCellAreaRefs($table, anchorCell)
  const areaEl = refs?.areaEl
  if (!refs || !areaEl) {
    return false
  }

  const anchorPosition = getCellContentPosition(areaEl, anchorCell)
  if (!anchorPosition) {
    return false
  }

  hideCellAreaOverlays($table)
  return applyCellAreaPosition(refs, toStylePosition({
    left: anchorPosition.left + position.offsetLeft,
    top: anchorPosition.top + position.offsetTop,
    width: position.width,
    height: position.height
  }))
}

export function showInactiveCellAreaByAnchorOffset ($table: any, anchorCell: HTMLElement, position: CellAreaAnchorOffsetPosition) {
  const refs = getCellAreaRefs($table, anchorCell)
  const areaEl = refs?.areaEl
  if (!refs || !areaEl) {
    return false
  }

  const anchorPosition = getCellContentPosition(areaEl, anchorCell)
  if (!anchorPosition) {
    return false
  }

  return appendCellItemPosition(refs, toStylePosition({
    left: anchorPosition.left + position.offsetLeft,
    top: anchorPosition.top + position.offsetTop,
    width: position.width,
    height: position.height
  }))
}

export function showSingleCellArea ($table: any, area: CellAreaRange, cell: HTMLElement) {
  showCellArea($table, area, cell, cell)
}
