import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const sourcePath = new URL(
  '../../packages/lowcode-framework/src/core/system-settings.ts',
  import.meta.url
);
const source = await readFile(sourcePath, 'utf8');
const runnableSource = source
  .replace(
    /import \{[\s\S]*?\} from 'vue';/,
    `const inject = () => null;\nconst provide = () => undefined;`
  )
  .replace(/export const systemSettingsKey/, 'const systemSettingsKey');
const transpiled = ts.transpileModule(runnableSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const runtime = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`
);
const themeSourcePath = new URL('../utils/systemSettingsTheme.ts', import.meta.url);
const themeSource = await readFile(themeSourcePath, 'utf8');
const themeTranspiled = ts.transpileModule(themeSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const themeRuntime = await import(
  `data:text/javascript;base64,${Buffer.from(themeTranspiled).toString('base64')}`
);
const settingsComposablePath = new URL('../composables/useSystemSettings.ts', import.meta.url);
const settingsComposableSource = await readFile(settingsComposablePath, 'utf8');
assert.match(
  settingsComposableSource,
  /if \(loadPromise && loadPromiseUserId === userId\) \{[\s\S]*if \(!force\) return loadPromise;[\s\S]*loadSequence \+= 1;/,
  'A forced system-settings reload must invalidate an in-flight stale request.',
);

const systemTableConfig = {
  rowHeight: 40,
  headerRowHeight: 42,
  footerRowHeight: 38,
  rowPadding: true,
  headerPadding: true,
  footerPadding: true,
};

const defaults = runtime.mergeSystemTableOptions({}, systemTableConfig);
assert.equal(defaults.cellConfig.height, 40);
assert.equal(defaults.headerCellConfig.height, 42);
assert.equal(defaults.footerCellConfig.height, 38);

const automaticHeight = runtime.mergeSystemTableOptions({}, {
  autoHeight: true,
  height: 520,
});
assert.equal(automaticHeight.height, undefined);

const explicitTableHeight = runtime.mergeSystemTableOptions(
  { height: 360 },
  { autoHeight: true, height: 520 }
);
assert.equal(explicitTableHeight.height, 360);

const fixedSystemHeight = runtime.mergeSystemTableOptions({}, {
  autoHeight: false,
  height: 520,
});
assert.equal(fixedSystemHeight.height, 520);

const normalizedMissingValues = runtime.normalizeSystemSettings({
  primary_color: null,
  language: undefined,
  table_config: {
    rowHeight: null,
  },
});
assert.equal(normalizedMissingValues.primary_color, '#2563eb');
assert.equal(normalizedMissingValues.language, 'zh-CN');
assert.equal(normalizedMissingValues.table_config.rowHeight, 40);

const normalizedNestedPrimary = runtime.normalizeSystemSettings({
  primary_color: '#2563eb',
  theme_config: {
    colors: {
      primary: '#307e4e',
    },
  },
});
assert.equal(normalizedNestedPrimary.primary_color, '#307e4e');

const normalizedTopLevelPrimary = runtime.normalizeSystemSettings({
  primary_color: '#d946ef',
  theme_config: {
    colors: {
      primary: '#307e4e',
    },
  },
});
assert.equal(normalizedTopLevelPrimary.primary_color, '#d946ef');

const explicit = runtime.mergeSystemTableOptions(
  {
    rowHeight: 31,
    headerHeight: 32,
    footerRowHeight: 33,
    cellConfig: { padding: false },
    headerCellConfig: { padding: false },
  },
  systemTableConfig
);
assert.equal(explicit.cellConfig.height, 31);
assert.equal(explicit.headerCellConfig.height, 32);
assert.equal(explicit.footerCellConfig.height, 33);
assert.equal(explicit.cellConfig.padding, false);
assert.equal(explicit.headerCellConfig.padding, false);

const nested = runtime.mergeSystemTableOptions(
  {
    cellConfig: { height: 29 },
    rowConfig: { height: 28 },
  },
  systemTableConfig
);
assert.equal(nested.cellConfig.height, 29);

const explicitZeroHeight = runtime.mergeSystemTableOptions(
  { cellConfig: { height: 0 } },
  systemTableConfig
);
assert.equal(explicitZeroHeight.cellConfig.height, 0);

const explicitAliases = runtime.mergeSystemTableOptions(
  {
    headerRowHeight: 34,
    footerHeight: 35,
  },
  systemTableConfig
);
assert.equal(explicitAliases.headerCellConfig.height, 34);
assert.equal(explicitAliases.footerCellConfig.height, 35);

const noPager = runtime.mergeSystemTableOptions({}, {
  pageSize: 50,
  pageSizes: [10, 50],
});
assert.equal(noPager.pagerConfig, undefined);

const withPager = runtime.mergeSystemTableOptions(
  { pagerConfig: { pageSize: 10 } },
  {
    pageSize: 50,
    pageSizes: [10, 50],
    showPageSize: true,
    showPageJump: true,
    showPageTotal: true,
  }
);
assert.equal(withPager.pagerConfig.pageSize, 10);
assert.deepEqual(withPager.pagerConfig.pageSizes, [10, 50]);
assert.deepEqual(withPager.pagerConfig.layouts, [
  'PrevPage',
  'JumpNumber',
  'NextPage',
  'Sizes',
  'FullJump',
  'Total',
]);

const tooltip = runtime.mergeSystemTableOptions({}, {
  tooltipPlacement: 'bottom',
});
assert.equal(tooltip.tooltipConfig.defaultPlacement, 'bottom');

const explicitTooltip = runtime.mergeSystemTableOptions(
  { tooltipConfig: { defaultPlacement: 'left' } },
  { tooltipPlacement: 'bottom' }
);
assert.equal(explicitTooltip.tooltipConfig.defaultPlacement, 'left');

assert.equal(themeRuntime.resolveThemeColor('rgb(48,126,78)'), '#307e4e');
assert.equal(themeRuntime.resolveThemeColor('rgb(100% 0% 0% / 50%)'), 'rgba(255, 0, 0, 0.5)');
assert.equal(themeRuntime.resolveThemeColor('invalid', '#abc'), '#aabbcc');
assert.equal(themeRuntime.mixThemeColors('#000000', '#ffffff', 0.5), '#808080');
assert.equal(themeRuntime.mixThemeColors('#1faf68', '#ffffff', 0.88), '#e4f5ed');
assert.equal(themeRuntime.mixThemeColors('#1faf68', '#ffffff', 0.8), '#d2efe1');
assert.match(
  settingsComposableSource,
  /'--vxe-ui-table-row-current-background-color': currentRowBackground/,
);
assert.match(
  settingsComposableSource,
  /'--vxe-ui-table-row-hover-current-background-color': currentRowHoverBackground/,
);

const defaultPager = runtime.resolveSystemPagerConfig(
  runtime.DEFAULT_SYSTEM_SETTINGS.table_config
);
assert.equal(defaultPager.pageSize, 20);
assert.equal(defaultPager.background, true);
assert.deepEqual(defaultPager.layouts, [
  'PrevPage',
  'JumpNumber',
  'NextPage',
  'Sizes',
  'FullJump',
  'Total',
]);

console.log('System settings runtime regression test passed.');
