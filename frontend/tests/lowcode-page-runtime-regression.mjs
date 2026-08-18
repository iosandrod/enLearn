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
  isLowCodeEditPageModifyAction,
  isLowCodeEditPageReadonly,
  isLowCodeEditPageSaveAction,
  normalizeLowCodeEditPageActionCode,
  resolveLowCodeEditPageMode,
} from '../../packages/lowcode-framework/src/runtime/edit-page-mode.ts';
import {
  buttonDisabledFunctions,
  isLowCodeButtonDisabled,
} from '../../packages/lowcode-framework/src/runtime/button-disabled/index.ts';

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
assert.equal(normalizeLowCodeEditPageActionCode('Save-And_Close'), 'saveandclose');
assert.equal(isLowCodeEditPageSaveAction({ code: 'save-and-close' }), true);
assert.equal(isLowCodeEditPageModifyAction({ code: 'modify' }), true);
assert.equal(isLowCodeEditPageActionDisabled({ code: 'save' }, 'scan'), true);
assert.equal(isLowCodeEditPageActionDisabled({ code: 'modify' }, 'scan'), false);
assert.equal(isLowCodeEditPageActionDisabled({ code: 'addDetail' }, 'scan'), true);
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
const isButtonDisabled = (code, mode, disabled = false) => {
  runtime.state.status.formMode = mode;
  return isLowCodeButtonDisabled({ code, disabled }, runtime);
};

assert.equal(isButtonDisabled('save', 'scan'), true);
assert.equal(isButtonDisabled('submit', 'scan'), true);
assert.equal(isButtonDisabled('addDetail', 'scan'), true);
assert.equal(isButtonDisabled('detailDelete', 'scan'), true);
assert.equal(isButtonDisabled('saveReport', 'scan'), false);
assert.equal(isButtonDisabled('addDetailTax', 'scan'), false);
assert.equal(isButtonDisabled('modify', 'scan'), false);
assert.equal(isButtonDisabled('modify', 'edit'), true);
assert.equal(isButtonDisabled('create', 'scan'), false);
assert.equal(isButtonDisabled('create', 'add'), false);
assert.equal(isButtonDisabled('copy', 'edit'), false);
assert.equal(isButtonDisabled('copy', 'add'), true);
assert.equal(isButtonDisabled('refresh', 'edit', true), true);
assert.equal(typeof buttonDisabledFunctions.save, 'function');
assert.equal(typeof buttonDisabledFunctions.addDetail, 'function');
for (const [code, disabledFunction] of Object.entries(buttonDisabledFunctions)) {
  assert.equal(
    typeof disabledFunction(runtime),
    'boolean',
    `The ${code} disabled function must accept runtime context and return a boolean.`,
  );
}
runtime.state.status.mesCommandExecuting = true;
assert.equal(isButtonDisabled('refresh', 'edit'), true);
runtime.state.status.mesCommandExecuting = false;
runtime.state.status.formMode = 'scan';

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
], { resetGridBaseline: true });

const initialRows = runtime.state.grids['items-grid'].rows;
runtime.setSource('items', [...initialRows, { id: 'new-1', name: 'Draft' }]);
const draftRows = runtime.state.grids['items-grid'].rows;
draftRows[2].name = 'Draft changed';
assert.deepEqual(runtime.getGridChanges('items-grid'), {
  created: [{ id: 'new-1', name: 'Draft changed' }],
  updated: [],
  deleted: [],
}, 'Editing a newly added row must keep it exclusively in created.');
runtime.setSource('items', draftRows.slice(0, 2));
assert.deepEqual(runtime.getGridChanges('items-grid'), {
  created: [],
  updated: [],
  deleted: [],
}, 'Deleting a newly added row must remove it from the change set.');

const persistedRows = runtime.state.grids['items-grid'].rows;
persistedRows[0].name = 'Alpha changed';
assert.deepEqual(runtime.getGridChanges('items-grid').updated, [
  { id: 1, name: 'Alpha changed' },
]);
persistedRows[0].name = 'Alpha';
assert.deepEqual(runtime.getGridChanges('items-grid'), {
  created: [],
  updated: [],
  deleted: [],
}, 'Restoring a persisted row to its baseline must clear its update state.');

persistedRows[0].name = 'Alpha changed';
runtime.setSource('items', [
  persistedRows[0],
  { id: 3, name: 'Gamma' },
]);
assert.deepEqual(runtime.getGridChanges('items-grid'), {
  created: [{ id: 3, name: 'Gamma' }],
  updated: [{ id: 1, name: 'Alpha changed' }],
  deleted: [{ id: 2, name: 'Beta' }],
});
runtime.setGridRows('items-grid', [runtime.state.grids['items-grid'].rows[0]], {
  sourceKey: 'items',
  rowKey: 'id',
});
assert.deepEqual(runtime.getGridChanges('items-grid'), {
  created: [{ id: 3, name: 'Gamma' }],
  updated: [{ id: 1, name: 'Alpha changed' }],
  deleted: [{ id: 2, name: 'Beta' }],
}, 'Client-side grid filtering must not classify hidden source rows as deleted.');
runtime.setSource('items', [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Beta' },
], { resetGridBaseline: true });
assert.deepEqual(runtime.getGridChanges('items-grid'), {
  created: [],
  updated: [],
  deleted: [],
});
runtime.ensureGrid('items-grid', { sourceKey: 'items', rowKey: 'code' });
runtime.setSource('items', [{ code: 'A', name: 'Alpha by code' }]);
assert.deepEqual(runtime.getGridChanges('items-grid'), {
  created: [],
  updated: [],
  deleted: [],
}, 'Changing the configured row key must establish a new baseline.');
runtime.ensureGrid('items-grid', { sourceKey: 'items', rowKey: 'id' });
runtime.setSource('items', [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Beta' },
], { resetGridBaseline: true });
const resetRows = runtime.state.grids['items-grid'].rows;
runtime.applyGridEvent('items-grid', {
  key: 'rowCurrentChange',
  row: resetRows[0],
  rawEvent: { newValue: resetRows[0] },
});
runtime.applyGridEvent('items-grid', {
  key: 'checkboxAll',
  rawEvent: { records: () => [resetRows[0], resetRows[1]] },
});
runtime.applyGridEvent('items-grid', {
  key: 'cellMenu',
  row: resetRows[0],
  rawEvent: { column: { field: 'name' } },
});

const interactedGrid = runtime.state.grids['items-grid'];
assert.equal(runtime.isGridInitialized('items-grid'), true);
assert.equal(interactedGrid.currentRow, resetRows[0]);
assert.deepEqual(interactedGrid.selectedRows, resetRows);
assert.equal(interactedGrid.contextRow, resetRows[0]);
assert.equal(interactedGrid.currentCell?.row, resetRows[0]);
assert.equal(interactedGrid.currentCell?.field, 'name');

runtime.setSource('items', [
  { id: 1, name: 'Alpha refreshed' },
  { id: 2, name: 'Beta refreshed' },
], { resetGridBaseline: true });

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

runtime.setSource('items', [
  { id: 1, name: 'Alpha locally edited' },
  { id: 2, name: 'Beta refreshed' },
]);
assert.equal(runtime.getGridChanges('items-grid').updated.length, 1);
runtime.resetData({ preserveGrids: true, preserveLocalGridRows: false });
runtime.setSource('items', [
  { id: 1, name: 'Alpha reloaded' },
  { id: 2, name: 'Beta reloaded' },
], { resetGridBaseline: true });
assert.deepEqual(runtime.getGridChanges('items-grid'), {
  created: [],
  updated: [],
  deleted: [],
}, 'Reloading a preserved Grid must discard the previous source baseline.');

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
  /async function resetBuiltinForms[\s\S]*?formRecords\[block\.id\] = cloneRuntimeValue\(values\)[\s\S]*?return formRecords[\s\S]*?async function clearBuiltinDetailGrids\(\)[\s\S]*?block\.tableType !== 'detail'[\s\S]*?sourceRequestVersions\.delete\(block\.sourceKey\)[\s\S]*?runtime\.setSource\([\s\S]*?rows: \[\][\s\S]*?runtime\.setGridRows\(block\.id, \[\][\s\S]*?if \(mode === 'create'\) await clearBuiltinDetailGrids\(\)/,
  'Creating a record from an edit page must clear every source-backed and local detail Grid.',
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
  /getSourceValue:[\s\S]*?setGridRows:[\s\S]*?getGridChanges:[\s\S]*?setGridCurrentRow:[\s\S]*?validateGrid:/,
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
