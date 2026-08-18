import type {
  AdvancedFilterCondition,
  AdvancedFilterDataType,
  AdvancedFilterLogic,
  AdvancedFilterOperator,
  AdvancedFilterState
} from './types.js'

const operatorSet = new Set<AdvancedFilterOperator>([
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'startsWith',
  'endsWith',
  'contains',
  'notContains',
  'isEmpty',
  'isNotEmpty'
])

const dataTypeSet = new Set<AdvancedFilterDataType>([
  'auto',
  'text',
  'number',
  'date',
  'boolean'
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stableObjectValue(value: unknown, seen = new WeakSet<object>()): string {
  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) return '"[Circular]"'
    seen.add(value)
  }
  if (Array.isArray(value)) {
    const result = `[${value.map((item) => stableObjectValue(item, seen)).join(',')}]`
    seen.delete(value)
    return result
  }
  if (!isRecord(value)) return JSON.stringify(value) ?? String(value)
  const result = `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableObjectValue(value[key], seen)}`)
    .join(',')}}`
  seen.delete(value)
  return result
}

export function isEmptyFilterValue(value: unknown): boolean {
  return value === null || typeof value === 'undefined' || value === ''
}

export function advancedFilterValueKey(value: unknown): string {
  if (isEmptyFilterValue(value)) return 'empty:'
  if (value instanceof Date) return `date:${value.getTime()}`
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'number:NaN'
    if (Object.is(value, -0)) return 'number:-0'
    return `number:${value}`
  }
  if (typeof value === 'string') return `string:${value}`
  if (typeof value === 'boolean') return `boolean:${value}`
  if (typeof value === 'bigint') return `bigint:${String(value)}`
  return `object:${stableObjectValue(value)}`
}

export function createEmptyAdvancedFilterState(
  dataType: AdvancedFilterDataType = 'auto'
): AdvancedFilterState {
  return {
    version: 1,
    dataType,
    selectedKeys: null,
    logic: 'and',
    conditions: []
  }
}

function normalizeCondition(value: unknown): AdvancedFilterCondition | null {
  if (!isRecord(value) || !operatorSet.has(value.operator as AdvancedFilterOperator)) {
    return null
  }
  return {
    operator: value.operator as AdvancedFilterOperator,
    ...('value' in value ? { value: value.value } : {}),
    ...('value2' in value ? { value2: value.value2 } : {})
  }
}

export function normalizeAdvancedFilterState(
  value: unknown,
  fallbackDataType: AdvancedFilterDataType = 'auto'
): AdvancedFilterState {
  if (!isRecord(value)) return createEmptyAdvancedFilterState(fallbackDataType)
  const dataType = dataTypeSet.has(value.dataType as AdvancedFilterDataType)
    ? value.dataType as AdvancedFilterDataType
    : fallbackDataType
  const logic: AdvancedFilterLogic = value.logic === 'or' ? 'or' : 'and'
  const selectedKeys = value.selectedKeys === null
    ? null
    : Array.isArray(value.selectedKeys)
      ? [...new Set(value.selectedKeys.filter((item): item is string => typeof item === 'string'))]
      : null
  const conditions = Array.isArray(value.conditions)
    ? value.conditions.map(normalizeCondition).filter(
        (item): item is AdvancedFilterCondition => Boolean(item)
      ).slice(0, 2)
    : []
  return { version: 1, dataType, selectedKeys, logic, conditions }
}

export function cloneAdvancedFilterState(state: AdvancedFilterState): AdvancedFilterState {
  return {
    version: 1,
    dataType: state.dataType,
    selectedKeys: state.selectedKeys ? [...state.selectedKeys] : null,
    logic: state.logic,
    conditions: state.conditions.map((condition) => ({ ...condition }))
  }
}

export function isAdvancedFilterConditionComplete(
  condition: AdvancedFilterCondition
): boolean {
  if (condition.operator === 'isEmpty' || condition.operator === 'isNotEmpty') return true
  if (condition.operator === 'between') {
    return !isEmptyFilterValue(condition.value) && !isEmptyFilterValue(condition.value2)
  }
  return !isEmptyFilterValue(condition.value)
}

export function isAdvancedFilterStateActive(state: AdvancedFilterState): boolean {
  return state.selectedKeys !== null || state.conditions.some(isAdvancedFilterConditionComplete)
}

export function inferAdvancedFilterDataType(values: unknown[]): AdvancedFilterDataType {
  const populated = values.filter((item) => !isEmptyFilterValue(item))
  if (!populated.length) return 'text'
  if (populated.every((item) => typeof item === 'number')) return 'number'
  if (populated.every((item) => typeof item === 'boolean')) return 'boolean'
  if (populated.every((item) => item instanceof Date)) return 'date'
  if (populated.every((item) => typeof item === 'string' && (
    /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(item) &&
    Number.isFinite(new Date(item).getTime())
  ))) return 'date'
  return 'text'
}

function toComparableNumber(value: unknown, dataType: AdvancedFilterDataType): number {
  if (dataType === 'date') {
    if (value instanceof Date) return value.getTime()
    if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN
    const parsed = new Date(String(value)).getTime()
    return Number.isFinite(parsed) ? parsed : Number.NaN
  }
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : Number.NaN
}

function normalizeText(value: unknown, caseSensitive: boolean): string {
  const text = String(value ?? '')
  return caseSensitive ? text : text.toLocaleLowerCase()
}

function equalsValue(
  cellValue: unknown,
  operand: unknown,
  dataType: AdvancedFilterDataType,
  caseSensitive: boolean
): boolean {
  if (isEmptyFilterValue(cellValue) || isEmptyFilterValue(operand)) {
    return isEmptyFilterValue(cellValue) && isEmptyFilterValue(operand)
  }
  if (dataType === 'number' || dataType === 'date') {
    const left = toComparableNumber(cellValue, dataType)
    const right = toComparableNumber(operand, dataType)
    return Number.isFinite(left) && Number.isFinite(right) && left === right
  }
  if (dataType === 'boolean') {
    const toBoolean = (value: unknown): boolean | undefined => {
      if (value === true || value === 'true' || value === 1 || value === '1') return true
      if (value === false || value === 'false' || value === 0 || value === '0') return false
      return undefined
    }
    const left = toBoolean(cellValue)
    const right = toBoolean(operand)
    return typeof left === 'boolean' && typeof right === 'boolean' && left === right
  }
  return normalizeText(cellValue, caseSensitive) === normalizeText(operand, caseSensitive)
}

export function matchesAdvancedFilterCondition(
  cellValue: unknown,
  condition: AdvancedFilterCondition,
  dataType: AdvancedFilterDataType,
  caseSensitive = false
): boolean {
  const { operator, value, value2 } = condition
  if (operator === 'isEmpty') return isEmptyFilterValue(cellValue)
  if (operator === 'isNotEmpty') return !isEmptyFilterValue(cellValue)
  if (!isAdvancedFilterConditionComplete(condition)) return true

  if (operator === 'eq') return equalsValue(cellValue, value, dataType, caseSensitive)
  if (operator === 'ne') return !equalsValue(cellValue, value, dataType, caseSensitive)

  if (dataType === 'number' || dataType === 'date') {
    const left = toComparableNumber(cellValue, dataType)
    const right = toComparableNumber(value, dataType)
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false
    if (operator === 'gt') return left > right
    if (operator === 'gte') return left >= right
    if (operator === 'lt') return left < right
    if (operator === 'lte') return left <= right
    if (operator === 'between') {
      const end = toComparableNumber(value2, dataType)
      if (!Number.isFinite(end)) return false
      return left >= Math.min(right, end) && left <= Math.max(right, end)
    }
  }

  const leftText = normalizeText(cellValue, caseSensitive)
  const rightText = normalizeText(value, caseSensitive)
  if (operator === 'startsWith') return leftText.startsWith(rightText)
  if (operator === 'endsWith') return leftText.endsWith(rightText)
  if (operator === 'contains') return leftText.includes(rightText)
  if (operator === 'notContains') return !leftText.includes(rightText)
  if (operator === 'gt') return leftText > rightText
  if (operator === 'gte') return leftText >= rightText
  if (operator === 'lt') return leftText < rightText
  if (operator === 'lte') return leftText <= rightText
  if (operator === 'between') {
    const endText = normalizeText(value2, caseSensitive)
    return leftText >= (rightText < endText ? rightText : endText) &&
      leftText <= (rightText > endText ? rightText : endText)
  }
  return true
}

export function matchesAdvancedFilterState(
  cellValue: unknown,
  inputState: AdvancedFilterState,
  options: { caseSensitive?: boolean } = {}
): boolean {
  const state = normalizeAdvancedFilterState(inputState)
  const conditions = state.conditions.filter(isAdvancedFilterConditionComplete)
  if (!conditions.length) {
    return state.selectedKeys === null ||
      state.selectedKeys.includes(advancedFilterValueKey(cellValue))
  }
  const dataType = state.dataType === 'auto'
    ? inferAdvancedFilterDataType([cellValue, ...conditions.map((item) => item.value)])
    : state.dataType
  const matches = conditions.map((condition) => matchesAdvancedFilterCondition(
    cellValue,
    condition,
    dataType,
    options.caseSensitive === true
  ))
  return state.logic === 'or' ? matches.some(Boolean) : matches.every(Boolean)
}
