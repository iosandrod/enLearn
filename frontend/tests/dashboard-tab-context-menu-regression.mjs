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
const { closeDashboardTabs } = await import(utilityUrl);

const tabs = [
  { path: '/dashboard/one', title: 'One' },
  { path: '/dashboard/two', title: 'Two' },
  { path: '/dashboard/three', title: 'Three' },
  { path: '/dashboard/four', title: 'Four' },
];
const paths = (items) => items.map((tab) => tab.path);

assert.deepEqual(paths(closeDashboardTabs(tabs, '/dashboard/two', 'current')), [
  '/dashboard/one',
  '/dashboard/three',
  '/dashboard/four',
]);
assert.deepEqual(paths(closeDashboardTabs(tabs, '/dashboard/three', 'left')), [
  '/dashboard/three',
  '/dashboard/four',
]);
assert.deepEqual(paths(closeDashboardTabs(tabs, '/dashboard/two', 'right')), [
  '/dashboard/one',
  '/dashboard/two',
]);
assert.deepEqual(paths(closeDashboardTabs(tabs, '/dashboard/three', 'others')), [
  '/dashboard/three',
]);
assert.deepEqual(
  paths(closeDashboardTabs(tabs, '/dashboard/missing', 'others')),
  paths(tabs),
  'An unknown target must leave the tab list unchanged.'
);

assert.match(
  layoutSource,
  /@contextmenu\.prevent\.stop="openTabContextMenu\(\$event, tab\)"/,
  'Dashboard tabs must open their menu from a native right click.'
);
assert.match(layoutSource, /name: '重新加载页面'/);
assert.match(
  layoutSource,
  /if \(option\.code === 'reload-page'\) void reloadVisitedTab\(tab\)/,
  'The reload menu item must reload the tab selected from the context menu.'
);
assert.match(
  layoutSource,
  /async function reloadVisitedTab\(tab: VisitedTab\) \{\s*routeCache\.invalidate\(tab\.path\);\s*await nextTick\(\);\s*if \(route\.path !== tab\.path\) await router\.push\(tab\.path\);\s*\}/,
  'Reloading a tab must invalidate its cache before opening it.'
);
assert.match(layoutSource, /name: '关闭当前'/);
assert.match(layoutSource, /name: '关闭左侧'/);
assert.match(layoutSource, /name: '关闭右侧'/);
assert.match(layoutSource, /name: '关闭其他'/);
assert.match(layoutSource, /name: '可视化设计'/);
assert.match(
  layoutSource,
  /disabled: !pageCode/,
  'Visual design must be disabled when a tab is not backed by a low-code page.'
);
assert.match(
  layoutSource,
  /if \(!visitedTabs\.value\.some\(\(tab\) => tab\.path === path\)\) return;/,
  'A late metadata response must not restore a tab that the user closed.'
);
assert.match(
  layoutSource,
  /const adjacentTab = scope === 'current'[\s\S]*?remainingTabs\[Math\.min\(targetIndex, remainingTabs\.length - 1\)\][\s\S]*?: tab;/,
  'Closing the current active tab must prefer its right-hand neighbor, then its left-hand neighbor.'
);
assert.match(
  layoutSource,
  /await router\.push\(adjacentTab\?\.path \?\? '\/dashboard'\)/,
  'Closing the final active tab must return to the dashboard.'
);

console.log('Dashboard tab context-menu regression test passed.');
