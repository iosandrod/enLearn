import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import AdvancedFilterPlugin, {
  ADVANCED_FILTER_OPTION_VALUE,
  ADVANCED_FILTER_RENDERER,
  createEmptyAdvancedFilterState,
  prepareAdvancedFilterColumns
} from '../dist/index.js'

const hooks = []
const renderers = new Map()
const interceptors = new Map()
const VxeUI = {
  hooks: {
    add(name, options) {
      hooks.push({ name, options })
    }
  },
  renderer: {
    add(name, options) {
      renderers.set(name, options)
    }
  },
  interceptor: {
    add(type, callback) {
      const callbacks = interceptors.get(type) ?? []
      callbacks.push(callback)
      interceptors.set(type, callbacks)
    }
  }
}

AdvancedFilterPlugin.install(VxeUI, [{ autoEnable: true, caseSensitive: false }])
AdvancedFilterPlugin.install(VxeUI, [{ autoEnable: true }])

assert.equal(hooks.length, 1)
assert.equal(hooks[0].name, 'advancedFilter')
assert.equal(renderers.has(ADVANCED_FILTER_RENDERER), true)
assert.equal(interceptors.get('mounted')?.length, 1)
assert.equal(interceptors.get('beforeUnmount')?.length, 1)

const prepared = prepareAdvancedFilterColumns([
  { type: 'seq', title: 'No.' },
  { field: 'name', title: 'Name' },
  { field: 'score', title: 'Score', params: { lowcodeField: { dataType: 'decimal' } } },
  { field: 'enabled', title: 'Enabled', editRender: { name: 'VxeSwitch' } },
  { field: 'manualSort', title: 'Manual sort', sortable: false },
  { field: 'disabled', title: 'Disabled', params: { advancedFilter: { enabled: false } } },
  { field: 'native', title: 'Native', filters: [{ label: 'A', value: 'a' }] },
  { field: 'custom', title: 'Custom', filterRender: { name: 'CustomFilter' } },
  { title: 'Actions', slots: { default: 'actions' } },
  {
    title: 'Group',
    children: [{ field: 'createdAt', title: 'Created', formatter: { type: 'date' } }]
  }
], { autoEnable: true })

assert.equal(prepared[0].filterRender, undefined)
assert.equal(prepared[1].filterRender.name, ADVANCED_FILTER_RENDERER)
assert.equal(prepared[1].sortable, true)
assert.equal(prepared[2].filterRender.props.dataType, 'number')
assert.equal(prepared[3].filterRender.props.dataType, 'boolean')
assert.equal(prepared[4].sortable, false)
assert.equal(prepared[5].filterRender, undefined)
assert.equal(prepared[6].filterRender, undefined)
assert.equal(prepared[7].filterRender.name, 'CustomFilter')
assert.equal(prepared[8].filterRender, undefined)
assert.equal(prepared[9].children[0].filterRender.props.dataType, 'date')

const columns = [
  { id: 'col_seq', type: 'seq', title: 'No.' },
  { id: 'col_name', field: 'name', title: 'Name' },
  { id: 'col_score', field: 'score', title: 'Score', params: { advancedFilter: { dataType: 'number' } } }
]
const tableCalls = {
  open: [],
  setFilter: [],
  clearFilter: [],
  refreshColumn: 0,
  loadColumn: []
}
let refreshRebuiltColumns = false
const table = {
  props: { params: { advancedFilter: true } },
  getFullColumns: () => columns,
  getColumnByField: (field) => columns.find((column) => column.field === field),
  openFilter(column) {
    tableCalls.open.push(column.field)
    return Promise.resolve()
  },
  setFilter(column, options, isUpdate) {
    column.filters = options.map((option) => ({ ...option, _checked: option.checked }))
    tableCalls.setFilter.push({ field: column.field, isUpdate })
    return Promise.resolve()
  },
  clearFilter(column) {
    column.filters?.forEach((option) => {
      option.checked = false
      option._checked = false
      option.data = createEmptyAdvancedFilterState(option.data?.dataType ?? 'auto')
    })
    tableCalls.clearFilter.push(column?.field)
    return Promise.resolve()
  },
  refreshColumn() {
    tableCalls.refreshColumn++
    if (refreshRebuiltColumns) {
      const rebuilt = columns.map((column) => {
        const { filterRender, filterMultiple, sortable, filters, ...rest } = column
        return rest
      })
      columns.splice(0, columns.length, ...rebuilt)
    }
    return Promise.resolve()
  },
  loadColumn(nextColumns) {
    tableCalls.loadColumn.push(nextColumns)
    return Promise.resolve()
  }
}

Object.assign(table, hooks[0].options.setupTable(table))
for (const callback of interceptors.get('mounted')) await callback({ $table: table })
await new Promise((resolve) => setTimeout(resolve, 0))

assert.equal(columns[0].filterRender, undefined)
assert.equal(columns[1].filterRender.name, ADVANCED_FILTER_RENDERER)
assert.equal(columns[2].filterRender.props.dataType, 'number')
assert.equal(columns[1].filters[0].value, ADVANCED_FILTER_OPTION_VALUE)
assert.equal(tableCalls.refreshColumn, 1)

const originalColumns = [...columns]
const rebuiltColumns = [
  { id: 'col_rebuilt_seq', type: 'seq', title: 'No.' },
  { id: 'col_rebuilt_name', field: 'name', title: 'Name' }
]
columns.splice(0, columns.length, ...rebuiltColumns)
refreshRebuiltColumns = true
for (const callback of interceptors.get('mounted')) await callback({ $table: table })
await new Promise((resolve) => setTimeout(resolve, 0))
refreshRebuiltColumns = false
assert.equal(columns[0].filterRender, undefined)
assert.equal(columns[1].filterRender.name, ADVANCED_FILTER_RENDERER)
columns.splice(0, columns.length, ...originalColumns)

await table.openAdvancedFilter('name')
await table.openAdvancedFilter('missing')
assert.deepEqual(tableCalls.open, ['name'])

const scoreState = {
  version: 1,
  dataType: 'number',
  selectedKeys: null,
  logic: 'and',
  conditions: [{ operator: 'gte', value: 80 }]
}
await table.setAdvancedFilterState('score', scoreState)
assert.equal(tableCalls.setFilter.at(-1).isUpdate, true)
assert.deepEqual(table.getAdvancedFilterState('score'), scoreState)
assert.equal(table.isAdvancedFilterActive('score'), true)
assert.equal(table.isAdvancedFilterActive(), true)

await table.clearAdvancedFilter('score')
assert.equal(table.isAdvancedFilterActive('score'), false)
assert.equal(table.getAdvancedFilterState('missing'), undefined)
assert.deepEqual(Object.keys(table.getAdvancedFilterState()).sort(), ['name', 'score'])

table.props.params = {}
await table.configureAdvancedFilter({ autoEnable: false })
await table.loadColumn([{ field: 'next', title: 'Next' }])
assert.equal(tableCalls.loadColumn.at(-1)[0].filterRender, undefined)
await table.configureAdvancedFilter({ autoEnable: true })
await table.loadColumn([{ field: 'next', title: 'Next' }])
assert.equal(tableCalls.loadColumn.at(-1)[0].filterRender.name, ADVANCED_FILTER_RENDERER)

let extendedKeys = []
const gridMethods = hooks[0].options.setupGrid({
  extendTableMethods(keys) {
    extendedKeys = keys
    return Object.fromEntries(keys.map((key) => [key, () => undefined]))
  }
})
assert.deepEqual(extendedKeys, [
  'configureAdvancedFilter',
  'openAdvancedFilter',
  'getAdvancedFilterState',
  'setAdvancedFilterState',
  'clearAdvancedFilter',
  'isAdvancedFilterActive',
  'refreshAdvancedFilterValues'
])
assert.equal(typeof gridMethods.openAdvancedFilter, 'function')

const renderer = renderers.get(ADVANCED_FILTER_RENDERER)
assert.equal(renderer.showTableFilterFooter, false)
assert.equal(renderer.tableFilterAutoHeight, false)
assert.equal(renderer.createTableFilterOptions({ column: columns[1] }).length, 1)
assert.equal(renderer.tableFilterMethod({
  $table: table,
  cellValue: 'Alpha',
  option: {
    data: {
      version: 1,
      dataType: 'text',
      selectedKeys: null,
      logic: 'and',
      conditions: [{ operator: 'contains', value: 'ph' }]
    }
  }
}), true)

await table.refreshAdvancedFilterValues('name')
for (const callback of interceptors.get('beforeUnmount')) callback({ $table: table })

const style = await readFile(new URL('../dist/style.css', import.meta.url), 'utf8')
assert.match(style, /vxe-advanced-filter__submenu/)
assert.match(style, /var\(--vxe-ui-font-primary-color/)
assert.match(style, /@media \(max-width: 560px\)/)
assert.doesNotMatch(style, /Unauthorized/i)

console.log('Advanced filter plugin contract tests passed.')
