import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(
  new URL('../../packages/lowcode-framework/src/runtime/lowcode-pages.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { ensureLowCodePageForRoute } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`,
);

const calls = [];
const createdPage = {
  id: 'page-1',
  code: 'system-form',
  route: '/dashboard/system-form',
  title: '系统表单',
  page_type: 'custom',
  layout: 'dashboard',
  status: 'published',
  keep_alive: true,
  edit_page_id: null,
  schema: { code: 'system-form', route: '/dashboard/system-form', title: '系统表单', blocks: [] },
  version: 1,
};
const api = {
  async invoke(serviceName, method, payload) {
    calls.push({ serviceName, method, payload });
    if (method === 'listItems') return [];
    if (method === 'saveItem' && serviceName === 'lowcode') return createdPage;
    if (method === 'saveItem' && serviceName === 'admin') return { ...payload, page_code: createdPage.code };
    throw new Error(`Unexpected call: ${serviceName}.${method}`);
  },
};

const route = {
  id: 'route-1',
  code: 'system-form',
  path: '/dashboard/system-form',
  title: '系统表单',
  route_type: 'page',
  page_code: null,
};
const page = await ensureLowCodePageForRoute(api, route);
assert.equal(page.code, 'system-form');
assert.deepEqual(calls.map((call) => `${call.serviceName}.${call.method}`), [
  'lowcode.listItems',
  'lowcode.listItems',
  'lowcode.saveItem',
  'admin.saveItem',
]);
assert.equal(calls[2].payload.data.schema.status, 'published');
assert.deepEqual(calls[2].payload.data.schema.blocks, []);
assert.equal(calls[3].payload.page_code, 'system-form');

console.log('Low-code route page ensure regression test passed.');
