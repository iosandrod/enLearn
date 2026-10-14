import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { webcrypto } from 'node:crypto'
import * as XLSX from 'xlsx'
import { analyzePrintDataSourceExcel } from '../src/editor/printDataSourceExcel.ts'
import * as dataSourceForm from '../src/editor/dataSourceForm.ts'

const require = createRequire(import.meta.url)
const vue = require('vue')
const ts = require('typescript')
const { parse, compileScript, compileTemplate } = require('vue/compiler-sfc')
const book = (...sheets) => {
  const workbook = XLSX.utils.book_new()
  for (const [name, matrix] of sheets) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), name)
  return workbook
}
const workbook = book(
  ['商品', [[], ['sku', 'qty', 'price'], ['编码', '数量', '单价'], ['001', 0, 3.5], ['', '', ''], ['002', 2, 4]]],
  ['客户', [['姓名', '电话'], ['张三', '00123']]],
  ['空表', []],
  ['标题在前', [['编码', '数量'], ['code', 'quantity'], ['A', 5]]],
)
const analyzed = analyzePrintDataSourceExcel(workbook)
assert.equal(analyzed.tables.length, 3)
assert.deepEqual(analyzed.tables[0].columns.map(({ field, title }) => [field, title]), [['sku', '编码'], ['qty', '数量'], ['price', '单价']])
assert.deepEqual(analyzed.model.detail_1, [{ sku: '001', qty: '0', price: '3.5' }, { sku: '002', qty: '2', price: '4' }])
assert.deepEqual(analyzed.tables[1].columns.map(({ field, title }) => [field, title]), [['field_1', '姓名'], ['field_2', '电话']])
assert.equal(analyzed.model.detail_2[0].field_2, '00123')
assert.deepEqual(analyzed.model.detail_4, [{ code: 'A', quantity: '5' }])
assert.deepEqual(analyzePrintDataSourceExcel(book(['无标题', [[1, 0], [2, 3]]])).model.detail_1, [{ field_1: '1', field_2: '0' }, { field_1: '2', field_2: '3' }])
assert.equal(analyzePrintDataSourceExcel(book(['英文', [['sku', 'qty'], ['A', 2]]])).model.detail_1.length, 1)
assert.equal(analyzePrintDataSourceExcel(book(['字符串数据', [['Alice', 'Shanghai'], ['Bob', 'Beijing']]]), { detail_1: 0 }).model.detail_1.length, 2)
const sparse = analyzePrintDataSourceExcel(book(['重复和空列', [['code', '', 'code', '__proto__', 'constructor', 'a.b'], ['A', 'keep', 'B', 'safe', 'safe2', 'C']]]))
assert.deepEqual(sparse.tables[0].columns.map(column => column.field), ['code', 'field_2', 'code_2', 'field_4', 'field_5', 'field_6'])
assert.equal(Object.getPrototypeOf(sparse.model.detail_1[0]), Object.prototype)
assert.equal(analyzePrintDataSourceExcel(book(['仅结构', [['code', 'qty']]])).model.detail_1.length, 0)
assert.throws(() => analyzePrintDataSourceExcel(book(['空', []])), /没有可生成/)

const source = await readFile(new URL('../src/components/VueDataSourcePanel.vue', import.meta.url), 'utf8')
const { descriptor, errors } = parse(source)
assert.deepEqual(errors, [])
const compiled = compileScript(descriptor, { id: 'excel-import-test' })
const template = compileTemplate({ source: descriptor.template.content, filename: 'VueDataSourcePanel.vue', id: 'excel-import-test', compilerOptions: { bindingMetadata: compiled.bindings } })
assert.deepEqual(template.errors, [])
assert.match(descriptor.template.content, /@click="handleImportExcelDataSource"/)

// Run the actual panel handlers with a service and dialog boundary, without mounting the canvas.
async function scenario(mode) {
  const oldTable = { id: 'old-detail', field: 'detail_1', label: '原有明细', columns: [{ field: 'old', title: '原字段' }] }
  const originalDefinition = {
    id: 'original-id', code: 'print-designer.datasource.original', name: '现有数据源', enabled: true, table_name: null,
    schema: { fields: [{ field: 'detail_2', label: '表头字段', component: 'vxe-input' }], printHeader: { dataSourceScript: 'header-script' }, printDetail: [oldTable] },
  }
  const original = { type: 'inline', formCode: originalDefinition.code, detailTables: [oldTable], rows: [
    { detail_2: '第一条表头', detail_1: [{ old: 'preserved-1' }] },
    { detail_2: '第二条表头', detail_1: [{ old: 'preserved-2' }] },
  ] }
  const noSource = mode === 'no-source' || mode === 'no-source-create'
  const workspace = vue.ref(original)
  if (noSource) workspace.value = { type: 'none' }
  const definitions = new Map([[originalDefinition.code, structuredClone(originalDefinition)]])
  const writes = []
  let dialogs = 0, refreshes = 0, picks = 0, confirmed = false
  let panel
  const readonly = vue.ref(false)
  const serviceApi = { invoke: async (service, method, payload) => {
    assert.equal(service, 'lowcode')
    if (method === 'listItems') return definitions.has(payload.filters.code) ? [definitions.get(payload.filters.code)] : []
    assert.equal(method, 'saveItem')
    writes.push(JSON.parse(JSON.stringify(payload)))
    if (mode === 'save-failure') throw new Error('保存失败测试')
    const previous = [...definitions.values()].find(value => value.id === payload.id)
    const definition = { id: 'saved-id', ...previous, ...JSON.parse(JSON.stringify(payload.data)) }
    definitions.set(definition.code, definition)
    return definition
  } }
  const openGlobalDialog = async config => {
    dialogs++
    assert.equal(picks, 0)
    assert.equal(writes.length, 0)
    const append = config.content[0].form.schema.fields.find(field => field.field === 'appendExisting')
    assert.equal(append.label, '追加现有明细')
    assert.equal(append.props.disabled, noSource)
    if (mode === 'cancel-dialog') return { action: 'cancel' }
    const values = { ...config.model, hasChineseRow: true, appendExisting: !['create', 'no-source-create'].includes(mode) }
    if (mode === 'no-source') {
      assert.throws(() => config.onConfirm({ model: values }), /没有当前数据源/)
      return { action: 'cancel' }
    }
    if (mode === 'readonly') {
      readonly.value = true
      assert.equal(await config.onConfirm({ model: values }), false)
      return { action: 'cancel' }
    }
    await config.onConfirm({ model: values })
    confirmed = true
    return { action: 'confirm', values }
  }
  const stubs = {
    'vue': { ...vue, onMounted() {}, onBeforeUnmount() {}, watch() {} },
    'xlsx': XLSX,
    '@enlearn/lowcode-framework/core/host': { useLowCodeHost: () => ({ getServiceApi: () => serviceApi }) },
    '@enlearn/lowcode-framework/runtime/global-dialog': { openGlobalDialog },
    '@enlearn/lowcode-framework/runtime': { lowCodeOptionSourceRegistry: { refresh: async () => { refreshes++ } } },
    '@enlearn/lowcode-framework/utils/vxe-message': { useVxeMessage() {} },
    '@/editor/dataSourceForm': dataSourceForm,
    '@/editor/printDataSourceExcel': { analyzePrintDataSourceExcel },
    '@/editor/workspaceDataSource': { getEditorPrintDataSource: () => workspace },
    '@/vue/useEditorValue': { useEditorValue: (_label, getter) => vue.computed(getter) },
  }
  const module = { exports: {} }
  const script = ts.transpileModule(descriptor.scriptSetup.content + '\nmodule.exports = { handleImportExcelDataSource, handleDataSourceExcelChange, dataSourceExcelInput, activeDefinition, headerRowIndex, definitionsLoading, dataSourceExcelBusy, dataSourceExcelError, activeDetailTableId };', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(script, {
    module, exports: module.exports, console, Error, crypto: webcrypto, structuredClone, setTimeout: () => 0, clearTimeout() {},
    defineProps: () => ({ editor: { getIsReadonly: () => readonly.value } }), withDefaults: value => value, defineEmits: () => () => {},
    require: path => stubs[path] ?? {},
  })
  panel = module.exports
  panel.definitionsLoading.value = false
  if (!noSource) panel.activeDefinition.value = structuredClone(originalDefinition)
  panel.headerRowIndex.value = 1
  panel.dataSourceExcelInput.value = { click() { assert.equal(confirmed, true); picks++ } }
  await panel.handleImportExcelDataSource()
  assert.equal(dialogs, 1)
  assert.equal(panel.dataSourceExcelError.value, '')
  assert.equal(picks, ['cancel-dialog', 'readonly', 'no-source'].includes(mode) ? 0 : 1)
  if (picks) {
    if (mode === 'switch-source') workspace.value = { ...original, formCode: 'changed' }
    const input = { value: 'file.xlsx', files: mode === 'cancel-file' ? [] : [{ name: '示例.xlsx', arrayBuffer: async () => {
      if (mode === 'switch-during-read') workspace.value = { ...original, formCode: 'changed' }
      if (mode === 'switch-row') panel.headerRowIndex.value = 0
      return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
    } }] }
    await panel.handleDataSourceExcelChange({ target: input })
    assert.equal(input.value, '')
  }
  assert.equal(panel.dataSourceExcelBusy.value, false)
  const plain = value => JSON.parse(JSON.stringify(value))
  if (['switch-source', 'switch-during-read', 'switch-row'].includes(mode)) {
    assert.equal(writes.length, 0)
    assert.match(panel.dataSourceExcelError.value, /已切换|没有当前数据源/)
  } else if (mode === 'save-failure') {
    assert.match(panel.dataSourceExcelError.value, /保存失败测试/)
    assert.deepEqual(plain(workspace.value), original)
    assert.deepEqual(plain(panel.activeDefinition.value), originalDefinition)
  } else if (['cancel-dialog', 'cancel-file', 'readonly', 'no-source'].includes(mode)) {
    assert.equal(writes.length, 0)
    assert.deepEqual(plain(workspace.value), noSource ? { type: 'none' } : original)
  } else if (mode === 'create' || mode === 'no-source-create') {
    assert.equal(panel.dataSourceExcelError.value, '')
    assert.equal(writes.length, 1)
    assert.equal(writes[0].id, undefined)
    const saved = [...definitions.values()].find(value => value.id === 'saved-id')
    assert.equal(saved.name, '商品')
    assert.equal(saved.table_name, null)
    assert.equal(saved.schema.fields.length, 0)
    assert.equal(saved.schema.printDetail.length, 1)
    assert.equal(refreshes, 1)
    assert.equal(workspace.value.formCode, saved.code)
    assert.equal(workspace.value.headerFields.length, 0)
    assert.deepEqual(plain(workspace.value.rows[0].detail_1), analyzed.model.detail_1)
  } else {
    assert.equal(panel.dataSourceExcelError.value, '')
    assert.equal(writes.length, 1)
    assert.equal(writes[0].id, originalDefinition.id)
    assert.deepEqual(Object.keys(writes[0].data), ['schema'])
    assert.equal(definitions.size, 1)
    const saved = definitions.get(originalDefinition.code)
    assert.deepEqual(saved.schema.fields, originalDefinition.schema.fields)
    assert.deepEqual(saved.schema.printHeader, originalDefinition.schema.printHeader)
    assert.equal(saved.schema.printDetail.length, 2)
    const table = saved.schema.printDetail[1]
    assert.equal(table.field, 'detail_3')
    assert.equal(table.label, '商品')
    assert.notEqual(table.id, oldTable.id)
    assert.equal(panel.activeDetailTableId.value, table.id)
    assert.equal(workspace.value.formCode, original.formCode)
    for (let i = 0; i < 2; i++) {
      assert.equal(workspace.value.rows[i].detail_2, original.rows[i].detail_2)
      assert.deepEqual(plain(workspace.value.rows[i].detail_1), original.rows[i].detail_1)
    }
    assert.deepEqual(plain(workspace.value.rows[0].detail_3), [])
    assert.deepEqual(plain(workspace.value.rows[1].detail_3), analyzed.model.detail_1)
  }
}
for (const mode of ['create', 'no-source-create', 'append', 'no-source', 'cancel-dialog', 'cancel-file', 'readonly', 'switch-source', 'switch-during-read', 'switch-row', 'save-failure']) await scenario(mode)
assert.match(source, /async function handleImportExcelDataSource\(\)[\s\S]*?openGlobalDialog/)
assert.match(source, /key: 'excel-data-source-import-template-picker'/)
assert.match(source, /label: '选择文件'/)
assert.match(source, /pendingExcelDataSourceConfig\.value = \{/)
assert.match(source, /dataSourceExcelInput\.value\?\.click\(\)/)
assert.match(source, /const sheetName =workbook\?\.SheetNames\?\.\[0\]\|\| config\?\.sheetName/)
assert.match(source, /name: sheetName/)
assert.match(source, /label: '追加现有明细'/)
assert.match(source, /requireExcelAppendDefinition\(appendTarget\)/)
assert.match(source, /id: definition\.id, data: \{ schema \}/)
console.log('Excel data source regression passed: parsing, pre-file configuration, creation, append preservation, missing source, cancellation, source switching, and save failure.')
