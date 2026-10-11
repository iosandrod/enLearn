import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const framework = new URL('../../packages/lowcode-framework/src/', import.meta.url);
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('runtime/search-model-controller.ts', framework))],
  bundle: true, format: 'esm', platform: 'node', write: false,
});
const { SearchModelController } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

const query = {
  id: 'query-form', kind: 'searchForm', targetSourceKey: 'records',
  schema: { fields: [{ field: 'name' }] },
  queryLogic: [{ inputField: 'name', field: 'name', op: 'ilike', logic: 'and' }],
};
const form = { id: 'plain-search', kind: 'form', formType: 'search', schema: { fields: [{ field: 'status' }] } };
const active = {
  id: 'model-1', page_code: 'orders', name: '生产', active: true,
  query_values: { forms: { 'query-form': { name: '生产' }, 'plain-search': { status: 'open' } } },
};
const second = {
  id: 'model-2', page_code: 'orders', name: '采购', active: false,
  query_values: { forms: { 'query-form': { name: '采购' } } },
};

function fixture(rows = [active, second]) {
  const events = [];
  let page = { id: 'orders-id', code: 'orders', page_type: 'list' };
  const runtime = {
    state: { forms: { 'query-form': { name: '默认' }, 'plain-search': { status: 'draft' } }, searches: {} },
    replaceForm(id, values) { this.state.forms[id] = values; events.push('bind'); },
    replaceSearch(id, values) { this.state.searches[id] = values; },
  };
  const calls = [];
  const errors = [];
  let failMethod;
  const controller = new SearchModelController({
    getPage: () => page, getBlocks: () => [query, form], runtime,
    getSourceKeys: (block) => block.kind === 'searchForm' ? ['records'] : [block.id],
    getApi: () => ({ invoke: async (service, method, payload) => {
      calls.push({ service, method, payload: structuredClone(payload) });
      events.push(method);
      if (method === failMethod) throw new Error('Request failed');
      if (method === 'listSearchModels') return structuredClone(rows);
      if (method === 'saveSearchModel') return { ...structuredClone(second), active: true, query_values: payload.queryValues };
      if (method === 'createSearchModel') return { id: 'new-model', page_code: page.code, name: payload.name, active: true, query_values: payload.queryValues };
      assert.fail(`Unexpected method ${method}`);
    } }),
    refresh: async (keys) => { events.push('refresh'); assert.deepEqual(keys, ['records', 'plain-search']); },
    commitForms: async () => { events.push('commit'); runtime.state.forms['query-form'] = { name: '最新输入' }; },
    reportError: (error) => errors.push(error),
  });
  return { controller, runtime, calls, events, errors, get page() { return page; },
    setPage(next) { page = next; }, fail(method) { failMethod = method; } };
}

const f = fixture();
assert.equal(f.controller.enabled(query), true);
assert.equal(f.controller.enabled(form), true);
assert.equal(f.controller.enabled({ kind: 'form', formType: 'edit' }), false);
await f.controller.hydrate(f.page);
assert.deepEqual(f.runtime.state.forms['query-form'], { name: '生产' });
assert.deepEqual(f.runtime.state.searches.records, {
  logic: 'and', conditions: [{ field: 'name', op: 'ilike', value: '生产' }],
});
assert.equal(f.controller.state.activeId, active.id);
assert.equal(f.events.includes('refresh'), false, 'Hydration must let the initial data load query exactly once.');
f.runtime.state.forms['query-form'].name = '编辑但未查询';
await f.controller.hydrate(f.page);
assert.equal(f.calls.length, 1, 'Same-page refresh must not rehydrate and erase edits.');
assert.equal(f.runtime.state.forms['query-form'].name, '编辑但未查询');

f.events.length = 0;
await f.controller.select(second);
assert.equal(f.calls.at(-1).payload.modelId, second.id);
assert.equal(f.controller.state.activeId, second.id);
assert.deepEqual(f.runtime.state.forms['query-form'], { name: '采购' });
assert.deepEqual(f.runtime.state.forms['plain-search'], { status: 'draft' }, 'Missing form values use defaults, not the previous scheme.');
assert.ok(f.events.indexOf('saveSearchModel') < f.events.indexOf('bind'));
assert.ok(f.events.indexOf('bind') < f.events.indexOf('refresh'));
assert.equal(f.controller.state.models.filter((row) => row.active).length, 1);

f.events.length = 0;
assert.equal(await f.controller.create('  新方案  '), true);
assert.equal(f.calls.at(-1).method, 'createSearchModel', 'Create must not update the active row.');
assert.equal(f.calls.at(-1).payload.name, '新方案');
assert.deepEqual(f.calls.at(-1).payload.queryValues.forms['query-form'], { name: '最新输入' });
assert.equal(f.controller.state.models.length, 3);
assert.equal(f.controller.state.activeId, 'new-model');
assert.ok(f.events.indexOf('commit') < f.events.indexOf('createSearchModel'));
assert.ok(f.events.indexOf('createSearchModel') < f.events.indexOf('refresh'));

f.fail('createSearchModel');
assert.equal(await f.controller.create('失败方案'), false);
assert.equal(f.controller.state.activeId, 'new-model');
assert.equal(f.controller.state.loading, false);
assert.equal(f.errors.length, 1);

const empty = fixture([]);
await empty.controller.hydrate(empty.page);
assert.deepEqual(empty.runtime.state.forms['query-form'], { name: '默认' });
empty.controller.acceptSaved(active);
assert.equal(empty.controller.state.models.length, 1, 'First grid auto-save must immediately populate the tabs.');
empty.controller.acceptSaved({ ...active, page_code: 'other' });
assert.equal(empty.controller.state.models.length, 1);

const failed = fixture();
failed.fail('listSearchModels');
await assert.rejects(failed.controller.hydrate(failed.page), /Request failed/);
assert.equal(failed.controller.state.ready, false, 'Failed reads must stop the initial grid from overwriting saved values.');

const edit = fixture();
edit.setPage({ id: 'edit', code: 'edit', page_type: 'edit' });
await edit.controller.hydrate(edit.page);
assert.equal(edit.calls.length, 0);
assert.equal(edit.controller.enabled(query), false);

const controllerSource = await readFile(new URL('runtime/page-data-controller.ts', framework), 'utf8');
assert.ok(controllerSource.indexOf('await this.dependencies.hydrateSearchModels?.(nextPage)')
  < controllerSource.indexOf('const errors = await this.loadDataSourceWaves(entries, pageBlocks, sources)'),
'Scheme restoration must precede the initial grid requests.');
const service = await readFile(new URL('../../api/src/lowcode-service/lowcode.service.ts', import.meta.url), 'utf8');
assert.match(service, /case 'createSearchModel':[\s\S]*this\.createSearchModel\(postData, context\)/);
assert.match(service, /private async createSearchModel[\s\S]*getCurrentUser\(context\)[\s\S]*\.insert\([\s\S]*active: true/);
assert.match(service, /private async listSearchModels[\s\S]*getCurrentUser\(context\)[\s\S]*\.eq\('page_code', pageCode\)/);
const tabs = await readFile(new URL('components/LowCodeSearchModelTabs.vue', framework), 'utf8');
assert.match(tabs, /confirmForm\(\{[\s\S]*formCode: SEARCH_MODEL_FORM_CODE/);
assert.doesNotMatch(tabs, /<VxeModal|<VxeInput/, 'The create dialog must be database-backed, not hard-coded in the tab component.');
const formMigration = await readFile(new URL('../../supabase/migrations/20261012140000_admin_search_model_form.sql', import.meta.url), 'utf8');
assert.match(formMigration, /'admin\.search-model\.create'[\s\S]*"field": "name"[\s\S]*"required": true/);
console.log('Search model hydration, switching, creation, and failure regression checks passed.');
