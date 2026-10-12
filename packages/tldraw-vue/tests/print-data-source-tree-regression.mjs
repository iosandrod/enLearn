import assert from 'node:assert/strict'
import { buildPrintDataSourceTree } from '../src/editor/printDataSourceFields.ts'

const leafPaths = (nodes) => nodes.flatMap((node) => node.children ? leafPaths(node.children) : [node.path])
const schemaSource = {
  type: 'inline', rows: [], headerFields: [{ field: 'name', label: '姓名' }],
  detailTables: [{ field: 'items', label: '订单明细', columns: [
    { title: '商品', field: '', children: [{ field: 'code', title: '商品编码' }] },
    { field: 'amount', title: '数量' },
  ] }],
}
const schemaTree = buildPrintDataSourceTree(schemaSource)
assert.deepEqual(leafPaths(schemaTree), ['name', 'items.code', 'items.amount'])
assert.equal(schemaTree[0].children[0].label, '姓名')
assert.equal(schemaTree[1].label, '订单明细')

const rowsTree = buildPrintDataSourceTree({ ...schemaSource, rows: [
  { name: 'Alice', address: { city: 'Shanghai' }, items: [{ code: 'A', amount: 2 }], _private: 1 },
  { name: 'Bob', address: { zip: '200000' }, optional: null, items: [{ code: 'B', amount: 3, extra: 'x' }] },
] })
assert.deepEqual(leafPaths(rowsTree), ['name', 'address.city', 'address.zip', 'optional', 'items.code', 'items.amount', 'items.extra'])
assert.equal(rowsTree[0].children[0].label, '姓名')
assert.equal(leafPaths(rowsTree).filter((path) => path === 'items.code').length, 1)
assert.deepEqual(buildPrintDataSourceTree({ type: 'none' }), [])
assert.deepEqual(buildPrintDataSourceTree(undefined), [])
assert.deepEqual(leafPaths(buildPrintDataSourceTree({ type: 'inline', rows: [], detailField: 'lines', detailColumns: [{ field: 'name', title: '名称' }] })), ['lines.name'])
console.log('Print data source tree regression passed.')
