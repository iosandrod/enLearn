import assert from 'node:assert/strict'
import { resolvePrintPreviewRows } from '../src/print/dataSource.ts'

const source = {
	type: 'inline',
	detailField: 'selectedItems',
	rows: [{
		detail_a: [{ sku: 'ignored' }],
		selectedItems: [{ sku: 'A-1' }, { sku: 'A-2' }],
	}],
	detailTables: [
		{ id: 'a', field: 'detail_a', label: '明细 A', columns: [] },
		{ id: 'selected', field: 'selectedItems', label: '明细 B', columns: [] },
	],
}

assert.deepEqual(resolvePrintPreviewRows(source, source.rows), [
	{ sku: 'A-1' },
	{ sku: 'A-2' },
])
assert.deepEqual(resolvePrintPreviewRows({ ...source, rows: [{ selectedItems: [] }] }, [{ selectedItems: [] }]), [{}])
assert.deepEqual(resolvePrintPreviewRows({ ...source, rows: [{ selectedItems: [{ value: 1 }] }] }, []), [{}])
assert.deepEqual(resolvePrintPreviewRows({ type: 'json', value: [] }, [{ value: 1 }]), [{ value: 1 }])

console.log('print preview detail row regression checks passed')
