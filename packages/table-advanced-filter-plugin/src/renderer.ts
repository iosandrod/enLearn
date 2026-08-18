import { h, reactive, type VNode } from 'vue'
import {
  advancedFilterValueKey,
  cloneAdvancedFilterState,
  createEmptyAdvancedFilterState,
  inferAdvancedFilterDataType,
  isAdvancedFilterConditionComplete,
  isAdvancedFilterStateActive,
  isEmptyFilterValue,
  matchesAdvancedFilterState,
  normalizeAdvancedFilterState
} from './filter-engine.js'
import { inferColumnAdvancedFilterDataType } from './column-adapter.js'
import { getAdvancedFilterRuntime } from './runtime.js'
import {
  ADVANCED_FILTER_OPTION_VALUE,
  ADVANCED_FILTER_RENDERER,
  type AdvancedFilterCondition,
  type AdvancedFilterDataType,
  type AdvancedFilterOperator,
  type AdvancedFilterPluginOptions,
  type AdvancedFilterState,
  type VxeUILike
} from './types.js'

type FilterRenderParams = {
  $table: any
  $panel: any
  column: any
}

type ValueOption = {
  key: string
  value: unknown
  label: string
  searchText: string
}

type PanelDraft = {
  field: string
  active: boolean
  state: AdvancedFilterState
  search: string
  valueOptions: ValueOption[]
  valuesRevision: number
  hoverMenu: 'freeze' | 'filter' | ''
  submenuSide: 'left' | 'right'
  customVisible: boolean
  customState: AdvancedFilterState
  error: string
}

const panelDrafts = new WeakMap<object, Map<string, PanelDraft>>()

export function invalidateAdvancedFilterValueOptions($table: object, field?: string) {
  const drafts = panelDrafts.get($table)
  if (!drafts) return
  if (field) {
    const draft = drafts.get(field)
    if (draft) {
      draft.valueOptions = []
      draft.valuesRevision = 0
    }
    return
  }
  drafts.forEach((draft) => {
    draft.valueOptions = []
    draft.valuesRevision = 0
  })
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getColumnDataType(column: any): AdvancedFilterDataType {
  const filterRender = isRecord(column?.filterRender) ? column.filterRender : {}
  const props = isRecord(filterRender.props) ? filterRender.props : {}
  return inferColumnAdvancedFilterDataType(column ?? {}, props.dataType)
}

function getFilterOption(column: any) {
  return Array.isArray(column?.filters)
    ? column.filters.find((option: any) => option?.value === ADVANCED_FILTER_OPTION_VALUE) ??
      column.filters[0]
    : undefined
}

function getCommittedState(column: any): AdvancedFilterState {
  return normalizeAdvancedFilterState(getFilterOption(column)?.data, getColumnDataType(column))
}

function getTableRows($table: any): Record<string, unknown>[] {
  const rows = $table.getFullData?.() ?? $table.getData?.() ?? []
  return Array.isArray(rows) ? rows.filter(isRecord) : []
}

function readCellValue(row: Record<string, unknown>, field: string) {
  if (!field.includes('.')) return row[field]
  return field.split('.').reduce<unknown>((value, key) => {
    return isRecord(value) ? value[key] : undefined
  }, row)
}

function displayCellValue($table: any, row: Record<string, unknown>, column: any, emptyLabel: string) {
  const rawValue = readCellValue(row, String(column.field ?? ''))
  if (isEmptyFilterValue(rawValue)) return emptyLabel
  try {
    const label = $table.getCellLabel?.(row, column)
    if (!isEmptyFilterValue(label)) return String(label)
  } catch {
    // Fall back to the raw value when a user formatter throws for detached rows.
  }
  return String(rawValue)
}

function createValueOptions(
  $table: any,
  column: any,
  emptyLabel: string,
  locale: string
): ValueOption[] {
  const field = String(column.field ?? '')
  const values = new Map<string, ValueOption>()
  for (const row of getTableRows($table)) {
    const value = readCellValue(row, field)
    const key = advancedFilterValueKey(value)
    if (values.has(key)) continue
    const label = displayCellValue($table, row, column, emptyLabel)
    values.set(key, {
      key,
      value,
      label,
      searchText: label.toLocaleLowerCase(locale)
    })
  }
  return [...values.values()].sort((left, right) => {
    if (left.key === 'empty:') return right.key === 'empty:' ? 0 : 1
    if (right.key === 'empty:') return -1
    return left.label.localeCompare(right.label, locale, {
      numeric: true,
      sensitivity: 'base'
    })
  })
}

function getDraft(params: FilterRenderParams): PanelDraft {
  const { $table, column } = params
  let tableDrafts = panelDrafts.get($table)
  if (!tableDrafts) {
    tableDrafts = new Map()
    panelDrafts.set($table, tableDrafts)
  }
  const field = String(column.field ?? '')
  const committed = getCommittedState(column)
  let draft = tableDrafts.get(field)
  if (!draft) {
    draft = reactive<PanelDraft>({
      field,
      active: false,
      state: cloneAdvancedFilterState(committed),
      search: '',
      valueOptions: [],
      valuesRevision: 0,
      hoverMenu: '',
      submenuSide: 'right',
      customVisible: false,
      customState: cloneAdvancedFilterState(committed),
      error: ''
    })
    tableDrafts.set(field, draft)
  }
  const filterStore = $table.reactData?.filterStore
  const isVisible = Boolean(filterStore?.visible && filterStore.column === column)
  if (isVisible) {
    tableDrafts.forEach((candidate, candidateField) => {
      if (candidateField !== field) candidate.active = false
    })
  } else {
    draft.active = false
  }
  if (isVisible && !draft.active) {
    draft.active = true
    draft.state = cloneAdvancedFilterState(committed)
    draft.search = ''
    draft.valueOptions = []
    draft.valuesRevision = 0
    draft.hoverMenu = ''
    draft.submenuSide = 'right'
    draft.customVisible = false
    draft.customState = cloneAdvancedFilterState(committed)
    draft.error = ''
  }
  return draft
}

function refreshValueOptions(params: FilterRenderParams, draft: PanelDraft) {
  const runtime = getAdvancedFilterRuntime(params.$table)
  draft.valueOptions = createValueOptions(
    params.$table,
    params.column,
    runtime.emptyLabel,
    runtime.locale
  )
  draft.valuesRevision++
  if (draft.state.dataType === 'auto') {
    draft.state.dataType = inferAdvancedFilterDataType(
      draft.valueOptions.map((item) => item.value)
    )
  }
}

function ensureValueOptions(params: FilterRenderParams, draft: PanelDraft) {
  if (!draft.valueOptions.length || draft.valuesRevision === 0) {
    refreshValueOptions(params, draft)
  }
}

function visibleValueOptions(params: FilterRenderParams, draft: PanelDraft) {
  const runtime = getAdvancedFilterRuntime(params.$table)
  const search = runtime.caseSensitive
    ? draft.search
    : draft.search.toLocaleLowerCase(runtime.locale)
  const rows = search
    ? draft.valueOptions.filter((item) => {
        const candidate = runtime.caseSensitive ? item.label : item.searchText
        return candidate.includes(search)
      })
    : draft.valueOptions
  return rows.slice(0, runtime.maxVisibleOptions)
}

function selectedKeySet(draft: PanelDraft) {
  return draft.state.selectedKeys === null
    ? new Set(draft.valueOptions.map((item) => item.key))
    : new Set(draft.state.selectedKeys)
}

function applySelectedKeys(draft: PanelDraft, keys: Set<string>) {
  const allKeys = draft.valueOptions.map((item) => item.key)
  draft.state.selectedKeys = allKeys.length === keys.size &&
    allKeys.every((key) => keys.has(key))
    ? null
    : [...keys]
}

function toggleAllVisible(params: FilterRenderParams, draft: PanelDraft) {
  const rows = visibleValueOptions(params, draft)
  const keys = selectedKeySet(draft)
  const checked = rows.length > 0 && rows.every((item) => keys.has(item.key))
  rows.forEach((item) => checked ? keys.delete(item.key) : keys.add(item.key))
  applySelectedKeys(draft, keys)
}

function toggleValue(draft: PanelDraft, key: string) {
  const keys = selectedKeySet(draft)
  if (keys.has(key)) keys.delete(key)
  else keys.add(key)
  applySelectedKeys(draft, keys)
}

function commitDraft(params: FilterRenderParams, draft: PanelDraft, evnt: Event) {
  const option = getFilterOption(params.column)
  if (!option) return
  const nextState = cloneAdvancedFilterState(draft.state)
  option.data = nextState
  option._checked = isAdvancedFilterStateActive(nextState)
  params.$panel.confirmFilter(evnt)
}

function resetDraft(params: FilterRenderParams, draft: PanelDraft, evnt: Event) {
  draft.state = createEmptyAdvancedFilterState(getColumnDataType(params.column))
  draft.search = ''
  draft.customVisible = false
  draft.error = ''
  params.$panel.resetFilter(evnt)
}

function closePanel(params: FilterRenderParams) {
  params.$table.closeFilter?.()
}

function runMenuAction(
  params: FilterRenderParams,
  action: 'sortAsc' | 'sortDesc' | 'clearSort' | 'freezeLeft' | 'freezeRight' | 'cancelFreeze' | 'clearFilter',
  evnt: Event
) {
  const { $table, column } = params
  let result: unknown
  if (action === 'sortAsc' || action === 'sortDesc') {
    if (typeof column.sortable === 'undefined') column.sortable = true
    result = $table.setSortByEvent?.(evnt, {
      field: column.field,
      order: action === 'sortAsc' ? 'asc' : 'desc'
    })
  }
  if (action === 'clearSort') result = $table.clearSortByEvent?.(evnt, column)
  if (action === 'freezeLeft') result = $table.setColumnFixed?.(column, 'left')
  if (action === 'freezeRight') result = $table.setColumnFixed?.(column, 'right')
  if (action === 'cancelFreeze') result = $table.clearColumnFixed?.(column)
  if (action === 'clearFilter') result = $table.clearFilterByEvent?.(evnt, column)
  Promise.resolve(result).finally(() => closePanel(params))
}

function icon(className: string) {
  return h('i', { class: [className, 'vxe-advanced-filter__menu-icon'], 'aria-hidden': 'true' })
}

function menuRow(
  label: string,
  options: {
    icon?: string
    disabled?: boolean
    active?: boolean
    submenu?: boolean
    testId?: string
    onClick?: (evnt: MouseEvent) => void
    onMouseenter?: () => void
  } = {}
) {
  return h('button', {
    type: 'button',
    class: [
      'vxe-advanced-filter__menu-row',
      {
        'is--disabled': options.disabled,
        'is--active': options.active
      }
    ],
    disabled: options.disabled,
    'data-testid': options.testId,
    onClick: options.disabled ? undefined : options.onClick,
    onMouseenter: options.onMouseenter
  }, [
    options.icon ? icon(options.icon) : h('span', { class: 'vxe-advanced-filter__menu-icon' }),
    h('span', { class: 'vxe-advanced-filter__menu-label' }, label),
    options.submenu
      ? icon('ri-arrow-right-s-line vxe-advanced-filter__submenu-arrow')
      : h('span', { class: 'vxe-advanced-filter__submenu-arrow' })
  ])
}

function filterMenuLabel(dataType: AdvancedFilterDataType, params: FilterRenderParams) {
  const text = getAdvancedFilterRuntime(params.$table).text
  if (dataType === 'number') return text.numberFilter
  if (dataType === 'date') return text.dateFilter
  if (dataType === 'boolean') return text.booleanFilter
  return text.textFilter
}

function operatorsForType(dataType: AdvancedFilterDataType): AdvancedFilterOperator[] {
  if (dataType === 'number' || dataType === 'date') {
    return ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'isEmpty', 'isNotEmpty']
  }
  if (dataType === 'boolean') return ['eq', 'ne', 'isEmpty', 'isNotEmpty']
  return ['eq', 'ne', 'startsWith', 'endsWith', 'contains', 'notContains', 'isEmpty', 'isNotEmpty']
}

function configuredOperators(params: FilterRenderParams, dataType: AdvancedFilterDataType) {
  const props = isRecord(params.column.filterRender?.props)
    ? params.column.filterRender.props
    : {}
  const operators: AdvancedFilterOperator[] = Array.isArray(props.operators)
    ? props.operators.filter((operator: unknown): operator is AdvancedFilterOperator => (
        typeof operator === 'string' && operatorsForType(dataType).includes(operator as AdvancedFilterOperator)
      ))
    : operatorsForType(dataType)
  return operators.length ? operators : operatorsForType(dataType)
}

function isSortDisabled(column: any) {
  const props = isRecord(column?.filterRender?.props) ? column.filterRender.props : {}
  return column?.sortable === false || props.sortable === false
}

function isHoverMenuTarget(
  menu: PanelDraft['hoverMenu'],
  target: EventTarget | null
) {
  if (!(target instanceof Element)) return false
  if (menu === 'freeze') {
    return Boolean(target.closest(
      '[data-testid="advanced-filter-freeze-menu"], .vxe-advanced-filter__freeze-submenu'
    ))
  }
  if (menu === 'filter') {
    return Boolean(target.closest(
      '[data-testid="advanced-filter-condition-menu"], .vxe-advanced-filter__operator-submenu'
    ))
  }
  return false
}

function renderFreezeSubmenu(params: FilterRenderParams) {
  const text = getAdvancedFilterRuntime(params.$table).text
  const fixed = params.column.fixed
  return h('div', {
    class: 'vxe-advanced-filter__submenu vxe-advanced-filter__freeze-submenu',
    role: 'menu'
  }, [
    menuRow(text.cancelFreeze, {
      icon: 'ri-close-line',
      disabled: !fixed,
      testId: 'advanced-filter-unfreeze',
      onClick: (evnt) => runMenuAction(params, 'cancelFreeze', evnt)
    }),
    h('div', { class: 'vxe-advanced-filter__divider' }),
    menuRow(text.freezeLeft, {
      icon: 'ri-layout-left-line',
      active: fixed === 'left',
      testId: 'advanced-filter-freeze-left',
      onClick: (evnt) => runMenuAction(params, 'freezeLeft', evnt)
    }),
    menuRow(text.freezeRight, {
      icon: 'ri-layout-right-line',
      active: fixed === 'right',
      testId: 'advanced-filter-freeze-right',
      onClick: (evnt) => runMenuAction(params, 'freezeRight', evnt)
    })
  ])
}

function openCustomFilter(params: FilterRenderParams, draft: PanelDraft) {
  draft.customState = cloneAdvancedFilterState(draft.state)
  if (!draft.customState.conditions.length) {
    draft.customState.conditions = [{ operator: 'contains', value: '' }]
  }
  draft.customVisible = true
  draft.hoverMenu = ''
  draft.error = ''
}

function renderFilterSubmenu(params: FilterRenderParams, draft: PanelDraft) {
  const runtime = getAdvancedFilterRuntime(params.$table)
  const operators = configuredOperators(params, draft.state.dataType)
  const rows: VNode[] = []
  operators.forEach((operator, index) => {
    if (index && ['isEmpty'].includes(operator)) {
      rows.push(h('div', { class: 'vxe-advanced-filter__divider' }))
    }
    rows.push(menuRow(runtime.text.operators[operator], {
      testId: `advanced-filter-operator-${operator}`,
      onClick: () => {
        draft.customState = cloneAdvancedFilterState(draft.state)
        draft.customState.conditions = [{ operator }]
        draft.customVisible = true
        draft.hoverMenu = ''
        draft.error = ''
      }
    }))
  })
  rows.push(h('div', { class: 'vxe-advanced-filter__divider' }))
  rows.push(menuRow(runtime.text.customFilter, {
    icon: 'ri-filter-3-line',
    testId: 'advanced-filter-custom',
    onClick: () => openCustomFilter(params, draft)
  }))
  return h('div', {
    class: 'vxe-advanced-filter__submenu vxe-advanced-filter__operator-submenu',
    role: 'menu'
  }, rows)
}

function renderSearch(params: FilterRenderParams, draft: PanelDraft) {
  const text = getAdvancedFilterRuntime(params.$table).text
  return h('label', { class: 'vxe-advanced-filter__search' }, [
    icon('ri-search-line'),
    h('input', {
      class: 'vxe-advanced-filter__search-input',
      value: draft.search,
      placeholder: text.searchPlaceholder,
      'aria-label': text.searchPlaceholder,
      'data-testid': 'advanced-filter-search',
      onInput: (evnt: Event) => {
        draft.search = (evnt.target as HTMLInputElement).value
      }
    }),
    draft.search
      ? h('button', {
          type: 'button',
          class: 'vxe-advanced-filter__clear-search',
          title: text.reset,
          onClick: () => { draft.search = '' }
        }, [icon('ri-close-line')])
      : null
  ])
}

function activeConditions(state: AdvancedFilterState) {
  return state.conditions.filter(isAdvancedFilterConditionComplete)
}

function displayConditionValue(
  value: unknown,
  dataType: AdvancedFilterDataType,
  params: FilterRenderParams
) {
  const text = getAdvancedFilterRuntime(params.$table).text
  if (dataType === 'boolean') {
    if (value === true || value === 'true' || value === 1 || value === '1') {
      return text.booleanTrue
    }
    if (value === false || value === 'false' || value === 0 || value === '0') {
      return text.booleanFalse
    }
  }
  return String(value ?? '')
}

function conditionSummaryText(
  condition: AdvancedFilterCondition,
  dataType: AdvancedFilterDataType,
  params: FilterRenderParams
) {
  const text = getAdvancedFilterRuntime(params.$table).text
  const operator = text.operators[condition.operator]
  if (!conditionNeedsValue(condition.operator)) return operator
  const value = displayConditionValue(condition.value, dataType, params)
  if (!conditionNeedsSecondValue(condition.operator)) return `${operator} ${value}`
  const value2 = displayConditionValue(condition.value2, dataType, params)
  return `${operator} ${value} - ${value2}`
}

function removeActiveCondition(draft: PanelDraft, index: number) {
  draft.state.conditions.splice(index, 1)
  if (draft.state.conditions.length < 2) draft.state.logic = 'and'
  draft.customState = cloneAdvancedFilterState(draft.state)
  draft.error = ''
}

function renderConditionSummary(params: FilterRenderParams, draft: PanelDraft) {
  const runtime = getAdvancedFilterRuntime(params.$table)
  const conditions = activeConditions(draft.state)
  if (!conditions.length) return null
  const rows: VNode[] = []
  conditions.forEach((condition, index) => {
    if (index) {
      rows.push(h('div', {
        class: 'vxe-advanced-filter__condition-summary-logic'
      }, draft.state.logic === 'or' ? runtime.text.or : runtime.text.and))
    }
    rows.push(h('div', {
      class: 'vxe-advanced-filter__condition-summary-row',
      'data-testid': 'advanced-filter-condition-item'
    }, [
      icon('ri-filter-3-line'),
      h('span', {
        class: 'vxe-advanced-filter__condition-summary-text',
        title: conditionSummaryText(condition, draft.state.dataType, params)
      }, conditionSummaryText(condition, draft.state.dataType, params)),
      h('button', {
        type: 'button',
        class: 'vxe-advanced-filter__condition-summary-action',
        title: runtime.text.customFilter,
        'aria-label': runtime.text.customFilter,
        'data-testid': 'advanced-filter-edit-condition',
        onClick: () => openCustomFilter(params, draft)
      }, [icon('ri-edit-line')]),
      h('button', {
        type: 'button',
        class: 'vxe-advanced-filter__condition-summary-action',
        title: runtime.text.removeCondition,
        'aria-label': runtime.text.removeCondition,
        'data-testid': 'advanced-filter-remove-condition',
        onClick: () => removeActiveCondition(draft, index)
      }, [icon('ri-close-line')])
    ]))
  })
  return h('div', {
    class: 'vxe-advanced-filter__condition-summary',
    'data-testid': 'advanced-filter-condition-list'
  }, rows)
}

function renderCheckbox(checked: boolean, indeterminate = false) {
  return h('span', {
    class: [
      'vxe-advanced-filter__checkbox-box',
      {
        'is--checked': checked,
        'is--indeterminate': indeterminate
      }
    ],
    'aria-hidden': 'true'
  }, [
    checked || indeterminate
      ? icon(indeterminate ? 'ri-subtract-line' : 'ri-check-line')
      : null
  ])
}

function renderValueList(params: FilterRenderParams, draft: PanelDraft) {
  const runtime = getAdvancedFilterRuntime(params.$table)
  const rows = visibleValueOptions(params, draft)
  const disabled = activeConditions(draft.state).length > 0
  const selected = selectedKeySet(draft)
  const allChecked = rows.length > 0 && rows.every((item) => selected.has(item.key))
  const someChecked = rows.some((item) => selected.has(item.key))
  const result: VNode[] = [
    h('button', {
      type: 'button',
      class: [
        'vxe-advanced-filter__check-row vxe-advanced-filter__check-all',
        { 'is--disabled': disabled }
      ],
      disabled,
      'data-testid': 'advanced-filter-select-all',
      onClick: disabled ? undefined : () => toggleAllVisible(params, draft)
    }, [
      renderCheckbox(allChecked, someChecked && !allChecked),
      h('span', { class: 'vxe-advanced-filter__value-label' }, runtime.text.selectAll)
    ])
  ]
  if (!rows.length) {
    result.push(h('div', { class: 'vxe-advanced-filter__empty' }, runtime.text.noMatchingValues))
  } else {
    rows.forEach((item) => {
      result.push(h('button', {
        type: 'button',
        class: ['vxe-advanced-filter__check-row', { 'is--disabled': disabled }],
        disabled,
        title: item.label,
        'data-value-key': item.key,
        onClick: disabled ? undefined : () => toggleValue(draft, item.key)
      }, [
        renderCheckbox(selected.has(item.key)),
        h('span', { class: 'vxe-advanced-filter__value-label' }, item.label)
      ]))
    })
  }
  const query = runtime.caseSensitive
    ? draft.search
    : draft.search.toLocaleLowerCase(runtime.locale)
  const matchingCount = query
    ? draft.valueOptions.filter((item) => {
        const candidate = runtime.caseSensitive ? item.label : item.searchText
        return candidate.includes(query)
      }).length
    : draft.valueOptions.length
  if (matchingCount > runtime.maxVisibleOptions) {
    result.push(h('div', { class: 'vxe-advanced-filter__limit-note' },
      runtime.text.limitedValues.replace('{0}', String(runtime.maxVisibleOptions))))
  }
  return h('div', {
    class: 'vxe-advanced-filter__values',
    role: 'group',
    'aria-label': runtime.text.selectAll
  }, result)
}

function renderFooter(params: FilterRenderParams, draft: PanelDraft) {
  const text = getAdvancedFilterRuntime(params.$table).text
  return h('div', { class: 'vxe-advanced-filter__footer' }, [
    h('button', {
      type: 'button',
      class: 'vxe-advanced-filter__button is--primary',
      'data-testid': 'advanced-filter-apply',
      onClick: (evnt: MouseEvent) => commitDraft(params, draft, evnt)
    }, text.apply),
    h('button', {
      type: 'button',
      class: 'vxe-advanced-filter__button',
      'data-testid': 'advanced-filter-reset',
      onClick: (evnt: MouseEvent) => resetDraft(params, draft, evnt)
    }, text.reset)
  ])
}

function conditionNeedsSecondValue(operator: AdvancedFilterOperator) {
  return operator === 'between'
}

function conditionNeedsValue(operator: AdvancedFilterOperator) {
  return operator !== 'isEmpty' && operator !== 'isNotEmpty'
}

function inputType(dataType: AdvancedFilterDataType) {
  if (dataType === 'number') return 'number'
  if (dataType === 'date') return 'date'
  return 'text'
}

function defaultOperator(dataType: AdvancedFilterDataType): AdvancedFilterOperator {
  if (dataType === 'text' || dataType === 'auto') return 'contains'
  return 'eq'
}

function renderConditionEditor(
  params: FilterRenderParams,
  draft: PanelDraft,
  condition: AdvancedFilterCondition,
  index: number
) {
  const runtime = getAdvancedFilterRuntime(params.$table)
  const operators = configuredOperators(params, draft.customState.dataType)
  const valueControl = conditionNeedsValue(condition.operator)
    ? draft.customState.dataType === 'boolean'
      ? h('select', {
          class: 'vxe-advanced-filter__condition-input',
          value: condition.value == null ? '' : String(condition.value),
          'data-testid': `advanced-filter-condition-${index + 1}`,
          onChange: (evnt: Event) => {
            condition.value = (evnt.target as HTMLSelectElement).value
          }
        }, [
          h('option', { value: '', disabled: true }, ''),
          h('option', { value: 'true' }, runtime.text.booleanTrue),
          h('option', { value: 'false' }, runtime.text.booleanFalse)
        ])
      : h('input', {
          class: 'vxe-advanced-filter__condition-input',
          type: inputType(draft.customState.dataType),
          value: condition.value == null ? '' : String(condition.value),
          'data-testid': `advanced-filter-condition-${index + 1}`,
          onInput: (evnt: Event) => {
            condition.value = (evnt.target as HTMLInputElement).value
          }
        })
    : null
  return h('div', { class: 'vxe-advanced-filter__condition' }, [
    h('select', {
      class: 'vxe-advanced-filter__condition-operator',
      value: condition.operator,
      'aria-label': runtime.text.customFilter,
      onChange: (evnt: Event) => {
        condition.operator = (evnt.target as HTMLSelectElement).value as AdvancedFilterOperator
        condition.value = undefined
        condition.value2 = undefined
      }
    }, operators.map((operator) => h('option', {
      value: operator
    }, runtime.text.operators[operator]))),
    valueControl,
    conditionNeedsSecondValue(condition.operator)
      ? h('input', {
          class: 'vxe-advanced-filter__condition-input',
          type: inputType(draft.customState.dataType),
          value: condition.value2 == null ? '' : String(condition.value2),
          'data-testid': `advanced-filter-condition-${index + 1}-end`,
          onInput: (evnt: Event) => {
            condition.value2 = (evnt.target as HTMLInputElement).value
          }
        })
      : null,
    index > 0
      ? h('button', {
          type: 'button',
          class: 'vxe-advanced-filter__remove-condition',
          title: runtime.text.removeCondition,
          'aria-label': runtime.text.removeCondition,
          onClick: () => {
            draft.customState.conditions.splice(index, 1)
            draft.error = ''
          }
        }, [icon('ri-delete-bin-line')])
      : null
  ])
}

function confirmCustomFilter(draft: PanelDraft) {
  const complete = draft.customState.conditions.every(isAdvancedFilterConditionComplete)
  if (!complete) {
    draft.error = 'condition'
    return
  }
  draft.state.logic = draft.customState.logic
  draft.state.conditions = draft.customState.conditions.map((condition) => ({ ...condition }))
  draft.state.selectedKeys = null
  draft.customVisible = false
  draft.error = ''
}

function renderCustomFilterDialog(params: FilterRenderParams, draft: PanelDraft) {
  if (!draft.customVisible) return null
  const text = getAdvancedFilterRuntime(params.$table).text
  const conditions = draft.customState.conditions
  if (!conditions.length) conditions.push({
    operator: defaultOperator(draft.customState.dataType),
    value: ''
  })
  return h('div', {
    class: 'vxe-advanced-filter__dialog-backdrop vxe-table--ignore-clear',
    onMousedown: (evnt: MouseEvent) => {
      if (evnt.target === evnt.currentTarget) draft.customVisible = false
    }
  }, [
    h('section', {
      class: 'vxe-advanced-filter__dialog',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': text.customFilter
    }, [
      h('header', { class: 'vxe-advanced-filter__dialog-header' }, [
        h('strong', text.customFilter),
        h('button', {
          type: 'button',
          class: 'vxe-advanced-filter__dialog-close',
          title: text.cancel,
          onClick: () => { draft.customVisible = false }
        }, [icon('ri-close-line')])
      ]),
      h('div', { class: 'vxe-advanced-filter__dialog-field' }, String(params.column.title ?? params.column.field ?? '')),
      renderConditionEditor(params, draft, conditions[0], 0),
      conditions.length > 1
        ? h('div', { class: 'vxe-advanced-filter__logic' }, [
            h('label', [
              h('input', {
                type: 'radio',
                name: `advanced-filter-logic-${params.column.id}`,
                checked: draft.customState.logic === 'and',
                onChange: () => { draft.customState.logic = 'and' }
              }),
              text.and
            ]),
            h('label', [
              h('input', {
                type: 'radio',
                name: `advanced-filter-logic-${params.column.id}`,
                checked: draft.customState.logic === 'or',
                onChange: () => { draft.customState.logic = 'or' }
              }),
              text.or
            ])
          ])
        : h('button', {
            type: 'button',
            class: 'vxe-advanced-filter__add-condition',
            onClick: () => {
              conditions.push({
                operator: defaultOperator(draft.customState.dataType),
                value: ''
              })
            }
          }, [icon('ri-add-line'), text.addCondition]),
      conditions.length > 1
        ? renderConditionEditor(params, draft, conditions[1], 1)
        : null,
      draft.error
        ? h('div', { class: 'vxe-advanced-filter__dialog-error' }, text.conditionRequired)
        : null,
      h('footer', { class: 'vxe-advanced-filter__dialog-footer' }, [
        h('button', {
          type: 'button',
          class: 'vxe-advanced-filter__button',
          onClick: () => { draft.customVisible = false }
        }, text.cancel),
        h('button', {
          type: 'button',
          class: 'vxe-advanced-filter__button is--primary',
          'data-testid': 'advanced-filter-custom-confirm',
          onClick: () => confirmCustomFilter(draft)
        }, text.confirm)
      ])
    ])
  ])
}

function renderPanel(_renderOpts: any, params: FilterRenderParams) {
  const { $table, column } = params
  const runtime = getAdvancedFilterRuntime($table)
  const draft = getDraft(params)
  ensureValueOptions(params, draft)
  const hasSort = Boolean(column.order)
  const hasFilter = isAdvancedFilterStateActive(getCommittedState(column))
  const dataType = draft.state.dataType === 'auto' ? 'text' : draft.state.dataType

  return h('div', {
    class: [
      'vxe-advanced-filter',
      'vxe-table--ignore-clear',
      { 'is--submenu-left': draft.submenuSide === 'left' }
    ],
    'data-field': column.field,
    onVnodeMounted: (vnode: VNode) => {
      const element = vnode.el as HTMLElement | null
      if (!element) return
      const rect = element.getBoundingClientRect()
      draft.submenuSide = rect.right + 194 > window.innerWidth - 8 && rect.left >= 194
        ? 'left'
        : 'right'
    },
    onVnodeUnmounted: () => {
      draft.active = false
      draft.hoverMenu = ''
      draft.customVisible = false
    },
    onMousemove: (evnt: MouseEvent) => {
      if (draft.hoverMenu && !isHoverMenuTarget(draft.hoverMenu, evnt.target)) {
        draft.hoverMenu = ''
      }
    },
    onMouseleave: () => { draft.hoverMenu = '' }
  }, [
    h('div', { class: 'vxe-advanced-filter__commands' }, [
      menuRow(runtime.text.sortAscending, {
        icon: 'ri-sort-asc',
        disabled: isSortDisabled(column),
        active: column.order === 'asc',
        testId: 'advanced-filter-sort-asc',
        onClick: (evnt) => runMenuAction(params, 'sortAsc', evnt),
        onMouseenter: () => { draft.hoverMenu = '' }
      }),
      menuRow(runtime.text.sortDescending, {
        icon: 'ri-sort-desc',
        disabled: isSortDisabled(column),
        active: column.order === 'desc',
        testId: 'advanced-filter-sort-desc',
        onClick: (evnt) => runMenuAction(params, 'sortDesc', evnt),
        onMouseenter: () => { draft.hoverMenu = '' }
      }),
      menuRow(runtime.text.clearSort, {
        icon: 'ri-sort-alphabet-asc',
        disabled: !hasSort,
        testId: 'advanced-filter-clear-sort',
        onClick: (evnt) => runMenuAction(params, 'clearSort', evnt),
        onMouseenter: () => { draft.hoverMenu = '' }
      }),
      h('div', { class: 'vxe-advanced-filter__divider' }),
      menuRow(runtime.text.freezeColumn, {
        icon: 'ri-pushpin-2-line',
        submenu: true,
        active: draft.hoverMenu === 'freeze',
        testId: 'advanced-filter-freeze-menu',
        onClick: () => { draft.hoverMenu = 'freeze' },
        onMouseenter: () => { draft.hoverMenu = 'freeze' }
      }),
      h('div', { class: 'vxe-advanced-filter__divider' }),
      menuRow(runtime.text.clearFilter, {
        icon: 'ri-filter-off-line',
        disabled: !hasFilter,
        testId: 'advanced-filter-clear-filter',
        onClick: (evnt) => runMenuAction(params, 'clearFilter', evnt),
        onMouseenter: () => { draft.hoverMenu = '' }
      }),
      menuRow(filterMenuLabel(dataType, params), {
        icon: 'ri-filter-3-line',
        submenu: true,
        active: draft.hoverMenu === 'filter',
        testId: 'advanced-filter-condition-menu',
        onClick: () => { draft.hoverMenu = 'filter' },
        onMouseenter: () => { draft.hoverMenu = 'filter' }
      })
    ]),
    h('div', { class: 'vxe-advanced-filter__divider is--full' }),
    renderConditionSummary(params, draft),
    renderSearch(params, draft),
    renderValueList(params, draft),
    renderFooter(params, draft),
    draft.hoverMenu === 'freeze' ? renderFreezeSubmenu(params) : null,
    draft.hoverMenu === 'filter' ? renderFilterSubmenu(params, draft) : null,
    renderCustomFilterDialog(params, draft)
  ])
}

function resetColumnFilter({ options, column }: { options: any[]; column: any }) {
  const dataType = getColumnDataType(column)
  options.forEach((option) => {
    option.data = createEmptyAdvancedFilterState(dataType)
    option.checked = false
    option._checked = false
  })
}

function recoverColumnFilter({ option, column }: { option: any; column: any }) {
  option.data = cloneAdvancedFilterState(getCommittedState(column))
}

export function registerAdvancedFilterRenderer(
  VxeUI: VxeUILike,
  options: AdvancedFilterPluginOptions = {}
) {
  if (!VxeUI.renderer) {
    throw new Error('[vxe-table-plugin-advanced-filter] VxeUI.renderer is required.')
  }
  VxeUI.renderer.add(ADVANCED_FILTER_RENDERER, {
    tableFilterClassName: 'vxe-advanced-filter-wrapper',
    showTableFilterFooter: false,
    tableFilterAutoHeight: false,
    createTableFilterOptions({ column }: any) {
      const dataType = getColumnDataType(column)
      return [{
        label: '',
        value: ADVANCED_FILTER_OPTION_VALUE,
        data: createEmptyAdvancedFilterState(dataType),
        resetValue: createEmptyAdvancedFilterState(dataType),
        checked: false
      }]
    },
    renderTableFilter: renderPanel,
    tableFilterMethod({ option, cellValue, $table }: any) {
      const runtime = getAdvancedFilterRuntime($table, options)
      return matchesAdvancedFilterState(
        cellValue,
        normalizeAdvancedFilterState(option.data),
        { caseSensitive: runtime.caseSensitive }
      )
    },
    tableFilterResetMethod: resetColumnFilter,
    tableFilterRecoverMethod: recoverColumnFilter
  })
}

export function disposeAdvancedFilterPanel($table: object) {
  panelDrafts.delete($table)
}
