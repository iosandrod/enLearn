import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readLowCodeMaterialSource } from './lowcode-material-source.mjs';

const designerSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/visual-editor/components/grid-designer/grid-designer.service.tsx',
    import.meta.url,
  ),
  'utf8',
);
const pageGridSource = await readLowCodeMaterialSource('page', 'grid');
const runtimeGridDesignerSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/lowcode/block-materials/grid/runtime-grid-designer.ts',
    import.meta.url,
  ),
  'utf8',
);
const pageDataSourcesSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/runtime/page-data-sources.ts',
    import.meta.url,
  ),
  'utf8',
);
const simulatorSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/visual-editor/components/simulator-editor/simulator-editor.vue',
    import.meta.url,
  ),
  'utf8',
);
const migrationSource = await readFile(
  new URL('../../supabase/migrations/20260826130000_grid_designer_form_schemas.sql', import.meta.url),
  'utf8',
);

for (const [code, label, kind] of [
  ['associate-entity', '关联实体', 'entity'],
  ['associate-view', '关联视图', 'view'],
]) {
  assert.match(
    migrationSource,
    new RegExp(`"code": "${code}", "label": "${label}"`),
  );
  assert.ok(
    designerSource.includes(`execute: async () => openSourcePicker('${kind}')`),
    `${label} must open its source picker.`,
  );
}

assert.match(
  migrationSource,
  /"code": "sync-table-comments", "label": "同步列注释"/,
);
assert.match(
  designerSource,
  /execute: async \(\) => syncColumnsFromTableComments\(\)/,
  'The column designer must expose the real-table comment sync action.',
);
assert.match(
  designerSource,
  /function parseColumnCommentOverrides[\s\S]*JSON\.parse\(rawComment\)[\s\S]*isPlainRecord\(metadata\)[\s\S]*metadata\.title[\s\S]*metadata\.type/,
  'Only JSON object comments may provide title and type overrides.',
);
assert.match(
  designerSource,
  /const syncColumnsFromTableComments = async[\s\S]*readString\(state\.business\.tableName\)[\s\S]*'lowcode', 'listTableColumns'[\s\S]*parseColumnCommentOverrides\(column\.comment\)[\s\S]*overridesByField\.get\(readString\(column\.field\)\)[\s\S]*\.\.\.overrides[\s\S]*syncActiveDesignerDialogModel\(\)/,
  'Comment sync must fetch the associated real table and overwrite matching column titles and types.',
);

assert.match(
  designerSource,
  /confirmLowCodePage\(\{[\s\S]*pageCode: gridDesignerSourcePageCodes\[kind\][\s\S]*includeData: true[\s\S]*requireSelection: true/,
  'Entity and view association must render the stored low-code page without rebuilding it.',
);
assert.doesNotMatch(
  designerSource,
  /function createSourcePickerPage|page: createSourcePickerPage/,
  'Association must not transform source data into a temporary low-code page.',
);
assert.match(
  designerSource,
  /entity: 'admin-system-entities'[\s\S]*view: 'entity-views'/,
  'Entity and view association must open their original stored low-code pages.',
);

assert.match(
  designerSource,
  /'entityDesign',\s*'listDesign'/,
  'Entity association must load entity metadata through entityDesign.listDesign.',
);
assert.match(
  designerSource,
  /'entityDesign', 'listViews'[\s\S]*id: readString\(row\.id\)[\s\S]*readString\(view\.status\) !== 'published'/,
  'The selected view must be loaded from its original row and must be published before import.',
);
assert.match(
  designerSource,
  /'entityDesign', 'listViewColumns'/,
  'View association must load the selected view columns.',
);
assert.match(
  designerSource,
  /const columns = mergeColumnsFromSource\(state\.columns, source\.columns\)[\s\S]*state\.columns = columns[\s\S]*state\.business\.serviceName = 'admin'[\s\S]*state\.business\.serviceMethod = 'listItems'[\s\S]*state\.business\.postDataJson[\s\S]*syncActiveDesignerDialogModel\(\)/,
  'Association must add or overwrite imported columns and synchronize the grid data source.',
);
assert.match(
  designerSource,
  /function mergeColumnsFromSource[\s\S]*importedByField\.get\(field\)[\s\S]*\.\.\.importedColumn[\s\S]*importedColumns\.filter/,
  'Matching fields must be overwritten while fields absent from the grid are appended.',
);
assert.match(
  designerSource,
  /if \(!readString\(state\.business\.sourceKey\)\) \{[\s\S]*state\.business\.sourceKey = createSourceKey\(source\)/,
  'Association must preserve the grid source key so stale page data sources are not orphaned.',
);
assert.match(
  designerSource,
  /filter\(\(column\) => readString\(column\.storage_kind, 'physical'\) !== 'virtual'\)/,
  'Entity association must not import metadata-only virtual columns into a physical table query.',
);
assert.match(
  designerSource,
  /primaryKey: readString\(table\.primary_key\)[\s\S]*readString\(column\.column_name\) === readString\(table\.primary_key\)/,
  'Entity association must honor the entity-level primary key when column metadata is incomplete.',
);
assert.match(
  designerSource,
  /resolvedServiceApi = typeof useServiceApi === 'function'[\s\S]*serviceApi: resolvedServiceApi/,
  'The standalone designer service must capture the host service API before mounting.',
);
assert.match(
  pageGridSource,
  /serviceApi = host\.getServiceApi\(\)[\s\S]*openRuntimeGridDesigner\(props\.block, runtimeBlockEditor, serviceApi\)/,
  'Runtime page grids must pass the host service API into the shared table designer.',
);
assert.match(
  runtimeGridDesignerSource,
  /pageSchema = runtimeBlockEditor\.getPageSchema\?\.\(\)[\s\S]*?dataSources: pageSchema \? collectLowCodePageDataSources\(pageSchema\) : undefined/,
  'Runtime grid design must provide page data sources so parent fields can resolve dynamically.',
);
assert.match(
  pageDataSourcesSource,
  /collectLowCodePageDataSources[\s\S]*?block\.kind === 'form' && block\.dataSource[\s\S]*?dataSources\[block\.id\][\s\S]*?key: block\.id/,
  'Page data-source collection must include form-owned sources used by main tables.',
);
assert.match(
  simulatorSource,
  /const createGridDesignerDataSources[\s\S]*?collectLowCodePageDataSources\([\s\S]*?props\.pageRecord\?\.schema\?\.dataSources[\s\S]*?converted\.dataSources[\s\S]*?blocks: converted\.blocks[\s\S]*?dataSources: createGridDesignerDataSources\(\)/,
  'Visual grid design must merge saved and canvas page sources for parent-field selection.',
);
assert.match(
  simulatorSource,
  /serviceApi = host\.getServiceApi\(\)[\s\S]*\$\$gridDesigner\(\{[\s\S]*serviceApi,/,
  'The visual page designer must pass its host service API into the shared table designer.',
);

console.log('Grid designer source association regression test passed.');
