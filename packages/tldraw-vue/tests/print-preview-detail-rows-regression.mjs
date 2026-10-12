import assert from 'node:assert/strict'
import { resolvePrintPreviewRows } from '../src/print/dataSource.ts'

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

console.log('print preview detail row regression checks passed')
