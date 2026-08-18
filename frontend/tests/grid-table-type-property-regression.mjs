import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const readFrameworkSource = (path) => readFile(new URL(path, frameworkRoot), 'utf8');

const [
  gridComponentSource,
  materialPropsSource,
  gridConverterSource,
  runtimeToVisualSource,
  gridDesignerSource,
  gridTypesSource,
  migrationSource,
] = await Promise.all([
  readFrameworkSource('packages/business-component/lowcode-grid/index.tsx'),
  readFrameworkSource('visual-editor/material-prop-forms/materials/page-blocks.ts'),
  readFrameworkSource('lowcode/visual-converters/lowcode-grid/index.ts'),
  readFrameworkSource('lowcode/visual-converters/index.ts'),
  readFrameworkSource('visual-editor/components/grid-designer/grid-designer.service.tsx'),
  readFrameworkSource('types/lowcode.ts'),
  readFile(
    new URL('../../supabase/migrations/20260811140000_grid_table_type_property.sql', import.meta.url),
    'utf8',
  ),
]);

assert.match(gridComponentSource, /tableType:\s*createEditorSelectProp\(/);
assert.match(gridComponentSource, /label:\s*'表格类型'/);
for (const value of ['main', 'detail', 'default']) {
  assert.match(
    gridComponentSource,
    new RegExp(`label: '${value}', value: '${value}'`),
    `The grid table type selector must include ${value}.`,
  );
}

assert.match(materialPropsSource, /field:\s*'tableType'[\s\S]*?component:\s*'lc-option-select'/);
assert.match(materialPropsSource, /field:\s*'tableType'[\s\S]*?defaultValue:\s*'default'/);
assert.match(gridConverterSource, /tableType:\s*'default'/);
assert.match(gridDesignerSource, /GridDesignerTableType = 'main' \| 'detail' \| 'default'/);
for (const value of ['main', 'detail', 'default']) {
  assert.match(
    gridDesignerSource,
    new RegExp(`label: '${value}', value: '${value}'`),
    `The full grid designer must include ${value}.`,
  );
}
assert.doesNotMatch(gridDesignerSource, /label: '普通表格', value: 'normal'/);
assert.match(
  runtimeToVisualSource,
  /tableType === 'normal'\) return 'default'[\s\S]*tableType === 'default'/,
);
assert.match(gridTypesSource, /tableType\?: 'main' \| 'detail' \| 'default'/);
assert.match(migrationSource, /where code = 'material-prop\.lowcode-grid'/);
assert.match(migrationSource, /"field":"tableType"/);

const bundledConverter = await build({
  entryPoints: [
    fileURLToPath(
      new URL('lowcode/visual-converters/lowcode-grid/index.ts', frameworkRoot),
    ),
  ],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const converterModule = await import(
  `data:text/javascript;base64,${Buffer.from(bundledConverter.outputFiles[0].text).toString('base64')}`
);
const converter = converterModule.default;

function convertGrid(tableType) {
  const dataSources = {};
  return converter.toRuntimeBlock({
    _vid: 'grid-table-type-test',
    componentKey: 'lowcode-grid',
    type: 'lowcode-grid',
    label: 'Grid',
    moduleName: 'businessComponents',
    focus: false,
    styles: {},
    layout: {},
    hasResize: false,
    draggable: true,
    showStyleConfig: true,
    animations: [],
    actions: [],
    events: [],
    model: {},
    props: {
      blockId: 'records-grid',
      title: 'Records',
      tableType,
      sourceKey: 'records',
      sourceType: 'custom',
      serviceName: 'admin',
      serviceMethod: 'listItems',
      showRowActions: false,
      columns: [{ field: 'id', title: 'ID' }],
    },
  }, {
    dataSources,
    convertBlocks: () => [],
    convertOverlays: () => [],
  });
}

for (const tableType of ['main', 'detail', 'default']) {
  assert.equal(convertGrid(tableType).tableType, tableType);
}
assert.equal(convertGrid('normal').tableType, 'default');
assert.equal(convertGrid('unsupported').tableType, 'default');

console.log('Grid table type property regression test passed.');
