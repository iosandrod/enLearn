import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import TableSearchPanel, {
  compileTableSearchMatcher,
  findTableSearchMatches
} from '../dist/index.js'

const hooks = []
const interceptors = new Map()
const VxeUI = {
  hooks: {
    add(name, options) {
      hooks.push({ name, options })
    }
  },
  interceptor: {
    add(type, callback) {
      interceptors.set(type, callback)
    }
  }
}

TableSearchPanel.install(VxeUI, [{ defaultExpanded: true }])

assert.equal(hooks.length, 1)
assert.equal(hooks[0].name, 'tableSearchPanel')
assert.equal(typeof interceptors.get('mounted'), 'function')
assert.equal(typeof interceptors.get('beforeUnmount'), 'function')

const table = {}
Object.assign(table, hooks[0].options.setupTable(table))
assert.equal(typeof table.openTableSearchPanel, 'function')
assert.equal(typeof table.closeTableSearchPanel, 'function')
assert.equal(typeof table.toggleTableSearchPanel, 'function')
assert.equal(typeof table.isTableSearchPanelVisible, 'function')

await table.openTableSearchPanel()
assert.equal(table.isTableSearchPanelVisible(), true)
await table.closeTableSearchPanel()
assert.equal(table.isTableSearchPanelVisible(), false)

let extendedMethodKeys = []
const gridMethods = hooks[0].options.setupGrid({
  extendTableMethods(methodKeys) {
    extendedMethodKeys = methodKeys
    return Object.fromEntries(methodKeys.map((key) => [key, () => undefined]))
  }
})
assert.deepEqual(extendedMethodKeys, [
  'openTableSearchPanel',
  'closeTableSearchPanel',
  'toggleTableSearchPanel',
  'isTableSearchPanelVisible'
])
assert.equal(typeof gridMethods.openTableSearchPanel, 'function')

const containsMatcher = compileTableSearchMatcher('工序', {
  matchCase: false,
  wholeWord: false,
  regularExpression: false
})
assert.equal(containsMatcher.invalid, false)
assert.deepEqual(
  findTableSearchMatches('子工序 / 工序资源', containsMatcher.matcher),
  [{ index: 1, length: 2 }, { index: 6, length: 2 }]
)
const wholeWordMatcher = compileTableSearchMatcher('cat', {
  matchCase: false,
  wholeWord: true,
  regularExpression: false
})
assert.equal(findTableSearchMatches('cat catalog CAT', wholeWordMatcher.matcher).length, 2)
assert.equal(compileTableSearchMatcher('[', {
  matchCase: false,
  wholeWord: false,
  regularExpression: true
}).invalid, true)

interceptors.get('mounted')({ $table: table })
interceptors.get('beforeUnmount')({ $table: table })

const style = await readFile(new URL('../dist/style.css', import.meta.url), 'utf8')
assert.match(style, /var\(--vxe-ui-layout-background-color/)
assert.match(style, /var\(--vxe-ui-font-primary-color/)
assert.match(style, /var\(--vxe-ui-input-border-color/)
assert.match(style, /vxe-table-search-panel__filter-button/)
assert.match(style, /vxe-table-search-panel__highlight/)
assert.doesNotMatch(style, /background:\s*#252526/)

console.log('Table search panel plugin contract test passed.')
