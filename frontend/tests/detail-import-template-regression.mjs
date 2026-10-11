import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { parse } from '@vue/compiler-sfc';

const [templateModule, pickerSource, panelSource] = await Promise.all([
  import('../../packages/tldraw-vue/src/editor/detailImportTemplates.ts'),
  readFile(new URL('../../packages/tldraw-vue/src/components/DetailImportTemplatePicker.vue', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/tldraw-vue/src/components/VueDataSourcePanel.vue', import.meta.url), 'utf8'),
]);

const expected = {
  field: { hasFieldRow: true, hasChineseRow: false },
  'field-title': { hasFieldRow: true, hasChineseRow: true },
  title: { hasFieldRow: false, hasChineseRow: true },
  none: { hasFieldRow: false, hasChineseRow: false },
};
assert.deepEqual(Object.fromEntries(templateModule.detailImportTemplates.map(template => [template.id, template.config])), expected);
for (const [id, config] of Object.entries(expected)) {
  assert.equal(templateModule.getDetailImportTemplateId(config), id);
  assert.deepEqual(templateModule.getDetailImportTemplateConfig(id), config);
}

assert.match(pickerSource, /role="radiogroup"/);
assert.deepEqual(templateModule.detailImportTemplates.map(template => template.label), [
  '仅 field 行', 'field + title 行', '仅 title 行', '无表头行',
]);
assert.match(panelSource, /type: 'form', key: 'detail-import-form'/);
assert.match(panelSource, /h\(DetailImportTemplatePicker/);
assert.match(panelSource, /context\.updateModel\(value\)/);

const script = parse(panelSource).descriptor.scriptSetup.content;
const ast = ts.createSourceFile('VueDataSourcePanel.vue', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functionSource = ast.statements
  .filter(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'convertImportedRows')
  .map(statement => statement.getText(ast))
  .join('\n');
const code = ts.transpileModule(functionSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const convertImportedRows = new Function(`${code}; return convertImportedRows;`)();
const table = { columns: [{ field: 'sku', title: '商品编码' }, { field: 'qty', title: '数量' }] };
const data = ['A-001', '10'];
const matrices = {
  field: [['sku', 'qty'], data],
  'field-title': [['sku', 'qty'], ['商品编码', '数量'], data],
  title: [['商品编码', '数量'], data],
  none: [data],
};
for (const [id, matrix] of Object.entries(matrices)) {
  assert.deepEqual(convertImportedRows(matrix, table, { ...expected[id], sheetName: '', mode: 'append' }), [{ sku: 'A-001', qty: '10' }]);
}

console.log('Detail import template picker regression test passed.');
