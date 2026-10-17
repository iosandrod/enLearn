import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../packages/lowcode-framework/package.json', import.meta.url));
const ts = require('typescript');
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc');
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const clone = (value) => structuredClone(value);
const ref = (value) => ({ value });
const computed = (get) => ({ get value() { return get(); } });

// Evaluate the production functions with host dependencies supplied by the fixture.
function loadFunctions(source, variables, dependencies, exports) {
  const ast = ts.createSourceFile('fixture.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const selected = ast.statements.filter((node) => ts.isFunctionDeclaration(node)
    || (ts.isVariableStatement(node) && node.declarationList.declarations.some((item) => variables.includes(item.name.getText(ast)))));
  const code = ts.transpileModule(selected.map((node) => node.getText(ast).replace(/^export\s+/, '')).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(dependencies), `${code}\nreturn { ${exports.join(',')} };`)(...Object.values(dependencies));
}

const designerSource = await read('packages/lowcode-framework/src/visual-editor/components/form-designer/form-designer.service.tsx');
const designer = loadFunctions(designerSource, ['runtimeToEditorComponent', 'editorToRuntimeComponent', 'optionComponents'], {
  cloneDeep: clone,
  visualConfig: { componentMap: { 'array-table': { key: 'array-table' } } },
  createNewBlock: (component) => ({ componentKey: component.key, props: {} }),
}, ['createFieldBlock', 'blockToField', 'normalizeFields']);
const configuration = {
  columns: [{ field: 'name', title: '名称', optionsCode: 'names', props: { clearable: false } }],
  rowDraggable: true, rowDragConfig: { trigger: 'row', animation: false },
  showActions: false, actionWidth: 260, copyable: true, removable: false, movable: false,
  rowActions: [{ code: 'finish', command: 'remove', label: '完成', script: 'return { row: { status: "done" } };' }],
  toolbarButtons: [{ code: 'load', label: '加载', script: 'return { rows: [] };' }],
  showToolbar: false, readonly: true, minRows: 2, defaultRow: { name: '默认' },
  treeConfig: { childrenField: 'items' }, preserveRowKey: true,
  rowConfig: { keyField: 'id', height: 36 }, customSetting: { retain: true },
};
let field = { field: 'items', label: '明细', component: 'lc-array-table', props: clone(configuration) };
for (let round = 0; round < 3; round++) {
  const block = designer.createFieldBlock(field, 0);
  const result = designer.blockToField(block, 0);
  for (const [key, value] of Object.entries(configuration)) assert.deepEqual(result.props[key], value, `Lost ${key} on save ${round}`);
  assert.equal(result.field, 'items');
  field = designer.normalizeFields([{ ...result, props: undefined }])[0];
}
assert.deepEqual(configuration.rowActions[0].script, field.props.rowActions[0].script);
field.props.rowActions[0].label = '改动';
assert.equal(configuration.rowActions[0].label, '完成', 'Designer must not mutate the original schema.');
for (const key of ['columns', 'toolbarButtons', 'rowActions']) {
  const result = designer.blockToField(designer.createFieldBlock({
    field: 'values', label: '值', component: 'lc-array-table', props: { valueMode: 'primitive', [key]: [] },
  }, 0), 0);
  assert.deepEqual(result.props[key], [], `Explicit empty ${key} must remain empty.`);
}

const sfc = await read('packages/lowcode-framework/src/lowcode/form-materials/lc-array-table/index.vue');
const filename = fileURLToPath(new URL('../../packages/lowcode-framework/src/lowcode/form-materials/lc-array-table/index.vue', import.meta.url));
const { descriptor, errors } = parse(sfc, { filename });
assert.deepEqual(errors, []);
const script = compileScript(descriptor, { id: 'array-table-regression',
  fs: { fileExists: existsSync, readFile: (path) => readFileSync(path, 'utf8') },
});
assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'index.vue', id: 'array-table-regression',
  compilerOptions: { bindingMetadata: script.bindings },
}).errors, []);

const rows = ref([]);
const readonly = ref(false);
const running = ref(false);
const fieldProps = ref({ rowDraggable: true, showActions: false, rowActions: [], events: {} });
const toolbarButtons = ref([]);
const treeEnabled = ref(false);
const minRows = ref(0);
const emitted = [];
const failures = [];
const scriptEvents = [];
const props = { field: { field: 'items' }, formValues: { customer: 'A' }, modelValue: [] };
let scriptResult;
let scriptFailure;
let scriptWait;
const tableRef = ref({ getFullData: () => [...rows.value].reverse() });
const runtime = loadFunctions(descriptor.scriptSetup.content, ['legacyToolbarCommandExecutors', 'rowDraggable', 'showActions', 'rowDragConfig'], {
  rows, props, fieldProps, toolbarButtons, isReadonly: readonly, actionRunning: running,
  generatedRowKeySeed: 0,
  treeEnabled, minRows, tableRef, rowKey: ref('__rowKey'), treeChildrenField: ref('children'),
  preserveRowKey: ref(false), valueMode: ref('object'), valueField: ref('value'),
  columns: ref([]), computed, explicitTableConfig: ref({ rowDragConfig: { trigger: 'row', animation: false } }),
  TREE_DRAG_PARENT_FIELD: '__parent', TREE_DRAG_CHILDREN_FIELD: '__children', TREE_DRAG_MAP_CHILDREN_FIELD: '__mapChildren',
  runtimeBlockEditor: { reportRuntimeError: (error) => failures.push(error.message) },
  showVxeMessage: () => assert.fail('Page runtime must receive errors'),
  emit: (...args) => emitted.push(args),
  executeArrayTableScript: async (source, event) => {
    scriptEvents.push({ source, event });
    if (scriptFailure) throw scriptFailure;
    if (scriptWait) await scriptWait;
    return scriptResult;
  },
}, ['readToolbarButtons', 'readRowActions', 'handleToolbarButtonClick', 'handleRowAction', 'normalizeRows',
  'serializeRows', 'isRowActionDisabled', 'visibleRowActions', 'handleRowDragend', 'rowDraggable', 'showActions', 'rowDragConfig']);
const setRows = (value) => { rows.value = runtime.normalizeRows(value.map((row, index) => ({ __rowKey: `r${index}`, ...row }))); };
setRows([{ name: 'first' }, { name: 'second' }]);
assert.equal(runtime.rowDraggable.value, true);
assert.equal(runtime.showActions.value, false);
assert.equal(runtime.rowDragConfig.value.trigger, 'row');
assert.equal(runtime.rowDragConfig.value.animation, false);
readonly.value = true;
assert.equal(runtime.rowDraggable.value, false);
readonly.value = false;
runtime.handleRowDragend({ dragRow: rows.value[0] });
assert.deepEqual(runtime.serializeRows().map((row) => row.name), ['second', 'first']);

toolbarButtons.value = runtime.readToolbarButtons([
  { code: 'hidden', visible: false },
  { code: 'add', command: 'add', script: 'return { rows: [] };', execute: () => assert.fail('Script takes priority') },
]);
assert.equal(toolbarButtons.value.length, 1);
scriptResult = { rows: [] };
await runtime.handleToolbarButtonClick({ name: 'add' });
assert.deepEqual(rows.value, [], 'Add-command buttons must run their script instead of adding.');
assert.equal(scriptEvents[0].event.payload.field, 'items');
assert.deepEqual(scriptEvents[0].event.payload.formValues, { customer: 'A' });
assert.equal(scriptEvents[0].event.payload.action.execute, undefined);
assert.equal(running.value, false);

setRows([{ name: 'one' }]);
const [action] = runtime.readRowActions([{ code: 'done', command: 'remove', script: 'return { row: { status: "done" } };' }]);
scriptResult = { row: { status: 'done' } };
await runtime.handleRowAction(action, rows.value[0]);
assert.deepEqual(runtime.serializeRows(), [{ name: 'one', status: 'done' }]);
assert.equal(scriptEvents.at(-1).event.payload.index, 0);
assert.deepEqual(scriptEvents.at(-1).event.payload.rows, [{ name: 'one' }]);
minRows.value = 1;
assert.equal(runtime.isRowActionDisabled({ code: 'delete', command: 'remove' }, rows.value[0]), true);
assert.equal(runtime.isRowActionDisabled(action, rows.value[0]), false, 'Scripts override built-in command guards.');
assert.equal(runtime.isRowActionDisabled({ code: 'up', command: 'moveUp' }, rows.value[0]), true);
assert.equal(runtime.isRowActionDisabled({ code: 'child', command: 'addChild' }, rows.value[0]), true);

readonly.value = true;
await runtime.handleRowAction(action, rows.value[0]);
assert.equal(scriptEvents.length, 2, 'Readonly actions must not execute.');
readonly.value = false;
scriptFailure = new Error('脚本失败');
await runtime.handleRowAction(action, rows.value[0]);
assert.deepEqual(failures, ['脚本失败']);
assert.equal(running.value, false, 'Errors must release the execution lock.');
scriptFailure = undefined;
let finish;
scriptWait = new Promise((resolve) => { finish = resolve; });
const pending = runtime.handleRowAction(action, rows.value[0]);
await runtime.handleRowAction(action, rows.value[0]);
assert.equal(scriptEvents.length, 4, 'Repeated clicks must not dispatch concurrent scripts.');
finish();
await pending;
scriptWait = undefined;
let callbacks = 0;
toolbarButtons.value = runtime.readToolbarButtons([{ code: 'custom', execute: () => { callbacks++; } }]);
await runtime.handleToolbarButtonClick({ name: 'custom' });
assert.equal(callbacks, 1, 'Existing callback buttons remain compatible.');
toolbarButtons.value = runtime.readToolbarButtons([{ code: 'add', command: 'add', row: { name: 'new' } }]);
await runtime.handleToolbarButtonClick({ name: 'add' });
assert.deepEqual(runtime.serializeRows().at(-1), { name: 'new' }, 'Built-in add still applies configured row data.');
assert.ok(rows.value.at(-1).__rowKey);
scriptResult = { rows: [{ name: 'loaded' }] };
toolbarButtons.value = runtime.readToolbarButtons([{ code: 'load', script: 'return { rows: [{ name: "loaded" }] };' }]);
await runtime.handleToolbarButtonClick({ name: 'load' });
assert.deepEqual(runtime.serializeRows(), [{ name: 'loaded' }], 'Script replacement rows must normalize and persist.');
assert.ok(rows.value[0].__rowKey);

const adapter = loadFunctions(await read('packages/lowcode-framework/src/lowcode/form-materials/array-table-script.ts'), [], {
  executeLowCodeScript: async ({ context }, capability) => {
    assert.deepEqual(context.policy.apiNames, []);
    assert.deepEqual(context.event.rows, []);
    await capability({ name: 'message.success', args: ['完成'] });
    assert.throws(() => capability({ name: 'api.invoke', args: [] }), /独立表单不支持/);
    return { value: { rows: [] } };
  },
  showVxeMessage: (message, status) => assert.deepEqual([message, status], ['完成', 'success']),
}, ['executeArrayTableScript']);
assert.deepEqual(await adapter.executeArrayTableScript('script', { name: 'test', payload: { rows: [] } }), { rows: [] });
assert.equal(await adapter.executeArrayTableScript('script', {}, { executeButtonScript: async () => 42 }), 42);

const migration = await read('supabase/migrations/20261017110000_array_table_property_form.sql');
const fields = JSON.parse(migration.match(/\$fields\$([\s\S]*?)\$fields\$/)[1]);
for (const name of ['rowActions', 'toolbarButtons']) {
  const input = fields.find((field) => field.field === name);
  assert.equal(input.props.rowDraggable, true);
  assert.equal(input.props.columns.find((column) => column.field === 'script').component, 'lc-monaco-editor');
}
console.log('Array-table property form regression passed (save roundtrip, drag, scripts, guards, errors, adapter, SFC compile).');
