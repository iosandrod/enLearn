import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const bundled = await build({
  stdin: {
    contents: `
      export { createRenderer, defineComponent, h, nextTick, reactive } from 'vue';
      export { useLowCodePagePagination } from '../packages/lowcode-framework/src/runtime/useLowCodePagePagination.ts';
      export { DataSourceRequestResolver } from '../packages/lowcode-framework/src/runtime/data-source-request-resolver.ts';
      export { PageSchemaRepository } from '../packages/lowcode-framework/src/runtime/page-schema-repository.ts';
    `,
    resolveDir: resolve(import.meta.dirname, '..'),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { createRenderer, defineComponent, h, nextTick, reactive,
  useLowCodePagePagination, DataSourceRequestResolver, PageSchemaRepository } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`,
);
const page = reactive({
  id: 'list', page_type: 'list',
  schema: {
    dataSources: {
      orders: { key: 'orders', tableName: 'orders', postData: { pageSize: 10, offset: 90, filters: { status: 'draft' } } },
      lines: { key: 'lines', tableName: 'lines' },
    },
    blocks: [
      { id: 'lines-grid', kind: 'grid', tableType: 'detail', sourceKey: 'lines', schema: { grid: {} } },
      { id: 'orders-grid', kind: 'grid', tableType: 'main', sourceKey: 'orders', categoryField: 'category_id', schema: { grid: {} } },
    ],
  },
});
const runtime = { state: reactive({ sources: {}, searches: {}, status: { loadingSourceKeys: [], dataLoading: false, mesCommandExecuting: false } }) };
const selectedCategoryId = { value: '' };
const repository = new PageSchemaRepository(() => page);
const requests = [];
let pagination;
let resolver;
const renderer = createRenderer({
  createElement: () => ({}), insert() {}, remove() {}, patchProp() {},
  setElementText() {}, createText: () => ({}), setText() {},
  createComment: () => ({}), parentNode: () => null, nextSibling: () => null,
});
const app = renderer.createApp(defineComponent({
  setup() {
    pagination = useLowCodePagePagination({
      getPage: () => page, getBlocks: repository.flattenPageBlocks, runtime,
      refreshDataSources: async (keys) => {
        for (const key of keys) requests.push(resolver.resolveRequest(key, page.schema.dataSources[key]));
        return [];
      },
    });
    resolver = new DataSourceRequestResolver({
      props: { page }, runtime, host: {}, resolvedData: { value: runtime.state.sources },
      formModels: { value: {} }, searchFilters: { value: runtime.state.searches }, gridStates: { value: {} },
      selectedCategoryId, flattenPageBlocks: repository.flattenPageBlocks,
      applyPagination: pagination.applyPagination,
    });
    return () => h('fixture');
  },
}));
app.mount({});
try {
  assert.equal(pagination.pagerSourceKey.value, 'orders', 'The footer must target the main table, not the first detail table.');
  const initial = resolver.resolveRequest('orders', page.schema.dataSources.orders).postData;
  assert.equal(initial.responseMode, 'page');
  assert.equal(initial.page, 1);
  assert.equal(initial.pageSize, 10);
  assert.equal(initial.offset, 0, 'A configured offset must not override the current page.');
  assert.deepEqual(initial.filters, { status: 'draft' });
  const detail = resolver.resolveRequest('lines', page.schema.dataSources.lines).postData;
  assert.equal(detail.responseMode, undefined, 'Details must keep their existing requests.');
  assert.equal(page.schema.dataSources.orders.postData.offset, 90, 'Pagination must not mutate the saved schema.');

  runtime.state.sources.orders = { rows: [{ id: 1 }], total: 101, page: 1, pageSize: 10 };
  await nextTick();
  assert.equal(pagination.pageVO.total, 101, 'The total must use the server count, not the row count.');
  await pagination.pageChangeEvent({ type: 'current', currentPage: 3, pageSize: 10 });
  assert.equal(requests.at(-1).postData.page, 3);
  assert.equal(requests.at(-1).postData.offset, 20);
  await pagination.pageChangeEvent({ type: 'size', currentPage: 3, pageSize: 50 });
  assert.equal(requests.at(-1).postData.page, 1);
  assert.equal(requests.at(-1).postData.pageSize, 50);

  await pagination.pageChangeEvent({ type: 'current', currentPage: 2, pageSize: 50 });
  runtime.state.searches.orders = { customer_id: 'customer-1' };
  const searched = resolver.resolveRequest('orders', page.schema.dataSources.orders).postData;
  assert.equal(searched.page, 1, 'New searches must start on the first page.');
  assert.deepEqual(searched.filters, { status: 'draft', customer_id: 'customer-1' });
  await pagination.pageChangeEvent({ type: 'current', currentPage: 2, pageSize: 50 });
  selectedCategoryId.value = 'category-1';
  const categorized = resolver.resolveRequest('orders', page.schema.dataSources.orders).postData;
  assert.equal(categorized.page, 1);
  assert.equal(categorized.filters.category_id, 'category-1');

  const count = requests.length;
  runtime.state.status.loadingSourceKeys = ['orders'];
  await pagination.pageChangeEvent({ type: 'current', currentPage: 2, pageSize: 50 });
  assert.equal(requests.length, count, 'Loading must prevent duplicate page changes.');
  runtime.state.status.loadingSourceKeys = [];
  page.id = 'next-list';
  assert.equal(pagination.pageVO.currentPage, 1);
  assert.equal(pagination.pageVO.pageSize, 10);
  assert.equal(pagination.pageVO.total, 0);
  page.page_type = 'edit';
  assert.equal(pagination.isListPage.value, false);
  assert.equal(pagination.pagerSourceKey.value, '');
  assert.equal(resolver.resolveRequest('orders', page.schema.dataSources.orders).postData.responseMode, undefined);
  console.log('Low-code page pagination regression test passed.');
} finally {
  app.unmount();
}
