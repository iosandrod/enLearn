import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRenderer, defineComponent, h } from 'vue';
import {
  createLowCodePageRuntime,
  provideLowCodePageRuntime,
  useLowCodePageRuntime,
} from '../../packages/lowcode-framework/src/runtime/page-runtime.ts';

const runtime = createLowCodePageRuntime();

assert.deepEqual(
  Object.keys(runtime.state),
  ['sources', 'forms', 'searches', 'grids', 'status'],
  'A page runtime must own all page-level business state.'
);

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
const [gridMaterialSource, formMaterialSource, searchMaterialSource] = await Promise.all([
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
}

assert.match(
  gridMaterialSource,
  /syncGridEvent\(payload\);[\s\S]*emitRuntimeEvent/,
  'Grid interaction state must be synchronized before its designed event is published.'
);

console.log('Low-code page runtime regression test passed.');
