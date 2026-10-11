import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../../', import.meta.url);
const frameworkRoot = new URL('packages/lowcode-framework/src/', root);

async function bundleModule(path) {
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL(path, frameworkRoot))],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
  );
}

const queryLogic = await bundleModule('lowcode/search-query-logic.ts');

assert.deepEqual(queryLogic.reconcileLowCodeSearchQueryLogic([
  { inputField: 'keyword', field: 'name', op: 'like' },
  { inputField: 'removed', field: 'removed', op: 'eq' },
], [{ field: 'keyword' }, { field: 'added' }]), [
  { inputField: 'keyword', field: 'name', logic: 'and', op: 'like', enabled: true },
  { inputField: 'added', field: 'added', logic: 'and', op: 'eq', enabled: true },
], 'Saved rules must follow current fields, remove stale fields, and include added fields.');
assert.deepEqual(queryLogic.reconcileLowCodeSearchQueryLogic([], [{ field: 'keyword' }]), [],
  'Opening an unconfigured form must not change legacy search behavior.');

const legacyValues = { name: 'Alice', status: '', tags: [] };
assert.equal(
  queryLogic.createLowCodeSearchFilters(legacyValues, []),
  legacyValues,
  'An unconfigured search form must keep the legacy filter object.',
);

const filters = queryLogic.createLowCodeSearchFilters(
  { keyword: 'Acme', status: 'active', age: 18, ignored: '' },
  [
    { inputField: 'keyword', field: 'name', op: 'like', logic: 'and', enabled: true },
    { inputField: 'status', field: 'status', op: 'eq', logic: 'or', enabled: true },
    { inputField: 'age', field: 'age', op: 'gte', logic: 'and', enabled: true },
    { inputField: 'ignored', field: 'note', op: 'eq', logic: 'and', enabled: true },
    { inputField: 'unused', field: 'deleted_at', op: 'isNull', logic: 'and', enabled: true },
  ],
);

assert.deepEqual(filters, {
  logic: 'and',
  conditions: [
    {
      logic: 'and',
      conditions: [
        {
          logic: 'or',
          conditions: [
            { field: 'name', op: 'like', value: 'Acme' },
            { field: 'status', op: 'eq', value: 'active' },
          ],
        },
        { field: 'age', op: 'gte', value: 18 },
      ],
    },
    { field: 'deleted_at', op: 'isNull' },
  ],
}, 'Mixed conditions must be left-associative, skip empty values, and keep null checks.');

assert.equal(queryLogic.matchesLowCodeSearchFilters(
  { name: 'North Acme Branch', status: 'inactive', age: 20, deleted_at: null },
  filters,
), true, 'LIKE must use contains semantics and the complete filter tree must match.');
assert.equal(queryLogic.matchesLowCodeSearchFilters(
  { name: 'north acme branch' },
  { field: 'name', op: 'like', value: 'Acme' },
), false, 'LIKE must remain case-sensitive.');
assert.equal(queryLogic.matchesLowCodeSearchFilters(
  { name: 'north acme branch' },
  { field: 'name', op: 'ilike', value: 'Acme' },
), true, 'ILIKE must ignore case.');
assert.equal(queryLogic.matchesLowCodeSearchFilters(
  { name: null }, { field: 'name', op: 'notLike', value: 'Acme' },
), false, 'SQL comparisons must not match null cells.');

const searchConverter = (await bundleModule('lowcode/visual-converters/lowcode-search-form/index.ts')).default;
const rules = [{ inputField: 'keyword', field: 'name', logic: 'or', op: 'like', enabled: true }];
const converted = searchConverter.toRuntimeBlock({
  _vid: 'query-regression', componentKey: 'lowcode-search-form', props: {
    fields: [{ field: 'keyword', label: 'Name', component: 'vxe-input' }],
    queryLogic: rules,
  },
});
assert.deepEqual(converted.queryLogic, rules);
assert.deepEqual(converted.schema.queryLogic, rules,
  'Query rules must persist both on the runtime block and in the canonical schema.');

const formConverter = (await bundleModule('lowcode/visual-converters/lowcode-edit-form/index.ts')).default;
const convertedForm = formConverter.toRuntimeBlock({
  _vid: 'ordinary-search', componentKey: 'form', props: {
    blockId: 'ordinary-search', formType: 'search', queryLogic: rules,
    fields: [{ field: 'keyword', label: 'Name', component: 'vxe-input' }],
  },
});
assert.equal(convertedForm.formType, 'search');
assert.deepEqual(convertedForm.queryLogic, rules);
assert.deepEqual(convertedForm.schema.queryLogic, rules);

const { DataSourceRequestResolver } = await bundleModule('runtime/data-source-request-resolver.ts');
const searchState = { value: { records: filters } };
const resolver = new DataSourceRequestResolver({
  props: { page: { schema: { blocks: [converted] } } },
  host: { getRoute: () => ({}) }, runtime: {},
  resolvedData: { value: {} }, formModels: { value: {} },
  searchFilters: searchState, gridStates: { value: {} },
  selectedCategoryId: { value: '' }, flattenPageBlocks: () => [converted],
});
const source = { serviceName: 'admin', serviceMethod: 'listItems', postData: {
  table: 'test', filters: {
    tenant_id: 12, tags: ['a', 'b'], archived_at: null,
    name: 'Acme', status: 'active', age: 18,
  },
} };
assert.deepEqual(resolver.resolveRequest('records', source).postData.filters, {
  logic: 'and', conditions: [
    { logic: 'and', conditions: [
      { field: 'tenant_id', op: 'eq', value: 12 },
      { field: 'tags', op: 'in', value: ['a', 'b'] },
      { field: 'archived_at', op: 'isNull' },
    ] }, filters,
  ],
}, 'Configured data-source filters must retain array/null semantics beside a query group.');
searchState.value.records = { keyword: 'Acme' };
assert.deepEqual(resolver.resolveRequest('records', {
  serviceName: 'admin', serviceMethod: 'listItems', postData: { table: 'test' },
}).postData.filters, {
  logic: 'and', conditions: [{ field: 'name', op: 'like', value: 'Acme' }],
}, 'Raw search state must also use the form query rules when constructing requests.');
searchState.value.records = {};
const liveModelResolver = new DataSourceRequestResolver({
  props: { page: { schema: { blocks: [converted] } } },
  host: { getRoute: () => ({}) }, runtime: {},
  resolvedData: { value: {} }, formModels: { value: { [converted.id]: { keyword: 'Live' } } },
  searchFilters: searchState, gridStates: { value: {} },
  selectedCategoryId: { value: '' }, flattenPageBlocks: () => [converted],
});
assert.deepEqual(liveModelResolver.resolveRequest('records', {
  serviceName: 'admin', serviceMethod: 'listItems', postData: { table: 'test' },
}).postData.filters, {
  logic: 'and', conditions: [{ field: 'name', op: 'like', value: 'Live' }],
}, 'Grid actions fired before default submit handling must use the live query form model.');

const renamedGrid = {
  id: 'vid_877ad5473e', kind: 'grid', tableType: 'default', sourceKey: 'vid_877ad5473e',
  schema: { grid: { columns: [] } },
};
const renamedSourceResolver = new DataSourceRequestResolver({
  props: { page: { schema: {
    blocks: [converted, renamedGrid],
    dataSources: { vid_877ad5473e: { key: 'vid_877ad5473e' } },
  } } },
  host: { getRoute: () => ({}) }, runtime: {}, resolvedData: { value: {} },
  formModels: { value: { [converted.id]: { keyword: '生产' } } },
  searchFilters: { value: {} }, gridStates: { value: {} }, selectedCategoryId: { value: '' },
  flattenPageBlocks: () => [converted, renamedGrid],
});
assert.deepEqual(renamedSourceResolver.resolveRequest('vid_877ad5473e', {
  serviceName: 'admin', serviceMethod: 'listItems', postData: { tableName: 'forms' },
}).postData.filters, {
  logic: 'and', conditions: [{ field: 'name', op: 'like', value: '生产' }],
}, 'A stale legacy target key must follow the only list grid after its source key changes.');

const [panelSource, tableSource, runtimeDesignerSource, searchConverterSource, rendererSource, scriptRuntimeSource] = await Promise.all([
  readFile(new URL('visual-editor/components/right-attribute-panel/index.tsx', frameworkRoot), 'utf8'),
  readFile(new URL('visual-editor/components/right-attribute-panel/components/query-logic/QueryLogicTable.vue', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/block-materials/runtime-form-designer.ts', frameworkRoot), 'utf8'),
  readFile(new URL('lowcode/visual-converters/lowcode-search-form/index.ts', frameworkRoot), 'utf8'),
  readFile(new URL('runtime/useLowCodePageRenderer.ts', frameworkRoot), 'utf8'),
  readFile(new URL('runtime/lowcode-page-script-runtime.ts', frameworkRoot), 'utf8'),
]);

assert.match(panelSource, /name="hooks"[\s\S]*?label="\u67e5\u8be2\u903b\u8f91" name="query-logic"/,
  'The query logic tab must follow the hooks tab.');
assert.match(panelSource, /formDesignerMode\.value === 'search'/,
  'The form designer must only expose query logic in search mode.');
for (const operator of ['eq', 'like', 'ilike', 'in', 'between', 'isNull', 'contains', 'containedBy', 'overlaps']) {
  assert.match(tableSource, new RegExp(`value: '${operator}'`), `Missing query operator ${operator}.`);
}
assert.match(runtimeDesignerSource,
  /if \(designed\.queryLogic\) schema\.queryLogic = cloneValue\(designed\.queryLogic\)/,
  'Runtime form design must persist query logic into the form schema.');
assert.match(searchConverterSource, /queryLogic:/,
  'The search-form converter must preserve query logic.');
assert.match(rendererSource,
  /block\.kind === 'form' && block\.formType === 'search'[\s\S]*?applySearchSubmit\(searchBlock, values\)/,
  'A regular form switched to search mode must execute search instead of save behavior.');
assert.match(rendererSource,
  /async function handleFormSubmit[\s\S]*?block\.formType === 'search'[\s\S]*?applySearchSubmit\(block as LowCodePageFormBlock, values\)/,
  'Direct form-submit events must also query when the form type is search.');
assert.match(scriptRuntimeSource,
  /case 'source\.invoke':[\s\S]*?resolveDataSourceRequest\(sourceKey, source, postData, true\)/,
  'Grid data actions must merge configured search logic into their requests.');

console.log('Low-code search query logic regression checks passed.');
