import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { parse } from '@vue/compiler-sfc';
import { computed, reactive, ref, watchEffect } from 'vue';

async function extract(path, names) {
  let source = await readFile(new URL(path, import.meta.url), 'utf8');
  if (path.endsWith('.vue')) source = parse(source).descriptor.scriptSetup.content;
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return ts.transpileModule(ast.statements.filter(statement =>
    ts.isFunctionDeclaration(statement) && names.includes(statement.name?.text),
  ).map(statement => statement.getText(ast).replace(/^export /, '')).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
}

globalThis.window = new EventTarget();
globalThis.CustomEvent ??= class extends Event {
  constructor(type, options) { super(type); this.detail = options.detail; }
};
const toolbarCode = await extract('../../packages/lowcode-framework/src/runtime/print-detail-toolbar.ts', [
  'createPrintDetailToolbar', 'requestPrintDetailAction',
]);
const { createPrintDetailToolbar, requestPrintDetailAction } = new Function(`${toolbarCode}; return { createPrintDetailToolbar, requestPrintDetailAction };`)();
const errors = [];
const schemaCode = await extract('../../packages/lowcode-framework/src/runtime/page-reference-dialog.tsx', [
  'createImportFormSchema', 'isRecord', 'readString', 'cloneValue',
]);
const createSchema = new Function('reactive', 'createPrintDetailToolbar', 'requestPrintDetailAction', 'openGlobalDialog',
  `${schemaCode}; return createImportFormSchema;`,
)(reactive, createPrintDetailToolbar, requestPrintDetailAction, async config => errors.push(config.content.render()));

const original = {
  title: '订单', actions: [],
  fields: [{ field: 'customer', label: '客户', component: 'vxe-input' },
    { field: 'items', component: 'lc-array-table', props: { columns: [{ field: 'sku' }] } }],
  printDetail: [{ id: 'materials', key: 'items', field: 'obsolete', title: '物料',
    dataSourceScript: 'orders.remote', columns: [{ field: 'sku', title: '编码' }] }],
};
const definition = ref({ id: 'orders', code: 'orders', schema: structuredClone(original) });
const tables = computed(() => definition.value.schema.printDetail.map(table => ({ ...table, field: table.key ?? table.field })));
const selected = ref('materials');
const table = computed(() => tables.value.find(item => item.id === selected.value) ?? tables.value[0]);
const loading = ref('');
const actionMessage = ref('');
const apiCalls = [];
let backendResult = { records: [{ sku: 'A001' }] };
let backendFailure = false;
const updates = [];
const serviceApi = { invoke: async (service, method, params) => {
  apiCalls.push({ service, method, params });
  if (backendFailure) throw new Error('模拟请求失败');
  return method === 'resolveDataSource' ? backendResult : {};
} };
const panelCode = await extract('../../packages/tldraw-vue/src/components/VueDataSourcePanel.vue', [
  'handleFetchDetailData', 'normalizeFetchedDetailRows', 'handleConfigureDetailTable',
  'handleDeleteDetailTable', 'saveDetailTables', 'handlePrintDetailActionRequest',
  'handlePrintDataSourceImportRequest', 'isRecord', 'readString',
]);
const panel = new Function('host', 'activeDefinition', 'detailTables', 'activeDetailTableId', 'activeDetailTable',
  'activeSourceTab', 'detailDataLoadingTableId', 'formModel', 'actionMessage', 'setActionMessage',
  'updateDetailRows', 'notifyAction', 'applyWorkspaceDetailTables', 'syncDetailFormModel',
  'openPrintDetailColumnsDialog', 'handleImportData',
  `${panelCode}; return { handlePrintDetailActionRequest, handlePrintDataSourceImportRequest };`,
)({ getServiceApi: () => serviceApi }, definition, tables, selected, table, ref('header'), loading,
  ref({ customer: '旧客户' }), actionMessage, message => { actionMessage.value = message; },
  (field, rows) => updates.push({ field, rows }), () => {}, () => {}, () => {},
  async (_api, currentTable, onConfirm) => {
    await onConfirm({ ...currentTable, columns: [{ field: 'sku', title: '新编码' }, { field: 'qty', title: '数量' }] });
  }, async onImported => onImported([{ sku: 'Excel' }], 'append'));
window.addEventListener('enlearn:print-detail-action', panel.handlePrintDetailActionRequest);
window.addEventListener('enlearn:print-data-source-import', panel.handlePrintDataSourceImportRequest);

const schema = createSchema(original, 'orders');
assert.equal(schema.fields[1].field, 'items', 'Use the same key normalization as the data source panel.');
assert.equal(schema.fields[1].label, '物料');
assert.deepEqual(schema.fields[1].props.toolbarButtons.map(button => button.label), [
  '新增行', '获取数据', '清空', '导入', '表格配置', '删除子表',
]);
assert.equal(schema.fields[1].props.toolbarButtons[0].command, 'add');
const formValues = reactive({ customer: '新客户', items: [{ sku: 'existing' }] });
const rows = ref(JSON.parse(JSON.stringify(formValues.items)));
const props = { field: schema.fields[1], formValues, modelValue: formValues.items };
let commits = 0;
const commitRows = () => {
  commits++;
  props.modelValue = structuredClone(JSON.parse(JSON.stringify(rows.value)));
  formValues.items = props.modelValue;
};
const clickCode = await extract('../../packages/lowcode-framework/src/lowcode/form-materials/lc-array-table/index.vue', ['handleToolbarButtonClick']);
const click = new Function('toolbarButtons', 'isReadonly', 'rows', 'props', 'normalizeRows', 'commitRows',
  'serializeRows', 'normalizeModelValue', 'isSameValue', 'addRow', 'emitConfiguredEvent', 'emit',
  `${clickCode}; return handleToolbarButtonClick;`,
)(computed(() => schema.fields.find(field => field.field === 'items')?.props.toolbarButtons ?? []), ref(false),
  rows, props, value => value ?? [], commitRows, () => rows.value, value => value ?? [],
  (a, b) => JSON.stringify(a) === JSON.stringify(b), () => {}, () => {}, (_event, value) => {
    props.modelValue = value;
    formValues.items = value;
  });
const run = code => click({ name: code });

await run('fetch');
assert.deepEqual(JSON.parse(JSON.stringify(formValues.items)), [{ sku: 'A001' }]);
assert.equal(apiCalls[0].params.sourceCode, 'orders.remote');
assert.equal(apiCalls[0].params.params.customer, '新客户', 'Fetch uses modal values, not stale panel values.');
assert.equal(apiCalls[0].params.params.detailField, 'items');
assert.equal(updates[0].field, 'items');
assert.equal(loading.value, '');
assert.ok(commits > 0, 'Fetched rows must be committed to the confirming form.');
await run('clear');
assert.deepEqual(formValues.items, []);
await run('import');
assert.deepEqual(formValues.items, [{ sku: 'Excel' }]);

backendFailure = true;
await run('fetch');
assert.match(errors.pop(), /模拟请求失败/);
assert.deepEqual(formValues.items, [{ sku: 'Excel' }], 'Failures preserve edited rows.');
assert.equal(schema.fields[1].props.toolbarButtons.find(button => button.code === 'fetch').disabled, false);
backendFailure = false;
backendResult = { data: [{ sku: 'A002' }] };
await run('fetch');
assert.equal(formValues.items[0].sku, 'A002');

let displayedTitles;
const stop = watchEffect(() => {
  displayedTitles = schema.fields.find(field => field.field === 'items')?.props.columns.map(column => column.title);
}, { flush: 'sync' });
await run('configure');
assert.deepEqual(displayedTitles, ['新编码', '数量'], 'Configuration updates the reactive dialog schema.');
assert.deepEqual(formValues.items, [{ sku: 'A002' }], 'Changing columns preserves imported rows.');
assert.equal(formValues.customer, '新客户');
assert.equal(apiCalls.at(-1).method, 'saveItem');
await run('fetch');
assert.equal(formValues.items[0].sku, 'A002', 'New toolbar callbacks remain functional after configuration.');
await run('delete');
assert.deepEqual(schema.fields.map(field => field.field), ['customer']);
assert.deepEqual(schema.layout.map(node => node.field), ['customer']);
assert.equal(formValues.items, undefined, 'Deleted details must not be submitted with the form.');
assert.equal(definition.value.schema.printDetail.length, 0);
stop();
await assert.rejects(requestPrintDetailAction({ formCode: 'unrelated', field: 'items', action: 'fetch' }), /未找到对应/);
assert.deepEqual(original.printDetail[0].columns, [{ field: 'sku', title: '编码' }], 'Schema processing must not mutate the input.');
console.log('Verified matching import toolbar, real fetch/clear/import callbacks, form commits, schema refresh, deletion and scoped error handling.');
