import {
  cloneAdvancedFilterState,
  createEmptyAdvancedFilterState,
  isAdvancedFilterStateActive,
  normalizeAdvancedFilterState
} from './filter-engine.js'
import {
  enableAdvancedFilterColumns,
  inferColumnAdvancedFilterDataType,
  isAdvancedFilterColumn,
  prepareAdvancedFilterColumns
} from './column-adapter.js'
import {
  bindAdvancedFilterRuntime,
  configureAdvancedFilterRuntime,
  getAdvancedFilterRuntime,
  unbindAdvancedFilterRuntime
} from './runtime.js'
import {
  disposeAdvancedFilterPanel,
  invalidateAdvancedFilterValueOptions
} from './renderer.js'
import {
  ADVANCED_FILTER_OPTION_VALUE,
  type AdvancedFilterPluginOptions,
  type AdvancedFilterState,
  type SetAdvancedFilterStateOptions,
  type VxeUILike
} from './types.js'

const injectedTableMethodKeys = [
  'configureAdvancedFilter',
  'openAdvancedFilter',
  'getAdvancedFilterState',
  'setAdvancedFilterState',
  'clearAdvancedFilter',
  'isAdvancedFilterActive',
  'refreshAdvancedFilterValues'
]

function getColumns($table: any) {
  const columns = $table.getFullColumns?.() ?? $table.getColumns?.() ?? []
  return Array.isArray(columns) ? columns : []
}

function getColumn($table: any, field?: string) {
  if (!field) return undefined
  return $table.getColumnByField?.(field) ?? getColumns($table).find(
    (column: any) => column?.field === field
  )
}

function getOption(column: any) {
  return Array.isArray(column?.filters)
    ? column.filters.find((option: any) => option?.value === ADVANCED_FILTER_OPTION_VALUE) ??
      column.filters[0]
    : undefined
}

function readColumnState(column: any): AdvancedFilterState {
  const option = getOption(column)
  const dataType = inferColumnAdvancedFilterDataType(column ?? {})
  return normalizeAdvancedFilterState(option?.data, dataType)
}

function createFilterOption(state: AdvancedFilterState) {
  return {
    label: '',
    value: ADVANCED_FILTER_OPTION_VALUE,
    data: cloneAdvancedFilterState(state),
    resetValue: createEmptyAdvancedFilterState(state.dataType),
    checked: isAdvancedFilterStateActive(state)
  }
}

function createTableMethods(
  $table: any,
  options: AdvancedFilterPluginOptions
) {
  const originalLoadColumn = typeof $table.loadColumn === 'function'
    ? $table.loadColumn.bind($table)
    : undefined

  return {
    loadColumn(columns: any[]) {
      const prepared = prepareAdvancedFilterColumns(
        columns ?? [],
        getAdvancedFilterRuntime($table, options),
        {
        $table,
        tableParams: $table.props?.params
        }
      )
      return originalLoadColumn ? originalLoadColumn(prepared) : Promise.resolve()
    },
    configureAdvancedFilter(nextOptions: AdvancedFilterPluginOptions = {}) {
      configureAdvancedFilterRuntime($table, nextOptions)
      return Promise.resolve()
    },
    openAdvancedFilter(field: string) {
      const column = getColumn($table, field)
      return column && isAdvancedFilterColumn(column)
        ? $table.openFilter?.(column) ?? Promise.resolve()
        : Promise.resolve()
    },
    getAdvancedFilterState(field?: string) {
      if (field) {
        const column = getColumn($table, field)
        return column && isAdvancedFilterColumn(column)
          ? cloneAdvancedFilterState(readColumnState(column))
          : undefined
      }
      return Object.fromEntries(
        getColumns($table)
          .filter(isAdvancedFilterColumn)
          .map((column: any) => [
            column.field,
            cloneAdvancedFilterState(readColumnState(column))
          ])
      )
    },
    setAdvancedFilterState(
      field: string,
      inputState: AdvancedFilterState,
      setOptions: SetAdvancedFilterStateOptions = {}
    ) {
      const column = getColumn($table, field)
      if (!column || !isAdvancedFilterColumn(column)) return Promise.resolve()
      const state = normalizeAdvancedFilterState(
        inputState,
        inferColumnAdvancedFilterDataType(column)
      )
      return $table.setFilter?.(
        column,
        [createFilterOption(state)],
        setOptions.apply !== false
      ) ?? Promise.resolve()
    },
    clearAdvancedFilter(field?: string) {
      if (field) {
        const column = getColumn($table, field)
        if (!column || !isAdvancedFilterColumn(column)) return Promise.resolve()
        return $table.clearFilter?.(column) ?? Promise.resolve()
      }
      return getColumns($table)
        .filter(isAdvancedFilterColumn)
        .reduce(
          (chain: Promise<unknown>, column: any) => chain.then(
            () => $table.clearFilter?.(column) ?? Promise.resolve()
          ),
          Promise.resolve()
        )
        .then(() => undefined)
    },
    isAdvancedFilterActive(field?: string) {
      if (field) {
        const column = getColumn($table, field)
        return Boolean(column && isAdvancedFilterStateActive(readColumnState(column)))
      }
      return getColumns($table).some(
        (column: any) => isAdvancedFilterColumn(column) &&
          isAdvancedFilterStateActive(readColumnState(column))
      )
    },
    refreshAdvancedFilterValues(field?: string) {
      invalidateAdvancedFilterValueOptions($table, field)
      return Promise.resolve()
    }
  }
}

export function registerAdvancedFilterHook(
  VxeUI: VxeUILike,
  options: AdvancedFilterPluginOptions = {}
) {
  if (!VxeUI.hooks) {
    throw new Error('[vxe-table-plugin-advanced-filter] VxeUI.hooks is required.')
  }
  if (!VxeUI.interceptor) {
    throw new Error('[vxe-table-plugin-advanced-filter] VxeUI.interceptor is required.')
  }

  VxeUI.hooks.add('advancedFilter', {
    setupTable($table: any) {
      bindAdvancedFilterRuntime($table, options)
      return createTableMethods($table, options)
    },
    setupGrid($grid: any) {
      return $grid.extendTableMethods
        ? $grid.extendTableMethods(injectedTableMethodKeys)
        : {}
    }
  })

  VxeUI.interceptor.add('mounted', ({ $table }) => {
    if (!$table) return
    const enable = () => enableAdvancedFilterColumns(
      $table,
      getAdvancedFilterRuntime($table, options)
    )
    void enable().then((changed) => {
      if (changed || getColumns($table).length) return
      return Promise.resolve().then(enable).then((retryChanged) => {
        if (retryChanged || getColumns($table).length) return
        return new Promise<void>((resolve) => {
          setTimeout(() => { void enable().finally(resolve) }, 0)
        })
      })
    })
  })

  VxeUI.interceptor.add('beforeUnmount', ({ $table }) => {
    if ($table) {
      disposeAdvancedFilterPanel($table)
      unbindAdvancedFilterRuntime($table)
    }
  })
}
