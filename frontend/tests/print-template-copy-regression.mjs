import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { parse } from '@vue/compiler-sfc';
import { ref, toRef } from 'vue';

// Run the actual material controller with an in-memory editor and database.
const source = await readFile(new URL('../../packages/lowcode-framework/src/lowcode/block-materials/label-designer/LabelDesignerMaterial.vue', import.meta.url), 'utf8');
const script = parse(source).descriptor.scriptSetup.content;
const ast = ts.createSourceFile('LabelDesignerMaterial.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const code = ts.transpileModule(ast.statements.filter((statement) => !ts.isImportDeclaration(statement)).map((statement) => statement.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const clone = (value) => structuredClone(value);
const createContent = (shapes = [], bindings = [], assets = []) => ({
  schema: { schemaVersion: 2 }, shapes, bindings, assets, users: [],
  rootShapeIds: shapes.map((shape) => shape.id),
});
const shape = (id, pageId, type, props) => ({
  id, type, typeName: 'shape', parentId: pageId, x: 10, y: 20, props,
  rotation: 0, opacity: 1, index: id === 'shape:image' ? 'a2' : 'a1', meta: {},
});
const initialPages = [
  { id: 'page:first', name: '封面', content: createContent([
    shape('shape:rich', 'page:first', 'vue-rich-text', { content: '<p><strong>未保存的修改</strong></p>' }),
    shape('shape:image', 'page:first', 'vue-image', { assetId: 'asset:image' }),
  ], [{ id: 'binding:1', fromId: 'shape:rich', toId: 'shape:image' }], [{ id: 'asset:image', props: { src: 'data:image/png;base64,test' } }]) },
  { id: 'page:second', name: '明细', content: createContent([
    shape('shape:text', 'page:second', 'vue-text', { text: '{{customer}}', expression: 'context => context.row.customer' }),
  ]) },
  { id: 'page:empty', name: '空白页', content: createContent() },
];
const initialWorkspace = { pageSizeMm: { w: 100, h: 150 }, background: { imageUrl: '/background.png' }, guides: [{ x: 20 }], dataSource: { table: 'orders' } };
let pages = clone(initialPages);
let currentPageId = 'page:second';
let workspace = clone(initialWorkspace);
const config = { templateId: 'old-template', templateName: '订单模板', templateVersion: 8, templateStatus: 'active', templateDirty: true };
let failSnapshot = false;
let inserted = 0;
const editor = {
  getPages: () => [...pages],
  getPage: (id) => pages.find((page) => page.id === id),
  getCurrentPageId: () => currentPageId,
  setCurrentPage: (id) => { currentPageId = id; },
  getPageShapeIds: (id) => new Set(editor.getPage(id).content.shapes.map((shape) => shape.id)),
  getCurrentPageShapeIdsSorted: () => [...editor.getPageShapeIds(currentPageId)],
  getContentFromCurrentPage: (_ids, id = currentPageId) => clone(editor.getPage(id).content),
  resolveAssetsInContent: async (content) => {
    if (failSnapshot) throw new Error('asset resolution failed');
    return content;
  },
  deleteShapes: (ids) => {
    for (const page of pages) {
      page.content.shapes = page.content.shapes.filter((shape) => !ids.includes(shape.id));
      page.content.bindings = page.content.bindings.filter((binding) => !ids.includes(binding.fromId) && !ids.includes(binding.toId));
    }
  },
  deletePage: (id) => { pages = pages.filter((page) => page.id !== id); },
  createPage: ({ id, name }) => { pages.push({ id, name, content: createContent() }); },
  renamePage: (id, name) => { editor.getPage(id).name = name; },
  selectNone() {},
  run: (fn) => fn(),
  store: { mergeRemoteChanges: (fn) => fn(), ensureStoreIsUsable() {} },
  putContentOntoCurrentPage: (content, options) => {
    assert.deepEqual(options, { preservePosition: true, preserveIds: false, select: false });
    editor.getPage(currentPageId).content = clone(content);
    inserted++;
  },
};
const db = new Map([['old-template', { id: 'old-template', name: '订单模板', content: clone(initialPages), version: 8 }]]);
const oldRecord = clone(db.get('old-template'));
const saveRequests = [];
const host = {
  getRoute: () => ({ query: { templateId: 'old-template' } }),
  getServiceApi: () => ({ invoke: async (_service, action, request) => {
    if (action === 'listItems') return [];
    assert.equal(action, 'saveItem');
    saveRequests.push(clone(request));
    const record = { id: request.id || 'new-template', ...clone(request.data) };
    db.set(record.id, record);
    return record;
  } }),
};
let controller;
const init = new Function('ref', 'toRef', 'inject', 'nextTick', 'onMounted', 'onBeforeUnmount', 'defineProps', 'useLowCodeHost', 'registerLowCodeMaterialRuntimeController', 'setTimeout', `${code}\nreturn { designer, markDirty };`);
const state = init(ref, toRef, () => config, async () => {}, (fn) => fn(), () => {},
  () => ({ block: { id: 'designer', templateId: 'old-template' }, resolvedData: {} }),
  () => host, (_id, value) => { controller = value; return () => {}; }, () => 0);
state.designer.value = {
  getEditor: () => editor,
  getWorkspaceTemplateConfig: () => workspace,
  resetWorkspaceTemplateConfig: () => { workspace = {}; },
  applyWorkspaceTemplateConfig: (value) => { workspace = clone(value); },
};

const copied = await controller.copyData();
assert.deepEqual(copied.pages, initialPages, 'Copy must include every page, rich text, expressions, bindings and assets.');
assert.deepEqual(copied.workspace, initialWorkspace);
assert.equal(copied.currentPageId, 'page:second');
assert.equal(inserted, 3, 'Empty pages must also be preserved.');
assert.equal(copied.templateId, '');
assert.equal(copied.templateVersion, 1);
assert.equal(copied.templateName, '订单模板（副本）');
assert.equal(copied.templateStatus, '尚未保存');
assert.equal(config.templateDirty, true, 'The copied document must need saving.');
assert.equal(saveRequests.length, 0, 'Copy must not persist before the user saves.');

await controller.save({ templateInfo: { ...copied, preview: 'data:image/png;base64,test' } });
assert.equal(Object.hasOwn(saveRequests[0], 'id'), false, 'Saving the copy must insert even when block/route contain the old ID.');
assert.deepEqual(db.get('old-template'), oldRecord, 'The original saved template must remain unchanged.');
assert.equal(config.templateId, 'new-template');
assert.equal(config.templateDirty, false);
await controller.save({ templateInfo: { ...copied, preview: 'data:image/png;base64,test' } });
assert.equal(saveRequests[1].id, 'new-template', 'Later saves must update the new template.');

failSnapshot = true;
const beforeFailure = clone(pages);
await assert.rejects(controller.copyData(), /asset resolution failed/);
assert.deepEqual(pages, beforeFailure, 'Snapshot errors must not clear the current document.');
assert.equal(config.templateId, 'new-template');
failSnapshot = false;
await controller.resetData();
assert.equal(pages.length, 1);
assert.equal(pages[0].content.shapes.length, 0);
assert.deepEqual(workspace, {});
assert.equal(config.templateId, '');
assert.equal(config.templateDirty, false);
console.log('Verified template copy, multipage content/workspace, new identity, independent saves, and capture failure handling.');
