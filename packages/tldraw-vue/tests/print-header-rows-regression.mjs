import assert from 'node:assert/strict'
import {
	createInlinePrintDataSource, getPrintDataSourceFormModel,
	getPrintDataSourceDetailRows, getPrintDataSourceHeaderSchema,
} from '../src/editor/dataSourceForm.ts'

const header = { fields: [
	{ field: 'customer', label: '客户', component: 'vxe-input' },
	{ field: 'enabled', label: '启用', component: 'vxe-switch' },
], actions: [] }
const definition = {
	id: 'fixture', code: 'print-designer.datasource.fixture', name: 'Fixture', table_name: null, enabled: true,
	schema: { ...header, printDetail: [{ id: 'items', field: 'items', label: '明细', columns: [{ field: 'sku', title: '物料' }] }] },
}
const source = {
	type: 'inline', formCode: definition.code, detailField: 'items',
	rows: [
		{ customer: 'A', enabled: true, hiddenValue: 'keep-A', items: [{ sku: 'A-1' }] },
		{ customer: 'B', enabled: false, hiddenValue: 'keep-B', items: [{ sku: 'B-1' }, { sku: 'B-2' }] },
	],
}
const original = structuredClone(source)
assert.deepEqual(getPrintDataSourceFormModel(source, header, 1), { customer: 'B', enabled: false })
assert.deepEqual(getPrintDataSourceDetailRows(source, 'items', 1), source.rows[1].items)
const edited = createInlinePrintDataSource({ customer: 'B-updated', enabled: true }, definition, source, 1)
assert.deepEqual(edited.rows[0], source.rows[0], 'Editing one record must preserve other headers and their details')
assert.equal(edited.rows[1].customer, 'B-updated')
assert.equal(edited.rows[1].hiddenValue, 'keep-B')
assert.deepEqual(edited.rows[1].items, source.rows[1].items)
assert.deepEqual(source, original, 'Form conversion must leave the original source unchanged')
assert.deepEqual(createInlinePrintDataSource({ customer: 'A-updated' }, definition, source).rows[1], source.rows[1])
const legacySchema = { fields: [{ field: 'header', label: '表头', component: 'lc-sub-form', props: { schema: header } }], actions: [] }
assert.deepEqual(getPrintDataSourceFormModel({ type: 'inline', rows: [{ header: { customer: 'Legacy', enabled: true } }] }, getPrintDataSourceHeaderSchema(legacySchema)), { customer: 'Legacy', enabled: true })
const switched = createInlinePrintDataSource({ customer: 'New' }, { ...definition, code: 'print-designer.datasource.new' }, source)
assert.equal(switched.rows.length, 1)
assert.deepEqual(switched.rows[0].items, [])
console.log('Print header rows preserve record identity, nested details and legacy fields.')
