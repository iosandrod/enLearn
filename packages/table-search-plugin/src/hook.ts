import {
  bindTableSearchPanel,
  closeTableSearchPanel,
  isTableSearchPanelVisible,
  openTableSearchPanel,
  toggleTableSearchPanel,
  unbindTableSearchPanel
} from './panel.js'
import type {
  OpenTableSearchPanelOptions,
  TableSearchPanelOptions,
  VxeUILike
} from './types.js'

const injectedTableMethodKeys = [
  'openTableSearchPanel',
  'closeTableSearchPanel',
  'toggleTableSearchPanel',
  'isTableSearchPanelVisible'
]

function createTableMethods($table: any) {
  return {
    openTableSearchPanel(openOptions?: OpenTableSearchPanelOptions) {
      return openTableSearchPanel($table, openOptions)
    },
    closeTableSearchPanel() {
      return closeTableSearchPanel($table)
    },
    toggleTableSearchPanel(force?: boolean) {
      return toggleTableSearchPanel($table, force)
    },
    isTableSearchPanelVisible() {
      return isTableSearchPanelVisible($table)
    }
  }
}

export function registerTableSearchPanelHook(
  VxeUI: VxeUILike,
  options: TableSearchPanelOptions = {}
) {
  if (!VxeUI.hooks) {
    throw new Error('[vxe-table-plugin-search-panel] VxeUI.hooks is required.')
  }
  if (!VxeUI.interceptor) {
    throw new Error('[vxe-table-plugin-search-panel] VxeUI.interceptor is required.')
  }

  VxeUI.hooks.add('tableSearchPanel', {
    setupTable($table: any) {
      return createTableMethods($table)
    },
    setupGrid($grid: any) {
      return $grid.extendTableMethods
        ? $grid.extendTableMethods(injectedTableMethodKeys)
        : {}
    }
  })

  VxeUI.interceptor.add('mounted', ({ $table }) => {
    if ($table?.openTableSearchPanel) {
      bindTableSearchPanel($table, options)
    }
  })
  VxeUI.interceptor.add('beforeUnmount', ({ $table }) => {
    if ($table?.openTableSearchPanel) {
      unbindTableSearchPanel($table)
    }
  })
}
