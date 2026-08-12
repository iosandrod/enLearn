import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRenderer, defineComponent, h } from 'vue';
import {
  createLowCodePageRuntime,
  provideLowCodePageRuntime,
  useLowCodePageRuntime,
} from '../../packages/lowcode-framework/src/runtime/page-runtime.ts';
import {
  isLowCodeEditPageActionDisabled,
  isLowCodeEditPageFieldDisabled,
  isLowCodeEditPageReadonly,
  resolveLowCodeEditPageMode,
} from '../../packages/lowcode-framework/src/runtime/edit-page-mode.ts';

const runtime = createLowCodePageRuntime();

assert.deepEqual(
  Object.keys(runtime.state),
  ['sources', 'forms', 'searches', 'grids', 'status'],
  'A page runtime must own all page-level business state.'
);
assert.equal(runtime.state.status.formMode, 'scan');
assert.equal(resolveLowCodeEditPageMode('record-1'), 'scan');
assert.equal(resolveLowCodeEditPageMode(''), 'add');
assert.equal(resolveLowCodeEditPageMode(undefined), 'add');
assert.equal(isLowCodeEditPageReadonly('scan'), true);
assert.equal(isLowCodeEditPageReadonly('edit'), false);
assert.equal(
  isLowCodeEditPageFieldDisabled({ createDisabled: true }, 'add'),
  true,
  'Add mode must use createDisabled.',
);
assert.equal(
  isLowCodeEditPageFieldDisabled({ editDisabled: true }, 'edit'),
  true,
  'Edit mode must use editDisabled.',
);
assert.equal(
  isLowCodeEditPageFieldDisabled({}, 'scan'),
  true,
  'Scan mode must keep each configured input component visible but disabled.',
);
assert.equal(isLowCodeEditPageActionDisabled({ code: 'save' }, 'scan'), true);
assert.equal(isLowCodeEditPageActionDisabled({ code: 'submit' }, 'scan'), true);
assert.equal(isLowCodeEditPageActionDisabled({ code: 'addDetail' }, 'scan'), true);
assert.equal(isLowCodeEditPageActionDisabled({ code: 'detailDelete' }, 'scan'), true);
assert.equal(isLowCodeEditPageActionDisabled({ code: 'saveReport' }, 'scan'), false);
assert.equal(isLowCodeEditPageActionDisabled({ code: 'addDetailTax' }, 'scan'), false);
assert.equal(isLowCodeEditPageActionDisabled({ code: 'modify' }, 'scan'), false);
assert.equal(isLowCodeEditPageActionDisabled({ code: 'modify' }, 'edit'), true);
assert.equal(isLowCodeEditPageActionDisabled({ code: 'create' }, 'scan'), false);
assert.equal(isLowCodeEditPageActionDisabled({ code: 'create' }, 'add'), true);
assert.equal(isLowCodeEditPageActionDisabled({ code: 'copy' }, 'edit'), false);
assert.equal(isLowCodeEditPageActionDisabled({ code: 'copy' }, 'add'), true);

runtime.replaceForm('edit-form', { name: 'Initial' });
runtime.patchForm('edit-form', { status: 'enabled' });
runtime.replaceSearch('items', { keyword: 'alpha' });
runtime.patchSearch('items', { status: 'enabled' });

assert.deepEqual(runtime.state.forms['edit-form'], {
  name: 'Initial',
  status: 'enabled',
});
assert.deepEqual(runtime.state.searches.items, {
  keyword: 'alpha',
  status: 'enabled',
});

let validationCleared = false;
const unregisterFormController = runtime.registerFormController('edit-form', {
  validate: async () => true,
  clearValidation: () => {
    validationCleared = true;
  },
});
assert.equal(await runtime.getFormController('edit-form')?.validate(), true);
await runtime.getFormController('edit-form')?.clearValidation();
assert.equal(validationCleared, true);
unregisterFormController();
assert.equal(runtime.getFormController('edit-form'), undefined);

let gridCurrentRow = null;
const unregisterGridController = runtime.registerGridController('items-grid', {
  validate: async () => true,
  clearValidation: () => undefined,
  setCurrentRow: (row) => {
    gridCurrentRow = row;
  },
});
assert.equal(await runtime.getGridController('items-grid')?.validate(), true);
await runtime.getGridController('items-grid')?.setCurrentRow({ id: 1 });
assert.deepEqual(gridCurrentRow, { id: 1 });
unregisterGridController();
assert.equal(runtime.getGridController('items-grid'), undefined);

runtime.ensureGrid('items-grid', { sourceKey: 'items', rowKey: 'id' });
runtime.setSource('items', [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Beta' },
]);

const initialRows = runtime.state.grids['items-grid'].rows;
runtime.applyGridEvent('items-grid', {
  key: 'rowCurrentChange',
  row: initialRows[0],
  rawEvent: { newValue: initialRows[0] },
});
runtime.applyGridEvent('items-grid', {
  key: 'checkboxAll',
  rawEvent: { records: () => [initialRows[0], initialRows[1]] },
});
runtime.applyGridEvent('items-grid', {
  key: 'cellMenu',
  row: initialRows[0],
  rawEvent: { column: { field: 'name' } },
});

const interactedGrid = runtime.state.grids['items-grid'];
assert.equal(runtime.isGridInitialized('items-grid'), true);
assert.equal(interactedGrid.currentRow, initialRows[0]);
assert.deepEqual(interactedGrid.selectedRows, initialRows);
assert.equal(interactedGrid.contextRow, initialRows[0]);
assert.equal(interactedGrid.currentCell?.row, initialRows[0]);
assert.equal(interactedGrid.currentCell?.field, 'name');

runtime.setSource('items', [
  { id: 1, name: 'Alpha refreshed' },
  { id: 2, name: 'Beta refreshed' },
]);

const refreshedGrid = runtime.state.grids['items-grid'];
assert.equal(refreshedGrid.currentRow, refreshedGrid.rows[0]);
assert.equal(refreshedGrid.currentRow?.name, 'Alpha refreshed');
assert.equal(refreshedGrid.selectedRows[1], refreshedGrid.rows[1]);
assert.equal(refreshedGrid.contextRow, refreshedGrid.rows[0]);
assert.equal(refreshedGrid.currentCell?.row, refreshedGrid.rows[0]);

runtime.setGridRows('local-grid', []);
assert.equal(runtime.isGridInitialized('local-grid'), true);
assert.deepEqual(runtime.state.grids['local-grid'].rows, []);
runtime.resetData({ preserveGrids: true, preserveLocalGridRows: true });
assert.equal(
  runtime.isGridInitialized('local-grid'),
  true,
  'A locally edited empty Grid must remain initialized across a same-page refresh.',
);

runtime.applyGridEvent('items-grid', {
  key: 'radioChange',
  row: refreshedGrid.rows[0],
  rawEvent: { newValue: null },
});
assert.equal(refreshedGrid.currentRow, refreshedGrid.rows[0]);
assert.deepEqual(refreshedGrid.selectedRows, []);

runtime.applyGridEvent('items-grid', {
  key: 'rowCurrentChange',
  row: refreshedGrid.rows[0],
  rawEvent: { newValue: null },
});
assert.equal(refreshedGrid.currentRow, null);

const snapshot = runtime.snapshot();
assert.notEqual(snapshot, runtime.state);
assert.notEqual(snapshot.grids['items-grid'], refreshedGrid);
assert.deepEqual(snapshot.grids['items-grid'].rows, refreshedGrid.rows);

let injectedRuntime;
const hostRenderer = createRenderer({
  patchProp() {},
  insert(child, parent) {
    parent.children ??= [];
    parent.children.push(child);
    child.parent = parent;
  },
  remove() {},
  createElement(type) {
    return { type, children: [] };
  },
  createText(text) {
    return { text };
  },
  createComment(text) {
    return { comment: text };
  },
  setText(node, text) {
    node.text = text;
  },
  setElementText(node, text) {
    node.text = text;
  },
  parentNode(node) {
    return node.parent ?? null;
  },
  nextSibling() {
    return null;
  },
  querySelector() {
    return null;
  },
  setScopeId() {},
  cloneNode(node) {
    return { ...node };
  },
  insertStaticContent() {
    const node = { type: 'static' };
    return [node, node];
  },
});

const RuntimeConsumer = defineComponent({
  setup() {
    injectedRuntime = useLowCodePageRuntime();
    return () => h('span');
  },
});
const RuntimeProvider = defineComponent({
  setup() {
    provideLowCodePageRuntime(runtime);
    return () => h(RuntimeConsumer);
  },
});

hostRenderer.createApp(RuntimeProvider).mount({ type: 'root', children: [] });
assert.equal(injectedRuntime, runtime, 'Descendants must receive the owning page runtime.');

const rendererSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/components/LowCodePageRenderer.vue',
    import.meta.url
  ),
  'utf8'
);
const [
  gridMaterialSource,
  formMaterialSource,
  searchMaterialSource,
  buttonGroupMaterialSource,
] = await Promise.all([
  readFile(
    new URL(
      '../../packages/lowcode-framework/src/lowcode/block-materials/grid/index.vue',
      import.meta.url
    ),
    'utf8'
  ),
  readFile(
    new URL(
      '../../packages/lowcode-framework/src/lowcode/block-materials/form/index.vue',
      import.meta.url
    ),
    'utf8'
  ),
  readFile(
    new URL(
      '../../packages/lowcode-framework/src/lowcode/block-materials/search-form/index.vue',
      import.meta.url
    ),
    'utf8'
  ),
  readFile(
    new URL(
      '../../packages/lowcode-framework/src/lowcode/block-materials/button-group/index.vue',
      import.meta.url
    ),
    'utf8'
  ),
]);

for (const [alias, stateKey] of [
  ['resolvedData', 'sources'],
  ['formModels', 'forms'],
  ['searchFilters', 'searches'],
  ['gridStates', 'grids'],
]) {
  assert.match(
    rendererSource,
    new RegExp(`const ${alias} = computed\\(\\(\\) => runtime\\.state\\.${stateKey}\\)`),
    `${alias} must remain a computed compatibility alias.`
  );
}

assert.match(
  rendererSource,
  /grids:\s*gridStates\.value/,
  'Runtime expressions must expose grids.<blockId> interaction state.'
);
assert.match(
  rendererSource,
  /runtime\.ensureGrid\(block\.id/,
  'Every flattened Grid block must be registered in the page runtime.'
);
assert.match(
  rendererSource,
  /restoreGridInteractionState\(gridInteractionState\)/,
  'A page refresh must restore Grid interaction state by row key.'
);
assert.match(
  rendererSource,
  /const builtinPageFunctionMode = computed<BuiltinLowCodePageFunctionMode>[\s\S]*?runtime\.state\.status\.formMode/,
  'The edit-page mode must be reactive so form controls update when page functions switch mode.',
);
assert.match(
  rendererSource,
  /resolveLowCodeEditPageMode\(host\.getRoute\(\)\.query\?\.id\)/,
  'An edit page must initialize records in scan mode and empty routes in add mode.',
);
assert.match(
  rendererSource,
  /if \(!preserveGrids\) \{[\s\S]*?resolveLowCodeEditPageMode/,
  'Refreshing an existing edit page must preserve its current scan/edit/add mode.',
);
assert.match(
  rendererSource,
  /isSuccessfulEditPageSaveEvent[\s\S]*?enterScanModeAfterSave/,
  'A successful configured save action must return the edit page to scan mode.',
);
assert.match(
  rendererSource,
  /form: new Set\(\['setData', 'resetData'\]\)[\s\S]*?grid: new Set\(\['addRow', 'deleteCurrentRow'\]\)/,
  'Scan mode must block document mutation without blocking search-form or grid hydration actions.',
);
assert.match(
  buttonGroupMaterialSource,
  /const runtimeActions = computed[\s\S]*?code: 'modify'[\s\S]*?emit\('runtimeEvent'/,
  'Existing edit-page button groups with Save must receive a runtime Modify entry and publish it through the page state machine.',
);

for (const [name, source] of [
  ['Grid', gridMaterialSource],
  ['form', formMaterialSource],
  ['search form', searchMaterialSource],
]) {
  assert.match(
    source,
    /useLowCodePageRuntime\(false\)/,
    `The built-in ${name} material must support the injected page runtime.`
  );
}

for (const [name, source] of [
  ['form', formMaterialSource],
  ['search form', searchMaterialSource],
]) {
  assert.match(
    source,
    /hasOwnedFormModel\.value[\s\S]*?props\.formModels\[props\.block\.id\][\s\S]*?pageRuntime\?\.state\.forms/,
    `An explicit ${name} model must take ownership before an ambient page runtime.`,
  );
  assert.match(
    source,
    /if \(hasOwnedFormModel\.value \|\| !pageRuntime\)[\s\S]*?props\.formModels\[props\.block\.id\] = values/,
    `Updates to an explicit ${name} model must be written back to that model.`,
  );
  assert.match(
    source,
    /registerFormController\(props\.block\.id,[\s\S]*?validate:[\s\S]*?clearValidation:/,
    `The ${name} material must register its mounted validation controller.`,
  );
}

assert.match(
  rendererSource,
  /getFormBaseline:[\s\S]*?validateForm:[\s\S]*?clearFormValidation:[\s\S]*?refreshFormOptions:/,
  'Form node actions must receive baseline, validation, and option-refresh adapters.',
);

assert.match(
  rendererSource,
  /getSourceValue:[\s\S]*?setGridRows:[\s\S]*?setGridCurrentRow:[\s\S]*?validateGrid:/,
  'Grid node actions must receive source, row-selection, and validation adapters.',
);

assert.match(
  gridMaterialSource,
  /registerGridController\(props\.block\.id,[\s\S]*?validate:[\s\S]*?setCurrentRow:/,
  'The Grid material must register its mounted controller.',
);

assert.match(
  gridMaterialSource,
  /syncGridEvent\(payload\);[\s\S]*emitRuntimeEvent/,
  'Grid interaction state must be synchronized before its designed event is published.'
);

console.log('Low-code page runtime regression test passed.');
