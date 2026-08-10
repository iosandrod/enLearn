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
const formDefinitionSource = await readFile(
  new URL('../utils/lowCodeFormDefinitions.ts', import.meta.url),
  'utf8'
);
const designDialogSource = await readFile(
  new URL('../../packages/lowcode-framework/src/designer/design-dialog.ts', import.meta.url),
  'utf8'
);
const visualDesignerSource = await readFile(
  new URL('../../packages/lowcode-framework/src/components/LowCodeVisualDesigner.vue', import.meta.url),
  'utf8'
);
const visualProviderSource = await readFile(
  new URL('../../packages/lowcode-framework/src/components/VisualEditorProvider.vue', import.meta.url),
  'utf8'
);
const formDefinitionMigration = await readFile(
  new URL('../../supabase/migrations/20260808200000_lowcode_form_definitions.sql', import.meta.url),
  'utf8'
);
const entityLoadTablesFormMigration = await readFile(
  new URL(
    '../../supabase/migrations/20260808210000_entity_design_load_physical_tables_form.sql',
    import.meta.url
  ),
  'utf8'
);
const allFormDefinitionMigrations =
  `${formDefinitionMigration}\n${entityLoadTablesFormMigration}`;

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
assert.match(layoutSource, /name: '页面信息设计'/);
assert.match(
  layoutSource,
  /disabled: !pageCode/,
  'Visual design must be disabled when a tab is not backed by a low-code page.'
);
assert.match(
  layoutSource,
  /if \(option\.code === 'open-page-info-designer'\) \{\s*void openLowCodePageInfoDesignerByCode\(pageCode, tab\);\s*\}/,
  'The page information action must edit the low-code page behind the selected tab.'
);
assert.match(
  layoutSource,
  /if \(option\.code === 'open-visual-designer'\) \{\s*void openLowCodeDesignerByCode\(pageCode, tab\);\s*\}/,
  'The visual-design action must open the selected page in the shared design dialog.'
);
assert.match(
  layoutSource,
  /openDesignDialog\(\{[\s\S]*?id: VISUAL_DESIGN_DIALOG_ID,[\s\S]*?code: pageCode,[\s\S]*?serviceApi,[\s\S]*?router/,
  'Dashboard visual design must use openDesignDialog instead of navigating away.'
);
assert.doesNotMatch(
  layoutSource,
  /async function openLowCodeDesignerByCode[\s\S]*?router\.push\(\{ path: `\/dashboard\/low-code\/designer\/\$\{pageCode\}` \}\)/,
  'Opening the visual designer from a tab must not navigate to the standalone route.'
);
assert.match(
  designDialogSource,
  /export function openDesignDialog[\s\S]*?openGlobalDialog\(\{[\s\S]*?body: \(\) => h\(DesignerComponent/,
  'The shared design dialog must be implemented on top of the global-dialog service.'
);
assert.match(
  designDialogSource,
  /onConfirm: async \(\) => \{[\s\S]*?await controller\.save\(\)/,
  'Confirming the shared design dialog must save through its designer controller.'
);
assert.match(
  visualDesignerSource,
  /:show-global-dialog-host="!embedded"/,
  'An embedded visual designer must reuse the outer global-dialog host.'
);
assert.match(
  visualDesignerSource,
  /provideLowCodeHost\(\{[\s\S]*?serviceApi: computed\(\(\) => props\.serviceApi\)/,
  'The embedded designer must provide its host dependencies to nested visual-editor components.'
);
assert.match(
  visualProviderSource,
  /<GlobalDialogHost v-if="showGlobalDialogHost" \/>/,
  'The visual editor provider must allow an embedding dialog to disable its nested host.'
);
assert.match(
  layoutSource,
  /title: '页面信息设计'[\s\S]*?resource: 'lowcode_pages'[\s\S]*?data: buildPageInfoSaveData\(currentPage, value\)/,
  'Page information design must open an editor and persist the updated page metadata.'
);
assert.match(
  layoutSource,
  /loadLowCodeFormDefinition\(\s*serviceApi,\s*PAGE_INFO_DESIGN_FORM_CODE,\s*\)[\s\S]*?hydratePageInfoDesignSchema\(\s*formDefinition\.schema,\s*currentPage,\s*\)/,
  'Page information design must load and hydrate its form schema from the form-definition resource.'
);
assert.match(
  layoutSource,
  /form: \{\s*schema: formSchema,[\s\S]*?className: 'dashboard-page-info-design-form'/,
  'The dialog must render one low-code form backed by the combined page information schema.'
);
assert.doesNotMatch(
  layoutSource,
  /content: \{\s*type: 'tabs'[\s\S]*?key: 'page-info-tabs'/,
  'Page information tabs must not be modeled with the dialog content protocol.'
);
assert.match(
  formDefinitionMigration,
  /"field": "functions"[\s\S]*?"component": "lc-array-table"[\s\S]*?"label": "新增函数"[\s\S]*?"component": "lc-monaco-editor"/,
  'Page functions must be editable as a structured array with a Monaco script editor.'
);
assert.match(
  formDefinitionMigration,
  /'page-info-design'[\s\S]*?"kind": "tabs"[\s\S]*?"key": "basic"[\s\S]*?"key": "functions"[\s\S]*?"key": "apis"/,
  'The database seed must define the page-information form as one tabbed low-code form schema.'
);
assert.match(
  formDefinitionSource,
  /resource: 'lowcode_form_definitions'[\s\S]*?filters: \{ code: requestedCodes, enabled: true \}/,
  'Only enabled database form definitions with the requested codes may be loaded.'
);
assert.match(
  formDefinitionSource,
  /contextSource: createPageFunctionContextSource\(page\)/,
  'The current page context must be injected after the database schema is loaded.'
);
for (const code of [
  'account-profile',
  'account-email',
  'dashboard-settings',
  'post-editor',
  'lowcode-page-editor',
  'entity-design-table',
  'entity-design-column',
  'entity-design-columns',
  'entity-design-relation',
  'entity-design-left-panel',
  'entity-design-right-panel',
  'entity-design-load-physical-tables',
  'page-info-design',
]) {
  assert.match(
    allFormDefinitionMigrations,
    new RegExp(`'${code}'`),
    `The database migration must seed the ${code} form definition.`,
  );
}
assert.doesNotMatch(
  layoutSource,
  /const pageInfoBasicFields|function createPageInfoDesignSchema|const pageApiDesignField/,
  'The page-information form schema must not remain hard-coded in the dashboard layout.'
);
assert.match(
  layoutSource,
  /buildPageInfoSaveData,[\s\S]*?createPageInfoDesignForm,[\s\S]*?normalizePageInfoDesignForm/,
  'Page information design must use the tested functions/API round-trip serializer.'
);
assert.match(
  layoutSource,
  /replaceVisitedTabPageInfo\(tab, page\);\s*showPageInfoDesignMessage\('页面信息已保存。', 'success'\);\s*await reloadVisitedTab\(tab\);\s*replaceVisitedTabPageInfo\(tab, page\);/,
  'Saving page information must keep the selected tab metadata after its runtime page reloads.'
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
