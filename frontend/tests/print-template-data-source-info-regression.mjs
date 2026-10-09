import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { parse } from '@vue/compiler-sfc';
import { ref } from 'vue';

async function functionsFromVue(path, names) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const script = parse(source).descriptor.scriptSetup.content;
  const ast = ts.createSourceFile(path, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return ts.transpileModule(ast.statements.filter(statement =>
    ts.isFunctionDeclaration(statement) && names.includes(statement.name?.text),
  ).map(statement => statement.getText(ast)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
}

const page = { id: 'page:one', name: '第一页' };
const instance = {
  getCurrentPageId: () => page.id,
  getPages: () => [page],
  getPageShapeIds: () => new Set(),
  getContentFromCurrentPage: () => ({ shapes: [], bindings: [], assets: [], rootShapeIds: [], schema: {} }),
  resolveAssetsInContent: async content => content,
};
const editor = ref(instance);
const source = ref({
  type: 'inline', formCode: 'print-source.orders',
  rows: [{ customer: '张三', items: [{ sku: 'A001' }] }],
  detailTables: [{ id: 'items', field: 'items', columns: [{ field: 'sku', title: '物料' }] }],
});
const workspace = { pageSizeMm: { w: 100, h: 150 } };
const designerCode = await functionsFromVue('../../packages/tldraw-vue/src/TldrawVue.vue', [
  'cloneTemplateValue', 'getPrintDataSource', 'getTemplateInfo',
]);
const designer = new Function('editor', 'getEditorPrintDataSource', 'getWorkspaceTemplateConfig',
  `${designerCode}\nreturn { getPrintDataSource, getTemplateInfo };`,
)(editor, () => source, () => workspace);

const info = await designer.getTemplateInfo();
assert.deepEqual(info.workspace.printDataSource, source.value);
assert.deepEqual(info.content.workspace.printDataSource, source.value);
info.workspace.printDataSource.rows[0].customer = '修改副本';
assert.equal(source.value.rows[0].customer, '张三', 'Returned values must not mutate live form data.');
assert.equal(workspace.printDataSource, undefined, 'Snapshot must not mutate workspace settings.');

const materialCode = await functionsFromVue('../../packages/lowcode-framework/src/lowcode/block-materials/label-designer/LabelDesignerMaterial.vue', [
  'clone', 'workspace', 'getTemplateInfo',
]);
const material = new Function('designer', 'waitForEditor', 'templateId', 'templateName', 'templateStatus', 'templateVersion',
  `${materialCode}\nreturn { getTemplateInfo };`,
)({ value: { ...designer, getWorkspaceTemplateConfig: () => workspace } }, async () => instance,
  ref('template:one'), ref('订单'), ref('active'), ref(1));
const runtimeInfo = await material.getTemplateInfo();
assert.equal(runtimeInfo.workspace.printDataSource.formCode, 'print-source.orders');
assert.equal(runtimeInfo.workspace.printDataSource.rows[0].customer, '张三');
assert.deepEqual(runtimeInfo.content.workspace.printDataSource, source.value);
source.value.rows[0].customer = '李四';
assert.equal((await material.getTemplateInfo()).workspace.printDataSource.rows[0].customer, '李四', 'Action must read current data.');
runtimeInfo.workspace.printDataSource.detailTables[0].columns[0].title = '副本';
assert.equal(source.value.detailTables[0].columns[0].title, '物料');
source.value = { type: 'none' };
assert.deepEqual((await material.getTemplateInfo()).workspace.printDataSource, { type: 'none' });
console.log('Verified runtime getTemplateInfo returns current cloned print data source, formCode and rows, including empty pages.');
