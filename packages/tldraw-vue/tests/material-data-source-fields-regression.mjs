import assert from 'node:assert/strict'
import {
	getMaterialDataSourceFieldOptions,
	getMaterialDataSourceFieldOptionsKey,
} from '../src/editor/materialDataSourceFields.ts'
import { getPrintDataSourceDetailTables } from '../src/editor/dataSourceForm.ts'

assert.deepEqual(getMaterialDataSourceFieldOptions(undefined), [
	{ label: '未设置数据源', value: '' },
])

const sourceWithoutFormCode = {
	type: 'inline',
	rows: [{}],
	detailTables: [
		{ key: 'detail', title: '商品明细' },
	],
}
const initialOptions = getMaterialDataSourceFieldOptions(sourceWithoutFormCode)
assert.deepEqual(initialOptions, [
	{ label: '商品明细', value: 'detail' },
])

const changedOptions = getMaterialDataSourceFieldOptions({
	...sourceWithoutFormCode,
	detailTables: [
		{ key: 'detail', title: '物料明细' },
		{ key: 'packages', title: '包装明细' },
	],
})
assert.deepEqual(changedOptions, [
	{ label: '物料明细', value: 'detail' },
	{ label: '包装明细', value: 'packages' },
])
assert.notEqual(
	getMaterialDataSourceFieldOptionsKey(initialOptions),
	getMaterialDataSourceFieldOptionsKey(changedOptions),
	'明细表选项变化必须产生新的表单渲染 key',
)

assert.deepEqual(getMaterialDataSourceFieldOptions({
	type: 'inline',
	rows: [{}],
	detailTables: [{ id: 'legacy', field: 'legacyDetail', label: '旧版明细', columns: [] }],
}), [
	{ label: '旧版明细', value: 'legacyDetail' },
])

assert.deepEqual(getMaterialDataSourceFieldOptions({
	type: 'inline',
	rows: [{}],
	detailField: 'legacyDetail',
}), [
	{ label: 'legacyDetail', value: 'legacyDetail' },
])

assert.deepEqual(getMaterialDataSourceFieldOptions({
	type: 'inline',
	rows: [{ material: [{ value: 1 }] }],
}), [
	{ label: '未设置明细表', value: '' },
])

const detailOptions = getMaterialDataSourceFieldOptions({
	type: 'inline',
	rows: [{}],
	detailTables: [{ key: 'material', title: 'detail' }],
})
assert.deepEqual(detailOptions, [{ label: 'detail', value: 'material' }])

assert.deepEqual(getPrintDataSourceDetailTables({
	fields: [],
	actions: [],
	printDetail: [{
		key: 'orders',
		title: '订单明细',
		columns: [{ field: 'code', title: '编码' }],
	}],
}), [{
	id: 'orders',
	field: 'orders',
	label: '订单明细',
	columns: [{ field: 'code', title: '编码', width: 100 }],
}])

console.log('material data source field regression checks passed')
