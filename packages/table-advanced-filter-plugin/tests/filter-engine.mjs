import assert from 'node:assert/strict'
import {
  advancedFilterValueKey,
  createEmptyAdvancedFilterState,
  inferAdvancedFilterDataType,
  isAdvancedFilterStateActive,
  isEmptyFilterValue,
  matchesAdvancedFilterCondition,
  matchesAdvancedFilterState,
  normalizeAdvancedFilterState
} from '../dist/index.js'

assert.equal(isEmptyFilterValue(null), true)
assert.equal(isEmptyFilterValue(undefined), true)
assert.equal(isEmptyFilterValue(''), true)
assert.equal(isEmptyFilterValue(0), false)
assert.equal(isEmptyFilterValue(false), false)
assert.equal(isEmptyFilterValue(' '), false)

assert.equal(advancedFilterValueKey(null), 'empty:')
assert.equal(advancedFilterValueKey(undefined), 'empty:')
assert.equal(advancedFilterValueKey(''), 'empty:')
assert.equal(advancedFilterValueKey(0), 'number:0')
assert.equal(advancedFilterValueKey(-0), 'number:-0')
assert.equal(advancedFilterValueKey(false), 'boolean:false')
assert.equal(
  advancedFilterValueKey({ b: 2, a: 1 }),
  advancedFilterValueKey({ a: 1, b: 2 }),
)

assert.equal(inferAdvancedFilterDataType([null, 0, 12]), 'number')
assert.equal(inferAdvancedFilterDataType([false, true]), 'boolean')
assert.equal(inferAdvancedFilterDataType(['2026-08-13', '2026-08-14']), 'date')
assert.equal(inferAdvancedFilterDataType(['12', '13']), 'text')
assert.equal(inferAdvancedFilterDataType([new Date('2026-08-13')]), 'date')

assert.equal(matchesAdvancedFilterCondition('Alpha Beta', {
  operator: 'contains', value: 'alpha'
}, 'text'), true)
assert.equal(matchesAdvancedFilterCondition('Alpha Beta', {
  operator: 'contains', value: 'alpha'
}, 'text', true), false)
assert.equal(matchesAdvancedFilterCondition('Alpha', {
  operator: 'startsWith', value: 'al'
}, 'text'), true)
assert.equal(matchesAdvancedFilterCondition('Alpha', {
  operator: 'endsWith', value: 'HA'
}, 'text'), true)
assert.equal(matchesAdvancedFilterCondition('', {
  operator: 'isEmpty'
}, 'text'), true)
assert.equal(matchesAdvancedFilterCondition(false, {
  operator: 'isNotEmpty'
}, 'boolean'), true)

assert.equal(matchesAdvancedFilterCondition(0, {
  operator: 'eq', value: '0'
}, 'number'), true)
assert.equal(matchesAdvancedFilterCondition(15, {
  operator: 'between', value: 20, value2: 10
}, 'number'), true)
assert.equal(matchesAdvancedFilterCondition(9, {
  operator: 'gte', value: 10
}, 'number'), false)
assert.equal(matchesAdvancedFilterCondition(null, {
  operator: 'eq', value: 0
}, 'number'), false)

assert.equal(matchesAdvancedFilterCondition('2026-08-14', {
  operator: 'gt', value: '2026-08-13'
}, 'date'), true)
assert.equal(matchesAdvancedFilterCondition('2026-08-14', {
  operator: 'between', value: '2026-08-15', value2: '2026-08-13'
}, 'date'), true)

assert.equal(matchesAdvancedFilterCondition(false, {
  operator: 'eq', value: 'false'
}, 'boolean'), true)
assert.equal(matchesAdvancedFilterCondition('unexpected', {
  operator: 'eq', value: 'false'
}, 'boolean'), false)
assert.equal(matchesAdvancedFilterCondition(undefined, {
  operator: 'eq', value: 'false'
}, 'boolean'), false)

const selectedAndCondition = {
  version: 1,
  dataType: 'text',
  selectedKeys: [advancedFilterValueKey('Alpha'), advancedFilterValueKey('Beta')],
  logic: 'and',
  conditions: [{ operator: 'startsWith', value: 'A' }]
}
assert.equal(matchesAdvancedFilterState('Alpha', selectedAndCondition), true)
assert.equal(matchesAdvancedFilterState('Beta', selectedAndCondition), false)
assert.equal(matchesAdvancedFilterState('Another', selectedAndCondition), true)
assert.equal(matchesAdvancedFilterState('Beta', {
  ...selectedAndCondition,
  conditions: []
}), true)
assert.equal(matchesAdvancedFilterState('Another', {
  ...selectedAndCondition,
  conditions: []
}), false)

const twoConditions = {
  version: 1,
  dataType: 'number',
  selectedKeys: null,
  logic: 'and',
  conditions: [
    { operator: 'gte', value: 10 },
    { operator: 'lte', value: 20 }
  ]
}
assert.equal(matchesAdvancedFilterState(15, twoConditions), true)
assert.equal(matchesAdvancedFilterState(25, twoConditions), false)
assert.equal(matchesAdvancedFilterState(25, { ...twoConditions, logic: 'or' }), true)

const normalized = normalizeAdvancedFilterState({
  dataType: 'bad',
  selectedKeys: ['string:a', 'string:a', 42],
  logic: 'bad',
  conditions: [
    { operator: 'contains', value: 'a' },
    { operator: 'invalid', value: 'b' },
    { operator: 'endsWith', value: 'z' },
    { operator: 'eq', value: 'ignored' }
  ]
}, 'text')
assert.equal(normalized.dataType, 'text')
assert.deepEqual(normalized.selectedKeys, ['string:a'])
assert.equal(normalized.logic, 'and')
assert.deepEqual(normalized.conditions.map((item) => item.operator), ['contains', 'endsWith'])

assert.equal(isAdvancedFilterStateActive(createEmptyAdvancedFilterState('text')), false)
assert.equal(isAdvancedFilterStateActive({
  ...createEmptyAdvancedFilterState('text'),
  selectedKeys: []
}), true)

console.log('Advanced filter engine tests passed.')
