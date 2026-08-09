import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const [
  designerSource,
  runtimeDesignerSource,
  simulatorSource,
  gridConverterSource,
  visualConverterSource,
  rendererSource,
  frontendSchemaSource,
  apiSchemaSource,
] = await Promise.all([
  readSource('../../packages/lowcode-framework/src/visual-editor/components/grid-designer/grid-designer.service.tsx'),
  readSource('../../packages/lowcode-framework/src/lowcode/block-materials/grid/runtime-grid-designer.ts'),
  readSource('../../packages/lowcode-framework/src/visual-editor/components/simulator-editor/simulator-editor.vue'),
  readSource('../../packages/lowcode-framework/src/lowcode/visual-converters/lowcode-grid/index.ts'),
  readSource('../../packages/lowcode-framework/src/lowcode/visual-converters/index.ts'),
  readSource('../../packages/lowcode-framework/src/components/LowCodePageRenderer.vue'),
  readSource('../../packages/lowcode-framework/src/lowcode/schema.ts'),
  readSource('../../api/src/lowcode-service/lowcode.schema.ts'),
]);

for (const [field, label] of [
  ['tableType', '表格类型'],
  ['tableName', '关联真实表'],
  ['viewName', '关联视图'],
]) {
  assert.match(
    designerSource,
    new RegExp(`field: '${field}'[\\s\\S]*?label: '${label}'`),
    `${label} must be present in the table basic-information form.`,
  );
}

for (const [label, value] of [
  ['普通表格', 'normal'],
  ['主表', 'main'],
  ['明细表', 'detail'],
]) {
  assert.ok(
    designerSource.includes(`{ label: '${label}', value: '${value}' }`),
    `${label} must be a selectable table type.`,
  );
}

assert.match(
  designerSource,
  /'lowcode', 'listTableColumns'[/\s\S]*field: 'tableName'[/\s\S]*optionsCode: physicalTableOptionSourceCode/,
  'Real-table selection must use the table-column metadata service and optionsCode.',
);
assert.match(
  designerSource,
  /view: 'entity-views'[/\s\S]*'entityDesign', 'listViews'[/\s\S]*readString\(view\.status\) !== 'published'[/\s\S]*'entityDesign', 'listViewColumns'/,
  'View selection must use the stored view picker, reject unpublished views, and load view columns.',
);
assert.match(
  designerSource,
  /state\.business\.tableName = kind === 'entity' \? sourceTarget : ''[/\s\S]*state\.business\.viewName = kind === 'view' \? sourceTarget : ''/,
  'Selecting one source type must clear the opposite association.',
);
assert.match(
  designerSource,
  /const changedField = readString\(event\.payload\?\.field\)[/\s\S]*if \(changedField === 'tableName'\)[/\s\S]*applyAssociationOption\('table', changedValue\)[/\s\S]*if \(changedField === 'viewName'\)[/\s\S]*applyAssociationOption\('view', changedValue\)/,
  'The association handler must read the runtime field-change payload safely before loading columns.',
);
assert.match(
  designerSource,
  /state\.business\.sourceType = kind[/\s\S]*syncBusinessSourceTarget\(\)[/\s\S]*syncActiveDesignerDialogModel\(\)[/\s\S]*loadPhysicalTableSource/,
  'Selecting an association must update the visible source metadata before column metadata finishes loading.',
);
assert.match(
  designerSource,
  /const designerFormModels = reactive<Record<string, Record<string, unknown>>>\(\{\}\)[/\s\S]*syncActiveDesignerDialogModel\(\)[/\s\S]*resetReactiveObject\(currentModel, model\)[/\s\S]*formModels: designerFormModels/,
  'Association changes must update the same reactive form-model object rendered by the open dialog.',
);
assert.match(
  designerSource,
  /const currentPostData = readPostDataObject\(currentValue\)[/\s\S]*clearSourceTargetAliases\(currentPostData, clearResource\)[/\s\S]*if \(sourceTarget\) postData\.tableName = sourceTarget/,
  'Source changes must merge into the current postData and canonicalize the target as tableName.',
);
assert.match(
  designerSource,
  /row\.fullName \?\? row\.full_name[/\s\S]*row\.schemaName \?\? row\.schema_name[/\s\S]*row\.tableName \?\? row\.table_name/,
  'Real-table selection must accept both camelCase and snake_case catalog rows.',
);
assert.doesNotMatch(
  designerSource,
  /state\.business\.postDataJson = JSON\.stringify\(\{ tableName:/,
  'Source changes must not replace all unrelated query parameters.',
);
assert.match(
  designerSource,
  /state\.business\.sourceType === 'table' && !readString\(state\.business\.tableName\)[/\s\S]*请选择关联真实表[/\s\S]*state\.business\.sourceType === 'view' && !readString\(state\.business\.viewName\)[/\s\S]*请选择关联视图/,
  'Concrete table types must not save without their required association.',
);

assert.match(
  simulatorSource,
  /business: \{[/\s\S]*tableType: block\.props\?\.tableType[/\s\S]*sourceType: block\.props\?\.sourceType[/\s\S]*tableName: block\.props\?\.tableName[/\s\S]*viewName: block\.props\?\.viewName/,
  'The visual designer must pass all association fields back into the shared grid designer.',
);
assert.match(
  gridConverterSource,
  /sourceType: association\.sourceType[/\s\S]*viewName: association\.viewName[/\s\S]*tableType[/\s\S]*sourceType: association\.sourceType[/\s\S]*tableName: association\.tableName[/\s\S]*viewName: association\.viewName/,
  'Visual-to-runtime conversion must persist source and block association metadata.',
);
assert.match(
  visualConverterSource,
  /const tableType = readGridTableType\(block, source\)[/\s\S]*const sourceType = readGridSourceType\(block, source\)[/\s\S]*tableName: sourceType === 'table'[/\s\S]*viewName: sourceType === 'view'/,
  'Runtime-to-visual conversion must restore the association metadata.',
);
assert.match(
  runtimeDesignerSource,
  /sourceType,[/\s\S]*if \(tableName\) source\.tableName = tableName[/\s\S]*if \(linkedViewName\) source\.viewName = linkedViewName/,
  'Runtime grid edits must persist the association on the data source.',
);
assert.match(
  rendererSource,
  /visualProps\.tableType = tableType[/\s\S]*visualProps\.sourceType = sourceType[/\s\S]*visualProps\.tableName = sourceType === 'table'[/\s\S]*visualProps\.viewName = sourceType === 'view'/,
  'Runtime edits must synchronize association fields into the embedded visual model.',
);
assert.match(
  rendererSource,
  /nextSchema\.visualEditor = cloneRuntimeValueWithFunctions\(props\.page\.schema\.visualEditor\)/,
  'Runtime saves must retain picker callbacks while synchronizing the live visual model.',
);

for (const [name, source] of [
  ['frontend', frontendSchemaSource],
  ['API', apiSchemaSource],
]) {
  assert.match(
    source,
    /const sourceType[^\n]*= requestedSourceType === 'custom'[/\s\S]*\.\.\.\(sourceType \? \{ sourceType \} : \{\}\)[/\s\S]*\.\.\.\(normalizedViewName \? \{ viewName: normalizedViewName \} : \{\}\)/,
    `${name} schema normalization must retain sourceType and viewName.`,
  );
}

const frameworkRoot = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const bundledGridConverter = await build({
  entryPoints: [
    fileURLToPath(new URL('lowcode/visual-converters/lowcode-grid/index.ts', frameworkRoot)),
  ],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const gridConverterModule = await import(
  `data:text/javascript;base64,${Buffer.from(bundledGridConverter.outputFiles[0].text).toString('base64')}`
);
const gridConverter = gridConverterModule.default;

function createVisualGrid(props) {
  return {
    _vid: 'grid-source-test',
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
      sourceKey: 'records',
      showRowActions: false,
      columns: [{ field: 'id', title: 'ID' }],
      ...props,
    },
  };
}

function convertGrid(props) {
  const dataSources = {};
  const block = gridConverter.toRuntimeBlock(createVisualGrid(props), {
    dataSources,
    convertBlocks: () => [],
    convertOverlays: () => [],
  });
  return { block, source: dataSources.records };
}

const viewConversion = convertGrid({
  tableType: 'detail',
  sourceType: 'view',
  tableName: 'public.stale_table',
  viewName: 'public.sales_summary',
  serviceName: 'admin',
  serviceMethod: 'listItems',
  postDataJson: JSON.stringify({
    table_name: 'public.stale_table',
    entityCode: 'stale_entity',
    resource: 'stale_resource',
    filters: { status: 'active' },
    sorts: [{ field: 'created_at', direction: 'desc' }],
    limit: 25,
  }),
});
assert.equal(viewConversion.block.tableType, 'detail');
assert.equal(viewConversion.block.sourceType, 'view');
assert.equal(viewConversion.block.tableName, '');
assert.equal(viewConversion.block.viewName, 'public.sales_summary');
assert.equal(viewConversion.source.sourceType, 'view');
assert.equal(viewConversion.source.tableName, 'public.sales_summary');
assert.equal(viewConversion.source.viewName, 'public.sales_summary');
assert.deepEqual(viewConversion.source.postData, {
  filters: { status: 'active' },
  sorts: [{ field: 'created_at', direction: 'desc' }],
  limit: 25,
  tableName: 'public.sales_summary',
});

const customConversion = convertGrid({
  tableType: 'main',
  sourceType: 'custom',
  tableName: '',
  viewName: '',
  serviceName: 'reporting',
  serviceMethod: 'runReport',
  postDataJson: JSON.stringify({
    tableName: 'intentional_custom_argument',
    resource: 'custom_report',
    filters: { enabled: true },
  }),
});
assert.equal(customConversion.source.sourceType, 'custom');
assert.equal(customConversion.block.tableType, 'main');
assert.equal(customConversion.block.sourceType, 'custom');
assert.equal(customConversion.source.tableName, undefined);
assert.equal(customConversion.source.viewName, undefined);
assert.deepEqual(customConversion.source.postData, {
  tableName: 'intentional_custom_argument',
  resource: 'custom_report',
  filters: { enabled: true },
});

const bundledApiSchema = await build({
  entryPoints: [
    fileURLToPath(new URL('../../api/src/lowcode-service/lowcode.schema.ts', import.meta.url)),
  ],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const apiSchemaModule = await import(
  `data:text/javascript;base64,${Buffer.from(bundledApiSchema.outputFiles[0].text).toString('base64')}`
);
const schemaFixture = {
  code: 'grid-source-roundtrip',
  route: '/grid-source-roundtrip',
  title: 'Grid source round trip',
  blocks: [],
  dataSources: {
    custom: {
      key: 'custom',
      sourceType: 'custom',
      serviceName: 'reporting',
      serviceMethod: 'runReport',
      tableName: 'stale_top_level_table',
      viewName: 'stale_top_level_view',
      postData: customConversion.source.postData,
    },
    view: {
      ...viewConversion.source,
      tableName: 'public.stale_table',
    },
  },
};
const apiNormalized = apiSchemaModule.normalizeLowCodePageSchema(schemaFixture);
assert.equal(apiNormalized.dataSources.custom.tableName, undefined);
assert.equal(apiNormalized.dataSources.custom.viewName, undefined);
assert.deepEqual(apiNormalized.dataSources.custom.postData, customConversion.source.postData);
assert.equal(apiNormalized.dataSources.view.sourceType, 'view');
assert.equal(apiNormalized.dataSources.view.tableName, 'public.sales_summary');
assert.equal(apiNormalized.dataSources.view.viewName, 'public.sales_summary');
const inferredViewNormalized = apiSchemaModule.normalizeLowCodePageSchema({
  ...schemaFixture,
  dataSources: {
    inferredView: {
      key: 'inferredView',
      sourceType: 'view',
      serviceName: 'admin',
      serviceMethod: 'listItems',
      tableName: 'public.inferred_summary',
      postData: { limit: 10 },
    },
  },
});
assert.equal(
  inferredViewNormalized.dataSources.inferredView.viewName,
  'public.inferred_summary',
);

const bundledFrontendSchema = await build({
  entryPoints: [fileURLToPath(new URL('lowcode/schema.ts', frameworkRoot))],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  plugins: [
    {
      name: 'stub-block-materials',
      setup(buildApi) {
        buildApi.onResolve({ filter: /^\.\/block-materials$/ }, () => ({
          path: 'block-materials-stub',
          namespace: 'grid-source-test',
        }));
        buildApi.onLoad({ filter: /.*/, namespace: 'grid-source-test' }, () => ({
          contents: 'export const getLowCodeBlockMaterial = () => undefined;',
          loader: 'js',
        }));
      },
    },
  ],
});
const frontendSchemaModule = await import(
  `data:text/javascript;base64,${Buffer.from(bundledFrontendSchema.outputFiles[0].text).toString('base64')}`
);
const frontendNormalized = frontendSchemaModule.normalizeLowCodePageSchema(schemaFixture);
assert.deepEqual(frontendNormalized.dataSources, apiNormalized.dataSources);

console.log('Grid designer table source properties regression test passed.');
