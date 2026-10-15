import assert from 'node:assert/strict'
import { createPrintFormula, getPrintFormulaSources } from '../src/print/formula.ts'
import { resolveTemplateString } from '../src/print/expression.ts'
import { applyPrintValueFormat, createPrintValueFormat, getPrintFormatVariables, getPrintValueFormat, getPrintValueFormats } from '../src/print/format.ts'
import { resolvePrintPreviewRows } from '../src/print/dataSource.ts'
import { PrintShapePreviewResolver } from '../src/print/shapePreviewStrategies.ts'

const source = { type: 'inline', detailField: 'items', detailTables: [
	{ field: 'items', label: '订单明细', columns: [{ field: 'group', title: '金额', children: [{ field: 'amount', title: '金额' }] }, { field: 'empty', title: '空值' }] },
], rows: [
	{ customer: 'A', total: 99, items: [{ amount: 10, nested: { price: 2 }, empty: null }, { amount: '20.5' }, { amount: -2 },
		{ amount: null }, { amount: '' }, { amount: ' ' }, { amount: 'bad' }, { amount: false }, { amount: Infinity }] },
	{ customer: 'B', items: [{ amount: 100 }] },
] }
const original = structuredClone(source)
const row = source.rows[0]
const tables = { items: { data: row.items.slice(0, 2), columns: [], rowCount: 2 } }
const context = { row, currentTable: tables, currentTables: tables, dataSource: source, index: 0, pageNo: 1, total: 2 }
const resolve = (text, ctx = context) => resolveTemplateString(text, ctx)
assert.equal(resolve('合计：{{TOTAL(items.amount) | fixed:2}} 元'), '合计：28.50 元')
assert.equal(resolve('{{MAX(items.amount)}}/{{MIN(items.amount)}}/{{AVERAGE(items.amount) | fixed:2}}'), '20.5/-2/9.50')
assert.equal(resolve('{{COUNT(items)}}/{{COUNT(items.amount)}}'), '9/3')
assert.equal(resolve('{{sum(items.amount)}}'), '28.5')
assert.equal(resolve('{{TOTAL(items.nested.price)}}'), '2')
assert.equal(resolve('{{TOTAL(items.amount, "page")}}'), '30.5')
assert.equal(resolve('{{COUNT(items, "page")}}'), '2')
assert.equal(resolve('{{TOTAL(items.amount, "all")}}'), '28.5')
assert.equal(resolveTemplateString('{{amount | number:2:group}}', { ...context, row: { amount: 12345.6 } }), '12,345.60')
assert.equal(resolveTemplateString('{{date | date:YYYY年MM月DD日}}', { ...context, row: { date: '2026-10-15T14:30:00' } }), '2026年10月15日')
assert.equal(createPrintValueFormat({ variable: 'amount', type: 'number', digits: 2, useGrouping: true }), '{{amount | number:2:group}}')
assert.equal(createPrintValueFormat({ variable: 'date', type: 'date', dateFormat: 'YYYY-MM-DD HH:mm:ss' }), '{{date | date:YYYY-MM-DD HH:mm:ss}}')
assert.throws(() => createPrintValueFormat({ variable: 'constructor', type: 'number' }), /变量/)
assert.equal(applyPrintValueFormat('金额：{{amount}}', 'amount', '{{amount | number:0}}'), '金额：{{amount | number:0}}')
assert.equal(applyPrintValueFormat('金额：{{amount | number:2}}', 'amount', '{{amount | number:0}}'), '金额：{{amount | number:0}}')
assert.equal(applyPrintValueFormat('金额：', 'amount', '{{amount | number:0}}'), '金额：{{amount | number:0}}')
assert.deepEqual(getPrintValueFormat('金额：{{amount | number:0}}'), { variable: 'amount', type: 'number', digits: 0, useGrouping: false, dateFormat: 'YYYY-MM-DD' })
assert.deepEqual(getPrintValueFormat('{{amount | number:2:group}}'), { variable: 'amount', type: 'number', digits: 2, useGrouping: true, dateFormat: 'YYYY-MM-DD' })
assert.deepEqual(getPrintValueFormat('{{orderDate | date:YYYY-MM-DD HH:mm}}'), { variable: 'orderDate', type: 'date', digits: 2, useGrouping: true, dateFormat: 'YYYY-MM-DD HH:mm' })
assert.equal(getPrintValueFormats('{{amount | number:0}}{{orderDate | date:YYYY/MM/DD}}').length, 2)
assert.equal(getPrintValueFormat('{{amount | number:0}}{{orderDate | date:YYYY/MM/DD}}', 'orderDate').dateFormat, 'YYYY/MM/DD')
assert.ok(getPrintFormatVariables(source, source.rows, '{{manualValue}}').some(item => item.value === 'manualValue'))
assert.ok(getPrintFormatVariables(source, source.rows, '').some(item => item.value === 'items.amount'))
assert.equal(resolve('{{total}}/{{pageNo}}/{{customer}}'), '99/1/A', 'Existing row fields must keep their priority')
assert.equal(resolve('{{MAX(items.empty) | fixed:2}}/{{AVERAGE(items.empty) | fixed:2}}'), '/')
for (const name of ['TOTAL', 'MAX', 'MIN', 'AVERAGE', 'COUNT']) {
	const empty = { ...context, row: { items: [] } }
	assert.equal(resolve(`{{${name}(items${name === 'COUNT' ? '' : '.amount'}) | fixed:2}}`, empty), ['TOTAL', 'COUNT'].includes(name) ? '0.00' : '')
}
assert.equal(resolve('{{TOTAL(items.amount)}}', { ...context, row: source.rows[1] }), '100', 'Do not aggregate across parent records')
assert.equal(resolve('{{TOTAL(items.amount)}}', { ...context, row: { amount: 10 }, record: row }), '28.5', 'Repeated list items retain the full parent record')
const pages = resolvePrintPreviewRows(source, source.rows, { mode: 'data', detailField: 'items' })
assert.equal(resolve('{{TOTAL(items.amount, "page")}}', { ...context, row: pages[1], currentTable: {}, currentTables: {} }), '20.5')
assert.equal(resolve('{{TOTAL(items.amount)}}', { ...context, row: pages[1] }), '28.5', 'Detail-mode preview must preserve the full detail array')
for (const [formula, reason] of [
	['UNKNOWN(items.amount)', /不支持公式函数/], ['TOTAL(missing.amount)', /明细源.*不存在/],
	['TOTAL(items.unknown)', /字段.*不存在/], ['TOTAL(items)', /需要选择/],
	['TOTAL(items.amount, "group")', /公式格式错误/], ['TOTAL(items.amount) + 1', /公式格式错误/],
	['TOTAL(items.constructor)', /无效/], ['TOTAL(items.amount, "page")', /没有本页数据/],
	['TOTAL(items.amount) | bogus', /格式化/], ['TOTAL(items.amount) | fixed:101', /小数位/],
]) {
	assert.throws(() => resolve(`{{${formula}}}`, { ...context, currentTable: {}, currentTables: {} }), reason)
}
assert.deepEqual(source, original, 'Evaluation leaves the data source unchanged')
assert.equal(createPrintFormula('TOTAL', 'items', 'amount', 'all', 2), '{{TOTAL(items.amount) | fixed:2}}')
assert.equal(createPrintFormula('COUNT', 'items', '', 'page'), '{{COUNT(items, "page")}}')
assert.throws(() => createPrintFormula('TOTAL', 'items', 'amount', 'all', -1), /小数位/)
assert.ok(getPrintFormulaSources(source, source.rows)[0].fields.some(item => item.field === 'nested.price'))
assert.equal(getPrintFormulaSources(source, [])[0].fields.find(item => item.field === 'amount').label, '金额')
const resolver = new PrintShapePreviewResolver()
const shape = { id: 'shape:formula', type: 'vue-text', props: { text: '总计：{{TOTAL(items.amount) | fixed:2}}' }, meta: {} }
assert.equal(resolver.resolve(shape, context).props.text, '总计：28.50')
assert.throws(() => resolver.resolve({ ...shape, props: { text: '{{TOTAL(items.missing)}}' } }, context), /节点 shape:formula.*TOTAL\(items.missing\).*不存在/)
assert.equal(resolveTemplateString('{{高级表达式}}/{{TOTAL(items.amount)}}', context, {
	namedExpressions: [{ name: '高级表达式', expressionSource: '(context) => context.row.customer + "-高级"' }],
}), 'A-高级/28.5')
console.log('Print formula grammar, aggregates, scopes, empty values and legacy expressions passed.')
