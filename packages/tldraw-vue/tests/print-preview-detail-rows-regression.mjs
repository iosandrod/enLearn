import assert from 'node:assert/strict'
import { getPrintPreviewDetailRows, PRINT_HEADER_PREVIEW_SOURCE, resolvePrintPreviewRows } from '../src/print/dataSource.ts'
import { resolveTemplateString } from '../src/print/expression.ts'
import { PrintShapePreviewResolver } from '../src/print/shapePreviewStrategies.ts'

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

const detailSource = {
	type: 'inline', detailField: 'detail_1',
	detailTables: [{ field: 'detail_1' }, { field: 'detail_2' }],
	rows: [
		{ name: '表头 A', detail_1: [
			{ name: '明细 A1', price: 0, enabled: false, address: { city: '杭州' } },
			{ name: '明细 A2', price: 12.345, enabled: true },
		], detail_2: [{ name: '另一明细' }] },
		{ name: '表头 B', detail_1: [{ name: '明细 B1', price: null, enabled: false }] },
	],
}
const detailOriginal = structuredClone(detailSource)
function createContext(row, index, total) {
	return { row, index, pageNo: index + 1, total, currentTable: {}, currentTables: {} }
}
const detailPages = resolvePrintPreviewRows(detailSource, detailSource.rows, { mode: 'data', detailField: 'detail_1' })
assert.equal(detailPages.length, 3)
assert.deepEqual(detailPages.map((row, index) =>
	resolveTemplateString('{{name}} / {{detail_1.name}}', createContext(row, index, detailPages.length))
), ['表头 A / 明细 A1', '表头 A / 明细 A2', '表头 B / 明细 B1'])
const detailContext = createContext(detailPages[0], 0, 3)
assert.equal(resolveTemplateString('{{detail_1.address.city}}', detailContext), '杭州')
assert.equal(resolveTemplateString('{{detail_1.price}} / {{detail_1.enabled}}', detailContext), '0 / false')
assert.equal(resolveTemplateString('{{detail_1.price | fixed:2}}', createContext(detailPages[1], 1, 3)), '12.35')
assert.equal(resolveTemplateString('{{detail_1.price}}', createContext(detailPages[2], 2, 3)), '')
assert.equal(resolveTemplateString('{{detail_1[1].name}}', detailContext), '明细 A2', 'Explicit array indices remain available')
assert.equal(resolveTemplateString('{{detail_1 | json}}', detailContext), JSON.stringify(detailSource.rows[0].detail_1))
assert.equal(resolveTemplateString('{{detail_2.name}}', detailContext), '', 'An unrelated detail has no implicit current row')
assert.equal(resolveTemplateString('{{detail_1.missing}}', detailContext, { missingValue: 'keep' }), '{{detail_1.missing}}')
assert.equal(resolveTemplateString('{{detail_1.missing}}', detailContext, {
	namedExpressions: [{ name: 'detail_1.missing', expressionSource: '() => "fallback"' }],
}), 'fallback')
assert.strictEqual(detailPages[0].detail_1, detailSource.rows[0].detail_1, 'The detail array remains intact')
assert.strictEqual(getPrintPreviewDetailRows(detailPages[2]).detail_1, detailSource.rows[1].detail_1[0])
assert.deepEqual(detailSource, detailOriginal, 'Current-row bindings do not mutate source data')

const legacyPages = resolvePrintPreviewRows(detailSource, detailSource.rows)
assert.deepEqual(legacyPages.map((row, index) =>
	resolveTemplateString('{{detail_1.name}}', createContext(row, index, legacyPages.length))
), ['明细 A1', '明细 A2'])
const otherPages = resolvePrintPreviewRows(detailSource, detailSource.rows.slice(0, 1), { mode: 'data', detailField: 'detail_2' })
assert.equal(resolveTemplateString('{{detail_2.name}}', createContext(otherPages[0], 0, 1)), '另一明细')

const resolver = new PrintShapePreviewResolver()
const textNode = { id: 'shape:detail-name', type: 'vue-text', meta: {}, props: { text: '{{detail_1.name}}' } }
assert.equal(resolver.resolve(textNode, createContext(detailPages[1], 1, 3)).props.text, '明细 A2')
const richTextNode = { ...textNode, type: 'vue-rich-text', props: { content: '<p>{{detail_1.name}}</p>' } }
assert.equal(resolver.resolve(richTextNode, detailContext).props.content, '<p>明细 A1</p>')
const containerContext = { ...detailContext, row: { name: '列表当前项' }, currentDetailRows: { detail_1: { name: '列表当前项' } } }
assert.equal(resolver.resolve(textNode, containerContext).props.text, '列表当前项', 'Repeated list items override the outer detail row')

const headerOnlyPages = resolvePrintPreviewRows(detailSource, detailSource.rows, { mode: 'data', detailField: PRINT_HEADER_PREVIEW_SOURCE })
assert.equal(getPrintPreviewDetailRows(headerOnlyPages[0]), undefined)
assert.equal(resolveTemplateString('{{detail_1.name}}', createContext(headerOnlyPages[0], 0, 2)), '', 'Header-only preview has no current detail row')

console.log('print preview detail row regression checks passed')
