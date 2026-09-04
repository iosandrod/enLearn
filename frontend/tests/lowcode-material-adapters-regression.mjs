import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const source = await readFile(
  new URL('packages/lowcode-framework/src/lowcode/material-runtime/material-adapters.ts', root),
  'utf8',
);
const catalog = await readFile(
  new URL('packages/lowcode-framework/src/lowcode/material-runtime/catalog.ts', root),
  'utf8',
);
const migration = await readFile(
  new URL('supabase/migrations/20260904100000_lowcode_materials.sql', root),
  'utf8',
);

const pageCodes = [
  'container', 'section', 'text', 'tabs', 'toolbar', 'buttonGroup', 'form',
  'searchForm', 'grid', 'detail', 'modal', 'drawer', 'statCard', 'tree',
  'planningFlow', 'planningGantt', 'planningBom',
];
const formCodes = [
  'vxe-input', 'vxe-textarea', 'vxe-password-input', 'lc-number-input',
  'lc-basic-control', 'lc-color-picker', 'lc-json-editor', 'lc-option-select',
  'lc-sub-form', 'lc-monaco-editor', 'base-info', 'lc-array-table', 'lc-cascader',
  'vxe-switch', 'vxe-select', 'vxe-checkbox-group', 'vxe-radio-group',
  'vxe-tree-select',
];

assert.equal(pageCodes.length, 17);
assert.equal(formCodes.length, 18);
for (const code of pageCodes) {
  assert.match(source, new RegExp(`type: '${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  assert.match(migration, new RegExp(`'page',\\s*'${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
}
for (const code of formCodes) {
  assert.match(source, new RegExp(`'${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}',`));
  assert.match(migration, new RegExp(`'form',\\s*'${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
}

for (const capability of [
  'createDefaultContainerBlock',
  'createDefaultFormBlock',
  'createDefaultGridBlock',
  'createDefaultPlanningBomBlock',
  'buttonGroupConverter',
  'editFormConverter',
  'gridConverter',
  'planningConverter',
  'tabsConverter',
]) {
  assert.match(source, new RegExp(`\\b${capability}\\b`));
}

assert.match(source, /getLowCodeBlockMaterialAdapter/);
assert.match(source, /getLowCodeFormMaterialAdapter/);
assert.match(catalog, /\.\.\.adapter,[\s\S]*?component: result\.component/);
console.log('Low-code material adapter coverage regression test passed.');
