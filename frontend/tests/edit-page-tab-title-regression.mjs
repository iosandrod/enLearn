import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const utilitySource = await readFile(
  new URL('../utils/dashboardTabs.ts', import.meta.url),
  'utf8'
);
const layoutSource = await readFile(
  new URL('../layouts/dashboard.vue', import.meta.url),
  'utf8'
);

const compiledUtility = ts.transpileModule(utilitySource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const utilityUrl = `data:text/javascript;base64,${Buffer.from(compiledUtility).toString('base64')}`;
const { formatDashboardTabTitle } = await import(utilityUrl);

assert.equal(formatDashboardTabTitle('下拉数据', 'edit'), '下拉数据编辑');
assert.equal(formatDashboardTabTitle('下拉数据编辑', 'edit'), '下拉数据编辑');
assert.equal(formatDashboardTabTitle('下拉数据', 'list'), '下拉数据');
assert.equal(formatDashboardTabTitle('下拉数据', 'custom'), '下拉数据');

assert.match(
  layoutSource,
  /getLowCodePage\(serviceApi, \{[\s\S]*?route: path,[\s\S]*?includeData: false[\s\S]*?\}\)/,
  'The dashboard must resolve page metadata from the current low-code route.'
);
assert.match(
  layoutSource,
  /formatDashboardTabTitle\(title, page\.page_type\)/,
  'The dashboard tab title must be formatted from the persisted page type.'
);
assert.match(
  layoutSource,
  /formatDashboardTabTitle\(activeTitle\.value, existingTab\?\.pageType\)/,
  'Menu refreshes must preserve the edit suffix after page metadata has been resolved.'
);
assert.match(
  layoutSource,
  /refreshLowCodeTabTitle\(current\.path, activeTitle\.value\)/,
  'Page-type refreshes must recalculate the suffix from the original menu title.'
);

console.log('Edit-page dashboard tab title regression test passed.');
