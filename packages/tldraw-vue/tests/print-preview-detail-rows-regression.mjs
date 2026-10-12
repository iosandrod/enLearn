import assert from 'node:assert/strict'
import { PRINT_HEADER_PREVIEW_SOURCE, resolvePrintPreviewRows } from '../src/print/dataSource.ts'

const source = {
	type: 'inline',
	detailField: 'selectedItems',
	rows: [{
		customerName: '表单客户',
		sharedValue: '表单值',
		detail_a: [{ sku: 'ignored' }],
		selectedItems: [{ sku: 'A-1', sharedValue: '明细值' }, { sku: 'A-2' }],
	}],
	detailTables: [
		{ id: 'a', field: 'detail_a', label: '明细 A', columns: [] },
		{ id: 'selected', field: 'selectedItems', label: '明细 B', columns: [] },
	],
}

const previewRows = resolvePrintPreviewRows(source, source.rows)
assert.equal(previewRows?.length, 2)
assert.equal(previewRows?.[0].sku, 'A-1')
assert.equal(previewRows?.[0].customerName, '表单客户')
assert.equal(previewRows?.[0].sharedValue, '表单值')
assert.deepEqual(resolvePrintPreviewRows({ ...source, rows: [{ selectedItems: [] }] }, [{ selectedItems: [] }]), [{}])
assert.deepEqual(resolvePrintPreviewRows({ ...source, rows: [{ selectedItems: [{ value: 1 }] }] }, []), [{}])
assert.deepEqual(resolvePrintPreviewRows({ type: 'json', value: [] }, [{ value: 1 }]), [{ value: 1 }])

const dataModeRows = resolvePrintPreviewRows(source, source.rows, {
	mode: 'data',
	detailField: 'detail_a',
})
assert.equal(dataModeRows?.length, 1)
assert.equal(dataModeRows?.[0].sku, 'ignored')
assert.equal(dataModeRows?.[0].customerName, '表单客户')
assert.throws(
	() => resolvePrintPreviewRows(source, source.rows, { mode: 'data', detailField: 'removed_detail' }),
	/明细源已不存在/,
)
assert.throws(
	() => resolvePrintPreviewRows(source, source.rows, { mode: 'data' }),
	/选择明细源/,
)

const headerSource = {
	...source,
	rows: [source.rows[0], { customerName: '第二位客户', selectedItems: [{ sku: 'B-1' }] }],
}
const original = structuredClone(headerSource)
const headerPages = resolvePrintPreviewRows(headerSource, undefined, { mode: 'data', detailField: PRINT_HEADER_PREVIEW_SOURCE })
assert.deepEqual(headerPages, headerSource.rows)
assert.equal(headerPages.length, 2)
assert.equal(headerPages[0].selectedItems.length, 2)
assert.equal(headerPages[1].selectedItems[0].sku, 'B-1')
assert.equal(headerPages[0].sku, undefined, 'Nested details must not be flattened into header records')
assert.deepEqual(headerSource, original, 'Preview must leave the source unchanged')
assert.deepEqual(resolvePrintPreviewRows(headerSource, [], { mode: 'data', detailField: PRINT_HEADER_PREVIEW_SOURCE }), [])

console.log('print preview detail row regression checks passed')
