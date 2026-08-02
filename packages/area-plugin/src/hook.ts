import { clearStore, getStore } from './core/store'
import { addCellArea, getCellAreaColumns, getCellAreaRows, getCellAreaSelectionInfo, getCellAreaSelections, handleCellAreaMousedown, removeCellArea, repaintActiveCellArea, setCellAreas, unbindCellAreaScrollRepaint } from './core/selection'
import { getActiveCellAreaMergeCells, mergeActiveCellArea, splitActiveCellArea } from './core/merge'
import { insertCellAreaColumns, insertCellAreaRows, removeCellAreaColumns, removeCellAreaRows } from './core/structure'
import { handleColumnResizeCellAreaEvent, handleColumnResizeDblclickCellAreaEvent, handleRowResizeCellAreaEvent, handleRowResizeDblclickCellAreaEvent } from './core/resize'
import { hideCellAreaOverlays } from './dom/overlay'
import { hideCellAreaContextMenu, registerCellAreaContextMenuLifecycle } from './dom/context-menu'
import type { ExtendCellAreaOptions, VxeUILike } from './types'

const injectedTableMethodKeys = [
  'getCellAreas',
  'getActiveCellArea',
  'getCellAreaSelection',
  'getCellAreaSelections',
  'getCellAreaRows',
  'getCellAreaColumns',
  'setCellAreas',
  'addCellArea',
  'removeCellArea',
  'getActiveCellAreaMergeCells',
  'mergeActiveCellArea',
  'splitActiveCellArea',
  'insertCellAreaRows',
  'insertCellAreaColumns',
  'removeCellAreaRows',
  'removeCellAreaColumns',
  'closeCellAreaContextMenu',
  'clearCellAreas',
  'clearCopyCellArea',
  'handleRecalculateCellAreaEvent',
  'handleColResizeCellAreaEvent',
  'handleColResizeDblclickCellAreaEvent',
  'handleRowResizeCellAreaEvent',
  'handleRowResizeDblclickCellAreaEvent',
  'triggerCelllAreaMnEvent',
  'triggerCellAreaExtendMousedownEvent',
  'handleKeyboardCellAreaEvent',
  'handlePeClAreaEvent',
  'handleCyClAreaEvent',
  'handleCutCellAreaEvent'
]

function createTableMethods ($table: any, options: ExtendCellAreaOptions) {
  return {
    getCellAreas () {
      return getStore($table).cellAreas
    },
    getActiveCellArea () {
      return getStore($table).activeArea
    },
    getCellAreaSelection () {
      return getCellAreaSelectionInfo($table)
    },
    getCellAreaSelections () {
      return getCellAreaSelections($table)
    },
    getCellAreaRows () {
      return getCellAreaRows($table)
    },
    getCellAreaColumns () {
      return getCellAreaColumns($table)
    },
    setCellAreas (areas: any[]) {
      return setCellAreas($table, areas, options)
    },
    addCellArea (area: any) {
      return addCellArea($table, area, options)
    },
    removeCellArea (index: number) {
      return removeCellArea($table, index)
    },
    getActiveCellAreaMergeCells () {
      return getActiveCellAreaMergeCells($table)
    },
    mergeActiveCellArea (evnt?: Event) {
      return mergeActiveCellArea($table, evnt)
    },
    splitActiveCellArea (evnt?: Event) {
      return splitActiveCellArea($table, evnt)
    },
    insertCellAreaRows (evnt?: Event) {
      return insertCellAreaRows($table, options, evnt)
    },
    insertCellAreaColumns (evnt?: Event) {
      return insertCellAreaColumns($table, options, evnt)
    },
    removeCellAreaRows (evnt?: Event) {
      return removeCellAreaRows($table, evnt)
    },
    removeCellAreaColumns (evnt?: Event) {
      return removeCellAreaColumns($table, evnt)
    },
    closeCellAreaContextMenu () {
      hideCellAreaContextMenu($table)
      return Promise.resolve()
    },
    clearCellAreas () {
      clearStore($table)
      unbindCellAreaScrollRepaint($table)
      hideCellAreaOverlays($table)
      hideCellAreaContextMenu($table)
      return Promise.resolve()
    },
    clearCopyCellArea () {
      const store = getStore($table)
      store.copyArea = null
      return Promise.resolve()
    },
    handleRecalculateCellAreaEvent () {
      const store = getStore($table)
      if (store.isSelecting || store.isExtending) {
        repaintActiveCellArea($table)
      }
      return Promise.resolve()
    },
    handleColResizeCellAreaEvent (evnt: MouseEvent, params: any) {
      return handleColumnResizeCellAreaEvent($table, evnt, params)
    },
    handleColResizeDblclickCellAreaEvent (evnt: MouseEvent, params: any) {
      return handleColumnResizeDblclickCellAreaEvent($table, evnt, params)
    },
    handleRowResizeCellAreaEvent (evnt: MouseEvent, params: any) {
      return handleRowResizeCellAreaEvent($table, evnt, params)
    },
    handleRowResizeDblclickCellAreaEvent (evnt: MouseEvent, params: any) {
      return handleRowResizeDblclickCellAreaEvent($table, evnt, params)
    },
    triggerCelllAreaMnEvent (evnt: MouseEvent, params: any) {
      return handleCellAreaMousedown($table, options, evnt, params)
    },
    triggerCellAreaExtendMousedownEvent (evnt: MouseEvent) {
      evnt.preventDefault()
      const store = getStore($table)
      if (store.activeArea) {
        $table.dispatchEvent?.('cell-area-extension-start', { area: store.activeArea }, evnt)
        $table.dispatchEvent?.('cell-area-extension-end', { area: store.activeArea }, evnt)
      }
    },
    handleKeyboardCellAreaEvent () {
      return false
    },
    handlePeClAreaEvent (evnt: ClipboardEvent) {
      const store = getStore($table)
      if (store.activeArea) {
        store.copyArea = store.activeArea
        $table.dispatchEvent?.('cell-area-paste', { area: store.activeArea }, evnt)
      }
    },
    handleCyClAreaEvent (evnt: ClipboardEvent) {
      const store = getStore($table)
      if (store.activeArea) {
        store.copyArea = store.activeArea
        $table.dispatchEvent?.('cell-area-copy', { area: store.activeArea }, evnt)
      }
    },
    handleCutCellAreaEvent (evnt: ClipboardEvent) {
      const store = getStore($table)
      if (store.activeArea) {
        store.copyArea = store.activeArea
        $table.dispatchEvent?.('cell-area-cut', { area: store.activeArea }, evnt)
      }
    }
  }
}

export function registerExtendCellAreaHook (VxeUI: VxeUILike, options: ExtendCellAreaOptions = {}) {
  if (!VxeUI.hooks) {
    throw new Error('[vxe-table-plugin-extend-cell-area] VxeUI.hooks is required.')
  }

  registerCellAreaContextMenuLifecycle(VxeUI)

  VxeUI.hooks.add('extendCellArea', {
    setupTable ($table: any) {
      return createTableMethods($table, options)
    },
    setupGrid ($grid: any) {
      if ($grid.extendTableMethods) {
        return $grid.extendTableMethods(injectedTableMethodKeys)
      }
      return {}
    }
  })
}
