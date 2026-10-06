import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  applyPrintNodeExpressionResult,
  compilePrintNodeExpressionSource,
  evaluatePrintNodeExpressionSource,
  getPrintNodeExpressionId,
} from '../src/print/nodeExpression.ts'
import { resolveTemplateString } from '../src/print/expression.ts'
import {
  createPrintExpressionConfig,
  ensurePrintExpressionsLoaded,
  getLoadedPrintExpressions,
  upsertLoadedPrintExpression,
} from '../src/print/expressions.ts'
import { PrintShapePreviewResolver } from '../src/print/shapePreviewStrategies.ts'

const context = {
  row: {
    customerName: 'Acme',
    amount: 12.345,
    items: [{ amount: 5 }, { amount: 7 }],
  },
  data: [],
  currentTable: { orderitem: { data: [{ materialCode: 'MAT-001' }, { materialCode: 'MAT-002' }], columns: [{ field: 'materialCode' }], rowCount: 2 } },
  currentTables: { orderitem: { data: [{ materialCode: 'MAT-001' }, { materialCode: 'MAT-002' }], columns: [{ field: 'materialCode' }], rowCount: 2 } },
  index: 0,
  pageNo: 1,
  total: 3,
}

assert.equal(
  evaluatePrintNodeExpressionSource('(context) => `${context.row.customerName} / ${context.pageNo}`', context),
  'Acme / 1',
)
assert.equal(
  resolveTemplateString('{{tableMaterials}}', context, {
    namedExpressions: [{
      name: 'tableMaterials',
      expressionSource: '(context) => context.currentTables.orderitem.data.map((row) => row.materialCode).join(",")',
    }],
  }),
  'MAT-001,MAT-002',
)
assert.deepEqual(
  evaluatePrintNodeExpressionSource('(context) => ({ text: Number(context.row.amount).toFixed(2) })', context),
  { text: '12.35' },
)
assert.deepEqual(
  applyPrintNodeExpressionResult({ text: 'old', color: 'black' }, { text: 'new' }),
  { text: 'new', color: 'black' },
)
assert.deepEqual(
  applyPrintNodeExpressionResult({ text: 'old' }, 42),
  { text: '42' },
)
assert.deepEqual(
  applyPrintNodeExpressionResult({ text: 'old' }, undefined),
  { text: 'old' },
)
assert.deepEqual(
  applyPrintNodeExpressionResult({ text: 'old', color: 'black' }, { text: undefined, color: 'red' }),
  { text: 'old', color: 'red' },
)
assert.deepEqual(
  applyPrintNodeExpressionResult({ geo: 'rectangle', w: 100 }, 'ellipse'),
  { geo: 'ellipse', w: 100 },
)
assert.throws(
  () => applyPrintNodeExpressionResult({ geo: 'rectangle' }, 'not-a-geo'),
  /无效图形/,
)
assert.throws(
  () => compilePrintNodeExpressionSource('context.row.customerName'),
  /函数语法错误|必须是函数/,
)
assert.throws(
  () => evaluatePrintNodeExpressionSource('async (context) => context.row.customerName', context),
  /不支持 async/,
)
assert.throws(
  () => applyPrintNodeExpressionResult({ text: 'old' }, { unknown: true }),
  /未知节点属性/,
)
assert.equal(getPrintNodeExpressionId({ meta: { printExpressionId: ' expression-id ' } }), 'expression-id')
assert.equal(getPrintNodeExpressionId({ meta: {} }), '')
assert.equal(
  resolveTemplateString('{{missingField}}', context, {
    namedExpressions: [
      {
        name: 'missingField',
        expressionSource: '(context) => `derived-${context.row.customerName}`',
      },
    ],
  }),
  'derived-Acme',
)
assert.equal(
  resolveTemplateString('{{amount}}', { ...context, row: { ...context.row, amount: undefined } }, {
    namedExpressions: [
      { name: 'amount', expressionSource: '(context) => context.row.items.length * 10' },
    ],
  }),
  '20',
)

// A missing name must preserve the existing missing-value behavior.
assert.equal(resolveTemplateString('{{unknown}}', context), '')
assert.equal(resolveTemplateString('{{unknown}}', context, { missingValue: 'keep' }), '{{unknown}}')
assert.equal(resolveTemplateString('{{unknown}}', context, {
  missingValue: (name) => `missing:${name}`,
}), 'missing:unknown')

const fallback = createPrintExpressionConfig([
  { name: 'value', expressionSource: '() => { throw new Error("must not run") }' },
])
for (const [value, expected] of [[0, '0'], [false, 'false'], ['', ''], [null, '']]) {
  assert.equal(resolveTemplateString('{{value}}', { ...context, row: { value } }, fallback), expected)
}
assert.equal(resolveTemplateString('{{detail.value}}', { ...context, row: { value: 0 } }, {
  namedExpressions: [{ name: 'detail.value', expressionSource: '() => 99' }],
}), '99')
assert.equal(resolveTemplateString('{{value}}', context, {
	resolvers: { value: () => 7 },
	namedExpressions: [{ name: 'value', expressionSource: '() => 6' }],
}), '6')
assert.equal(resolveTemplateString('{{value | fixed:2}}', context, {
  namedExpressions: [{ name: 'value', expressionSource: '(context) => context.row.amount' }],
}), '12.35')

const previewResolver = new PrintShapePreviewResolver()
const geometryExpressionShape = {
  id: 'shape:geometry-expression',
  type: 'vue-box',
  meta: { printExpression: '(context) => context.row.geo' },
  props: { geo: 'rectangle', w: 100, h: 40 },
}
assert.deepEqual(
  previewResolver.resolve(geometryExpressionShape, { ...context, row: { geo: 'star' } }),
  {
    id: geometryExpressionShape.id,
    type: geometryExpressionShape.type,
    props: { geo: 'star', w: 100, h: 40 },
  },
)
const geometryPropertyExpressionShape = {
  id: 'shape:geometry-property-expression',
  type: 'vue-box',
  meta: {},
  props: {
    geo: 'rectangle',
    expression: `(context) => {
      const test = context.row.test
      return test === 1 ? 'rectangle' : 'check-box'
    }`,
    w: 100,
    h: 40,
  },
}
assert.deepEqual(
  previewResolver.resolve(geometryPropertyExpressionShape, { ...context, row: { test: 2 } }),
  {
    id: geometryPropertyExpressionShape.id,
    type: geometryPropertyExpressionShape.type,
    props: { ...geometryPropertyExpressionShape.props, geo: 'check-box' },
  },
)
const geometryTemplateShape = {
  id: 'shape:geometry-template',
  type: 'vue-box',
  meta: {},
  props: { geo: 'rectangle', text: '{{shapeGeo}}', w: 100, h: 40 },
}
assert.deepEqual(
  previewResolver.resolve(geometryTemplateShape, context, createPrintExpressionConfig([
    { name: 'shapeGeo', expressionSource: '() => "diamond"' },
  ])),
  {
    id: geometryTemplateShape.id,
    type: geometryTemplateShape.type,
    props: { geo: 'diamond', w: 100, h: 40 },
  },
)
const geometryGeoTemplateShape = {
  id: 'shape:geometry-geo-template',
  type: 'vue-box',
  meta: {},
  props: { geo: '{{shapeGeo}}', w: 100, h: 40 },
}
assert.deepEqual(
  previewResolver.resolve(geometryGeoTemplateShape, context, createPrintExpressionConfig([
    { name: 'shapeGeo', expressionSource: '() => "ellipse"' },
  ])),
  {
    id: geometryGeoTemplateShape.id,
    type: geometryGeoTemplateShape.type,
    props: { geo: 'ellipse', w: 100, h: 40 },
  },
)
assert.equal(resolveTemplateString('{{summary}}', {
  ...context, data: [{ amount: 2 }, { amount: 4 }], dataSource: { type: 'inline', rows: [] },
}, {
  namedExpressions: [{ name: 'summary', expressionSource: `(context) => [
    context.data.reduce((sum, row) => sum + row.amount, 0),
    context.dataSource.type, context.index, context.pageNo, context.total,
    context.row.customerName
  ].join('/')` }],
}), '6/inline/0/1/3/Acme')
assert.equal(resolveTemplateString('{{value}}', context, {
  namedExpressions: [
    { name: 'value', enabled: false, expressionSource: '() => 1' },
    { name: 'value', expressionSource: '() => 2' },
  ],
}), '2')
assert.equal(resolveTemplateString('{{value}}', context, {
  missingValue: 'keep',
  namedExpressions: [{ name: 'value', enabled: false, expressionSource: '() => 1' }],
}), '{{value}}')
assert.equal(resolveTemplateString('{{value}}', context, {
  missingValue: 'keep',
  namedExpressions: [{ name: 'value', expressionSource: '() => undefined' }],
}), '{{value}}')
assert.equal(resolveTemplateString('{{Value}}', context, {
  namedExpressions: [{ name: 'value', expressionSource: '() => 1' }],
}), '')
assert.equal(resolveTemplateString('第{{current_page}}页', context, {
  namedExpressions: [{ name: '当前页面', code: 'current_page', expressionSource: '(context) => context.pageNo' }],
}), '第1页')
assert.equal(resolveTemplateString('第{{当前页面}}页', context, {
  namedExpressions: [{ name: '当前页面', code: 'current_page', expressionSource: '(context) => context.pageNo' }],
}), '第1页')
assert.equal(resolveTemplateString('{{current_page}}', { ...context, row: { current_page: 8 } }, {
  namedExpressions: [{ name: '当前页面', code: 'current_page', expressionSource: '() => 99' }],
}), '8')
assert.equal(resolveTemplateString('{{toString}}', context, {
  namedExpressions: [{ name: 'toString', expressionSource: '() => "literal-expression"' }],
}), 'literal-expression')
for (const source of ['() => { throw new Error("bad data") }', '123', 'async () => 1']) {
  assert.throws(() => resolveTemplateString('{{错误表达式}}', context, {
    namedExpressions: [{ name: '错误表达式', expressionSource: source }],
  }), /表达式“错误表达式”执行失败/)
}

// Read every page, share concurrent requests, and cache only complete loads.
const databaseRows = Array.from({ length: 1001 }, (_, index) => ({
  id: `id-${index}`, name: `field-${index}`, expression_source: `() => ${index}`,
  enabled: index !== 0,
}))
const requests = []
const service = {
  async invoke(name, action, payload) {
    assert.equal(name, 'admin')
    assert.equal(action, 'listItems')
    assert.equal(payload.resource, 'print_expressions')
    requests.push(payload)
    const rows = databaseRows.slice(payload.offset, payload.offset + payload.limit)
    return payload.offset === 500 ? { rows } : rows
  },
}
const [loaded, concurrent] = await Promise.all([
  ensurePrintExpressionsLoaded(service), ensurePrintExpressionsLoaded(service),
])
assert.strictEqual(loaded, concurrent)
assert.equal(loaded.length, 1001)
assert.deepEqual(requests.map((request) => request.offset), [0, 500, 1000])
assert.equal(loaded[0].enabled, false)
assert.equal(resolveTemplateString('{{field-1000}}', context, createPrintExpressionConfig(loaded)), '1000')
await ensurePrintExpressionsLoaded(service)
assert.equal(requests.length, 3)
upsertLoadedPrintExpression(service, { ...loaded[1], name: 'renamed', expressionSource: '() => 42' })
assert.equal(resolveTemplateString('{{renamed}}', context,
  createPrintExpressionConfig(getLoadedPrintExpressions(service))), '42')
assert.equal(getLoadedPrintExpressions(service).length, 1001)
databaseRows[1].name = 'external-edit'
await ensurePrintExpressionsLoaded(service, { refresh: true })
assert.equal(requests.length, 6)
assert.equal(getLoadedPrintExpressions(service)[1].name, 'external-edit')

let attempts = 0
const retryService = {
  async invoke() {
    if (++attempts === 1) throw new Error('network error')
    return []
  },
}
assert.equal(getLoadedPrintExpressions(retryService).length, 0)
await assert.rejects(ensurePrintExpressionsLoaded(retryService), /network error/)
assert.deepEqual(await ensurePrintExpressionsLoaded(retryService), [])
assert.equal(attempts, 2)
const malformedService = { async invoke() { return { error: 'bad response' } } }
await assert.rejects(ensurePrintExpressionsLoaded(malformedService), /返回格式错误/)

let releaseLoad
const racingService = { invoke() { return new Promise((resolve) => { releaseLoad = resolve }) } }
const racingLoad = ensurePrintExpressionsLoaded(racingService)
upsertLoadedPrintExpression(racingService, {
  id: 'race', name: 'race', expressionSource: '() => 20', enabled: true,
})
releaseLoad([{ id: 'race', name: 'race', expression_source: '() => 10' }])
assert.equal((await racingLoad)[0].expressionSource, '() => 20')
assert.equal(getLoadedPrintExpressions(service).length, 1001, 'different hosts must have separate registries')

const migration = await readFile(
  new URL('../../../supabase/migrations/20261003100000_print_expressions.sql', import.meta.url),
  'utf8',
)
const detailMigration = await readFile(
  new URL('../../../supabase/migrations/20261003110000_print_expression_details.sql', import.meta.url),
  'utf8',
)
const codeMigration = await readFile(
  new URL('../../../supabase/migrations/20261004100000_print_expression_code.sql', import.meta.url),
  'utf8',
)
const dialogSource = await readFile(
  new URL('../src/components/VueExpressionEditorDialog.vue', import.meta.url),
  'utf8',
)
const topMenuSource = await readFile(
  new URL('../src/components/VueTopLeftMenu.vue', import.meta.url),
  'utf8',
)
const expressionRegistrySource = await readFile(
  new URL('../src/print/expressions.ts', import.meta.url),
  'utf8',
)
const shapePreviewSource = await readFile(
  new URL('../src/print/shapePreviewStrategies.ts', import.meta.url),
  'utf8',
)
assert.match(migration, /create table if not exists public\.print_expressions/)
assert.match(migration, /expression_source text not null/)
const tableDefinition = migration.match(/create table if not exists public\.print_expressions \(([\s\S]*?)\n\);/)?.[1] ?? ''
assert.doesNotMatch(tableDefinition, /^\s*version\s+/m)
for (const field of ['name', 'description', 'purpose', 'template_id', 'template_type', 'expression_source']) {
  assert.match(tableDefinition, new RegExp(`^\\s*${field}\\s+`, 'm'))
}
assert.match(migration, /'admin',\s*'print_expressions',\s*'print_expressions'/)
assert.match(detailMigration, /add column if not exists description text/)
assert.match(detailMigration, /add column if not exists template_id uuid references public\.print_templates\(id\) on delete set null/)
assert.match(codeMigration, /add column if not exists code text/)
assert.match(codeMigration, /unique index if not exists uq_print_expressions_code/)
assert.match(dialogSource, /resource: 'print_expressions'/)
assert.match(dialogSource, /expression_source: expression/)
assert.match(dialogSource, /code: expressionCode\.value\.trim\(\) \|\| null/)
assert.match(dialogSource, /template_id: templateId\.value \|\| null/)
assert.match(dialogSource, /template_type: templateType\.value \|\| null/)
assert.doesNotMatch(dialogSource, /PRINT_NODE_EXPRESSION_ID_META_KEY/)
assert.match(topMenuSource, /ensurePrintExpressionsLoaded\(host\.getServiceApi\(\), \{ refresh: true \}\)/)
assert.match(topMenuSource, /createPrintJobConfig\(createPrintExpressionConfig\(expressions\)\)/)
assert.doesNotMatch(topMenuSource, /getLoadedPrintExpressions/)
assert.match(expressionRegistrySource, /resource: 'print_expressions'/)
assert.match(expressionRegistrySource, /expressionSource/)
assert.match(expressionRegistrySource, /code: readString\(row\.code\)/)
assert.match(shapePreviewSource, /getPrintNodeExpression|evaluatePrintNodeExpression/)
assert.match(dialogSource, /expression-dialog__library/)
assert.match(dialogSource, /<vxe-modal/)
assert.match(dialogSource, /class-name="expression-editor-modal"/)
assert.match(dialogSource, /<template #footer>/)
assert.doesNotMatch(dialogSource, /expression-dialog-layer/)
assert.match(dialogSource, /filteredExpressions/)
assert.match(dialogSource, /expression-dialog__preview/)
assert.match(dialogSource, /livePreview/)
assert.match(dialogSource, /resolveTemplateString\(templateText, sampleContext\.value/)
assert.match(dialogSource, /renderedText \?\? getPreviewTitle\(result\)/)
assert.match(dialogSource, /保存表达式/)
assert.doesNotMatch(dialogSource, /function unbindExpression\(\)/)

console.log('Print node expression regression checks passed.')
