import { createEmptyAdvancedFilterState } from './filter-engine.js'
import {
  ADVANCED_FILTER_OPTION_VALUE,
  ADVANCED_FILTER_RENDERER,
  type AdvancedFilterColumnOptions,
  type AdvancedFilterDataType,
  type AdvancedFilterPluginOptions
} from './types.js'

const blockedColumnTypes = new Set(['seq', 'checkbox', 'radio', 'expand', 'html'])

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readColumnOptions(column: Record<string, any>): AdvancedFilterColumnOptions {
  const params = isRecord(column.params) ? column.params : {}
  const value = params.advancedFilter
  if (value === false) return { enabled: false }
  if (value === true) return { enabled: true }
  return isRecord(value) ? value as AdvancedFilterColumnOptions : {}
}

function readTableEnabled(params: unknown): boolean | undefined {
  if (!isRecord(params) || !('advancedFilter' in params)) return undefined
  const value = params.advancedFilter
  if (typeof value === 'boolean') return value
  if (isRecord(value) && typeof value.enabled === 'boolean') return value.enabled
  return true
}

export function inferColumnAdvancedFilterDataType(
  column: Record<string, any>,
  configured?: AdvancedFilterDataType
): AdvancedFilterDataType {
  if (configured && configured !== 'auto') return configured
  const params = isRecord(column.params) ? column.params : {}
  const metadata = isRecord(params.lowcodeField) ? params.lowcodeField : {}
  const formatter = isRecord(column.formatter) ? column.formatter : {}
  const editRender = isRecord(column.editRender) ? column.editRender : {}
  const renderProps = isRecord(editRender.props) ? editRender.props : {}
  const component = String(metadata.component ?? editRender.name ?? '').toLowerCase()
  const metadataType = String(
    metadata.dataType ?? metadata.valueType ?? metadata.type ?? ''
  ).toLowerCase()
  const formatterType = String(formatter.type ?? '').toLowerCase()
  const pickerType = String(renderProps.type ?? '').toLowerCase()

  if (
    component.includes('date') ||
    metadataType.includes('date') ||
    formatterType === 'date' ||
    formatterType === 'datetime'
  ) {
    return 'date'
  }
  if (
    component.includes('number') ||
    metadataType === 'number' ||
    metadataType === 'integer' ||
    metadataType === 'decimal' ||
    metadataType === 'currency' ||
    formatterType === 'number' ||
    formatterType === 'currency'
  ) return 'number'
  if (
    component.includes('switch') ||
    component.includes('boolean') ||
    metadataType === 'boolean' ||
    metadataType === 'bool'
  ) return 'boolean'
  if (pickerType === 'date' || pickerType === 'datetime') return 'date'
  return configured ?? 'auto'
}

function isEligibleColumn(column: Record<string, any>) {
  const field = typeof column.field === 'string' ? column.field.trim() : ''
  if (!field || blockedColumnTypes.has(String(column.type ?? ''))) return false
  const slots = isRecord(column.slots) ? column.slots : {}
  if (slots.default === 'actions') return false
  return true
}

function copyAdvancedFilterConfig(
  target: Record<string, any>,
  source: Record<string, any>
) {
  target.filterRender = source.filterRender
  target.filterMultiple = false
  target.sortable = source.sortable
}

function enhanceColumn(
  column: Record<string, any>,
  enabled: boolean
): Record<string, any> {
  const children = Array.isArray(column.children)
    ? column.children.map((child) => isRecord(child) ? enhanceColumn(child, enabled) : child)
    : undefined
  const next: Record<string, any> = children ? { ...column, children } : { ...column }
  const columnOptions = readColumnOptions(column)
  const columnEnabled = typeof columnOptions.enabled === 'boolean'
    ? columnOptions.enabled
    : enabled
  if (!columnEnabled || !isEligibleColumn(column)) return next

  const existingRenderer = isRecord(column.filterRender)
    ? String(column.filterRender.name ?? '')
    : ''
  if (existingRenderer && existingRenderer !== ADVANCED_FILTER_RENDERER) return next
  if (Array.isArray(column.filters) && existingRenderer !== ADVANCED_FILTER_RENDERER) return next

  const dataType = inferColumnAdvancedFilterDataType(column, columnOptions.dataType)
  const state = createEmptyAdvancedFilterState(dataType)
  const filters = Array.isArray(column.filters) && column.filters.length
    ? column.filters
    : [{
        label: '',
        value: ADVANCED_FILTER_OPTION_VALUE,
        data: state,
        resetValue: createEmptyAdvancedFilterState(dataType),
        checked: false
      }]
  return {
    ...next,
    sortable: typeof next.sortable === 'boolean' ? next.sortable : true,
    filters,
    filterMultiple: false,
    filterRender: {
      ...(isRecord(column.filterRender) ? column.filterRender : {}),
      name: ADVANCED_FILTER_RENDERER,
      props: {
        ...(isRecord(column.filterRender?.props) ? column.filterRender.props : {}),
        ...columnOptions,
        dataType
      }
    }
  }
}

export function prepareAdvancedFilterColumns(
  columns: any[],
  options: AdvancedFilterPluginOptions = {},
  context: { $table?: any; tableParams?: unknown } = {}
) {
  const tableEnabled = readTableEnabled(context.tableParams)
  const enabledByMethod = options.tableEnabledMethod
    ? options.tableEnabledMethod({ $table: context.$table })
    : undefined
  const enabled = typeof enabledByMethod === 'boolean'
    ? enabledByMethod
    : typeof tableEnabled === 'boolean'
      ? tableEnabled
      : options.autoEnable === true
  return columns.map((column) => isRecord(column) ? enhanceColumn(column, enabled) : column)
}

export function isAdvancedFilterColumn(column: unknown): boolean {
  return isRecord(column) &&
    isRecord(column.filterRender) &&
    column.filterRender.name === ADVANCED_FILTER_RENDERER
}

/** Enables declarative vxe-column instances that already exist at mount time. */
export async function enableAdvancedFilterColumns(
  $table: any,
  options: AdvancedFilterPluginOptions = {}
) {
  const columns = $table.getFullColumns?.() ?? $table.getColumns?.() ?? []
  if (!Array.isArray(columns) || !columns.length) return false

  const prepared = prepareAdvancedFilterColumns(columns, options, {
    $table,
    tableParams: $table.props?.params
  })
  let changed = false
  for (let index = 0; index < columns.length; index++) {
    const column = columns[index]
    const next = prepared[index]
    if (!isRecord(column) || !isRecord(next) || !isAdvancedFilterColumn(next)) continue
    if (isAdvancedFilterColumn(column)) continue

    copyAdvancedFilterConfig(column, next)
    if (typeof $table.setFilter === 'function') {
      column.filters = []
      await $table.setFilter(column, next.filters, false)
    } else {
      column.filters = next.filters
    }
    changed = true
  }
  if (changed) {
    await ($table.refreshColumn?.() ?? Promise.resolve())

    // refreshColumn can rebuild declarative VxeColumn instances. Reapply the
    // renderer to the current objects before the first header paint completes.
    const refreshedColumns = $table.getFullColumns?.() ?? $table.getColumns?.() ?? []
    if (Array.isArray(refreshedColumns)) {
      for (const column of refreshedColumns) {
        if (!isRecord(column) || isAdvancedFilterColumn(column)) continue
        const [next] = prepareAdvancedFilterColumns([column], options, {
          $table,
          tableParams: $table.props?.params
        })
        if (!isRecord(next) || !isAdvancedFilterColumn(next)) continue
        copyAdvancedFilterConfig(column, next)
        if (!Array.isArray(column.filters) || !column.filters.length) {
          column.filters = next.filters
        }
      }
    }
  }
  return changed
}
