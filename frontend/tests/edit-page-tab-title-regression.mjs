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
const { formatDashboardTabTitle, resolveDashboardNavigationTitle } = await import(utilityUrl);

assert.equal(formatDashboardTabTitle('下拉数据', 'edit'), '下拉数据编辑');
assert.equal(formatDashboardTabTitle('下拉数据编辑', 'edit'), '下拉数据编辑');
assert.equal(formatDashboardTabTitle('下拉数据', 'list'), '下拉数据');
assert.equal(formatDashboardTabTitle('下拉数据', 'custom'), '下拉数据');

const planningNavigation = [
  { path: '/dashboard/planning', title: '排产管理' },
  { path: '/dashboard/planning/setupmatrix', title: '换型矩阵' },
  { path: '/dashboard/planning/resourceskill', title: '资源技能' },
];
assert.equal(
  resolveDashboardNavigationTitle(planningNavigation, '/dashboard/planning/setupmatrix'),
  '换型矩阵',
  'An exact planning page must take precedence over its parent menu group.'
);
assert.equal(
  resolveDashboardNavigationTitle(planningNavigation, '/dashboard/planning/resourceskill/edit'),
  '资源技能',
  'A nested route must use its most specific menu ancestor.'
);
assert.equal(
  resolveDashboardNavigationTitle(planningNavigation, '/dashboard/unknown'),
  '工作台'
);

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
assert.match(
  layoutSource,
  /resolveDashboardNavigationTitle\([\s\S]*?flatMenu\.value[\s\S]*?route\.path/,
  'Dashboard tabs must resolve the most specific navigation item for the active route.'
);

console.log('Edit-page dashboard tab title regression test passed.');
