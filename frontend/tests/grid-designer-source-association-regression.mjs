import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const designerSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/visual-editor/components/grid-designer/grid-designer.service.tsx',
    import.meta.url,
  ),
  'utf8',
);
const pageGridSource = await readFile(
  new URL(
    '../../packages/lowcode-framework/src/lowcode/block-materials/grid/index.vue',
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

for (const [code, label, kind] of [
  ['associate-entity', '关联实体', 'entity'],
  ['associate-view', '关联视图', 'view'],
]) {
  assert.match(designerSource, new RegExp(`code: '${code}'`));
  assert.match(designerSource, new RegExp(`label: '${label}'`));
  assert.ok(
    designerSource.includes(`execute: async () => openSourcePicker('${kind}')`),
    `${label} must open its source picker.`,
  );
}

assert.match(
  designerSource,
  /confirmLowCodePage\(\{[\s\S]*page: createSourcePickerPage\(kind, sourceOptions\)[\s\S]*requireSelection: true/,
  'Entity and view association must use the system low-code confirmation dialog.',
);

assert.match(
  designerSource,
  /'entityDesign',\s*'listDesign'/,
  'Entity association must load entity metadata through entityDesign.listDesign.',
);
assert.match(
  designerSource,
  /'entityDesign', 'listViews'[\s\S]*status: 'published'/,
  'View association must only offer published managed views.',
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
  simulatorSource,
  /serviceApi = host\.getServiceApi\(\)[\s\S]*\$\$gridDesigner\(\{[\s\S]*serviceApi,/,
  'The visual page designer must pass its host service API into the shared table designer.',
);

console.log('Grid designer source association regression test passed.');
