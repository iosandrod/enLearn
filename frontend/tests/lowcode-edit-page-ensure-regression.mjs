import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const [source, rendererSource, dashboardSource] = await Promise.all([
  readFile(
    new URL('../../packages/lowcode-framework/src/runtime/lowcode-pages.ts', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../../packages/lowcode-framework/src/components/LowCodePageRenderer.vue', import.meta.url),
    'utf8',
  ),
  readFile(new URL('../layouts/dashboard.vue', import.meta.url), 'utf8'),
]);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { ensureLowCodeEditPage } = await import(moduleUrl);

function pageRecord(overrides = {}) {
  return {
    id: 'list-page-id',
    code: 'lowcode-pages',
    route: '/dashboard/low-code',
    title: '低代码页面管理',
    description: null,
    layout: 'dashboard',
    status: 'published',
    keep_alive: true,
    page_type: 'list',
    edit_page_id: null,
    view_name: null,
    table_name: 'lowcode_pages',
    relate_config: { category: 'system' },
    schema: {
      code: 'lowcode-pages',
      route: '/dashboard/low-code',
      title: '低代码页面管理',
      blocks: [],
    },
    version: 1,
    published_at: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

const createdEditPage = pageRecord({
  id: 'edit-page-id',
  code: 'lowcode-pages-edit',
  route: '/dashboard/low-code/edit',
  title: '低代码页面管理编辑',
  page_type: 'edit',
  table_name: 'lowcode_pages',
});

const createCalls = [];
const createApi = {
  async invoke(serviceName, serviceMethod, payload) {
    createCalls.push({ serviceName, serviceMethod, payload });
    if (serviceMethod === 'listItems') return [];
    if (serviceMethod === 'saveItem') return createdEditPage;
    throw new Error(`Unexpected call: ${serviceName}.${serviceMethod}`);
  },
};
const createSource = pageRecord();
assert.equal(await ensureLowCodeEditPage(createApi, createSource), createdEditPage);
assert.equal(createSource.edit_page_id, createdEditPage.id);
assert.deepEqual(
  createCalls.map((call) => call.serviceMethod),
  ['listItems', 'saveItem'],
  'A missing conventional edit page must be created before navigation.',
);
const createPayload = createCalls[1].payload;
assert.equal(createPayload.resource, 'lowcode_pages');
assert.equal(createPayload.data.code, 'lowcode-pages-edit');
assert.equal(createPayload.data.route, '/dashboard/low-code/edit');
assert.equal(createPayload.data.page_type, 'edit');
assert.equal(createPayload.data.table_name, 'lowcode_pages');
assert.deepEqual(createPayload.data.relate_config, createSource.relate_config);
assert.equal(createPayload.data.schema.pageType, 'edit');
assert.deepEqual(createPayload.data.schema.blocks, []);
assert.equal(createPayload.data.__details[0].resource, 'lowcode_page_versions');
assert.deepEqual(createPayload.afterSave[0].data, {
  edit_page_id: { $ref: 'saved.id' },
});
assert.deepEqual(createPayload.afterSave[0].where, { id: 'list-page-id' });

const linkedCalls = [];
const linkedApi = {
  async invoke(serviceName, serviceMethod, payload) {
    linkedCalls.push({ serviceName, serviceMethod, payload });
    if (serviceMethod === 'listItems') return [createdEditPage];
    throw new Error(`Unexpected call: ${serviceName}.${serviceMethod}`);
  },
};
const linkedSource = pageRecord({ edit_page_id: createdEditPage.id });
assert.equal(await ensureLowCodeEditPage(linkedApi, linkedSource), createdEditPage);
assert.deepEqual(linkedCalls.map((call) => call.serviceMethod), ['listItems']);
assert.deepEqual(linkedCalls[0].payload.filters, { id: createdEditPage.id });

const repairCalls = [];
const repairApi = {
  async invoke(serviceName, serviceMethod, payload) {
    repairCalls.push({ serviceName, serviceMethod, payload });
    if (serviceMethod === 'listItems') return [createdEditPage];
    if (serviceMethod === 'saveItem') return pageRecord({ edit_page_id: createdEditPage.id });
    throw new Error(`Unexpected call: ${serviceName}.${serviceMethod}`);
  },
};
const repairSource = pageRecord();
assert.equal(await ensureLowCodeEditPage(repairApi, repairSource), createdEditPage);
assert.equal(repairSource.edit_page_id, createdEditPage.id);
assert.deepEqual(repairCalls.map((call) => call.serviceMethod), ['listItems', 'saveItem']);
assert.deepEqual(repairCalls[1].payload, {
  resource: 'lowcode_pages',
  id: 'list-page-id',
  data: { edit_page_id: createdEditPage.id },
});

const staleCalls = [];
const staleApi = {
  async invoke(serviceName, serviceMethod, payload) {
    staleCalls.push({ serviceName, serviceMethod, payload });
    if (serviceMethod === 'listItems' && payload.filters.id) return [];
    if (serviceMethod === 'listItems' && payload.filters.code) return [createdEditPage];
    if (serviceMethod === 'saveItem') return pageRecord({ edit_page_id: createdEditPage.id });
    throw new Error(`Unexpected call: ${serviceName}.${serviceMethod}`);
  },
};
const staleSource = pageRecord({ edit_page_id: 'deleted-edit-page-id' });
assert.equal(await ensureLowCodeEditPage(staleApi, staleSource), createdEditPage);
assert.equal(staleSource.edit_page_id, createdEditPage.id);
assert.deepEqual(
  staleCalls.map((call) => call.serviceMethod),
  ['listItems', 'listItems', 'saveItem'],
  'A stale edit_page_id must fall back to the conventional code and repair the relation.',
);

assert.match(
  rendererSource,
  /async function resolveAssociatedEditPage\(\)[\s\S]*props\.page\.page_type === 'list'[\s\S]*ensureLowCodeEditPage\(host\.getServiceApi\(\), props\.page\)/,
  'Grid edit navigation must ensure the associated edit-page record exists.',
);
assert.match(
  rendererSource,
  /navigateToEdit: async \(row = \{\}\)[\s\S]*resolveEditPageRoute/,
  'The built-in create and edit functions must share the ensured edit-page route.',
);
assert.match(
  dashboardSource,
  /async function openLowCodeEditPage\([\s\S]*ensureLowCodeEditPage\(serviceApi, page\)[\s\S]*router\.push\(editPage\.route\)/,
  'The dashboard edit-page command must use the same create-before-navigation behavior.',
);

console.log('Low-code edit-page ensure regression test passed.');
