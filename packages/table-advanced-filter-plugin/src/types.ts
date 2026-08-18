export const ADVANCED_FILTER_RENDERER = 'EnAdvancedFilter'
export const ADVANCED_FILTER_OPTION_VALUE = '__enlearn_advanced_filter__'

export type AdvancedFilterDataType =
  | 'auto'
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'

export type AdvancedFilterLogic = 'and' | 'or'

export type AdvancedFilterOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'startsWith'
  | 'endsWith'
  | 'contains'
  | 'notContains'
  | 'isEmpty'
  | 'isNotEmpty'

export interface AdvancedFilterCondition {
  operator: AdvancedFilterOperator
  value?: unknown
  value2?: unknown
}

export interface AdvancedFilterState {
  version: 1
  dataType: AdvancedFilterDataType
  selectedKeys: string[] | null
  logic: AdvancedFilterLogic
  conditions: AdvancedFilterCondition[]
}

export interface AdvancedFilterColumnOptions {
  enabled?: boolean
  dataType?: AdvancedFilterDataType
  operators?: AdvancedFilterOperator[]
  sortable?: boolean
}

export interface AdvancedFilterTableOptions {
  enabled?: boolean
}

export interface AdvancedFilterText {
  sortAscending: string
  sortDescending: string
  clearSort: string
  freezeColumn: string
  cancelFreeze: string
  freezeLeft: string
  freezeRight: string
  clearFilter: string
  textFilter: string
  numberFilter: string
  dateFilter: string
  booleanFilter: string
  searchPlaceholder: string
  selectAll: string
  emptyValue: string
  apply: string
  reset: string
  cancel: string
  confirm: string
  customFilter: string
  and: string
  or: string
  noMatchingValues: string
  limitedValues: string
  conditionRequired: string
  addCondition: string
  removeCondition: string
  booleanTrue: string
  booleanFalse: string
  operators: Record<AdvancedFilterOperator, string>
}

export interface AdvancedFilterPluginOptions {
  /** Enable every eligible VXE column. Defaults to false so hosts can opt in per table. */
  autoEnable?: boolean
  caseSensitive?: boolean
  maxVisibleOptions?: number
  locale?: string
  emptyLabel?: string
  text?: Partial<Omit<AdvancedFilterText, 'operators'>> & {
    operators?: Partial<Record<AdvancedFilterOperator, string>>
  }
  tableEnabledMethod?: (params: { $table: any }) => boolean
}

export interface SetAdvancedFilterStateOptions {
  apply?: boolean
}

export interface VxeTableAdvancedFilterMethods {
  configureAdvancedFilter(options?: AdvancedFilterPluginOptions): Promise<void>
  openAdvancedFilter(field: string): Promise<void>
  getAdvancedFilterState(field?: string): AdvancedFilterState | Record<string, AdvancedFilterState> | undefined
  setAdvancedFilterState(
    field: string,
    state: AdvancedFilterState,
    options?: SetAdvancedFilterStateOptions
  ): Promise<void>
  clearAdvancedFilter(field?: string): Promise<void>
  isAdvancedFilterActive(field?: string): boolean
  refreshAdvancedFilterValues(field?: string): Promise<void>
}

export interface VxeUILike {
  hooks?: {
    add: (name: string, options: Record<string, any>) => void
  }
  renderer?: {
    add: (name: string, options: Record<string, any>) => void
  }
  interceptor?: {
    add: (type: string, callback: (params: any) => any) => void
  }
}
