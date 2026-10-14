import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

async function loadModule(path, globals = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, structuredClone, ...globals }, { filename: path });
  return exports;
}

const prefetchModule = await loadModule('../utils/printDesignerLowCode.ts');
const { prefetchPrintDesignerLowCodeResources: prefetch, PRINT_DESIGNER_FORM_CODES: formCodes } = prefetchModule;
const pageCodes = ['print-designer', 'print-templates', 'print-templates-edit'];
const requests = [];
const authState = { user: { value: null }, activeAccount: { value: null } };
const serviceModule = await loadModule('../composables/useServiceApi.ts', {
  useAuthState: () => authState,
  useAuthenticatedFetch: () => ({
    request: async (_url, { body }) => {
      requests.push(structuredClone(body));
      const { serviceName, serviceMethod, postData } = body;
      assert.equal(serviceName, 'lowcode');
      let data = null;
      if (serviceMethod === 'listItems') {
        const codes = postData.filters.code;
        const table = postData.resource ?? postData.tableName;
        data = (Array.isArray(codes) ? [...codes].reverse() : [codes]).map((code) => ({
          id: code, code, schema: { fields: [{ field: code }], actions: [], blocks: [] },
          ...(table === 'lowcode_pages' ? { runtime_functions: [{ function_name: 'save' }] } : {}),
        }));
      }
      return { success: true, serviceName, serviceMethod, data };
    },
  }),
});
const api = serviceModule.useServiceApi();
const [resources] = await Promise.all([prefetch(api), prefetch(api)]);
assert.equal(requests.length, 2, 'Concurrent preloads should share the two listItems requests.');
assert.equal(resources.designerPage.code, 'print-designer');
assert.equal(resources.templateListPage.code, 'print-templates');
assert.equal(resources.templateEditPage.code, 'print-templates-edit');
assert.ok(formCodes.includes('print-designer.feedback'));
assert.ok(formCodes.includes('print-account-setting'));
assert.ok(formCodes.includes('presentation-animation'));

for (const code of pageCodes) {
  const rows = await api.invoke('lowcode', 'listItems', {
    tableName: 'lowcode_pages', filters: { code }, includeData: true, limit: 1,
  });
  assert.equal(rows[0].code, code);
  assert.equal(rows[0].runtime_functions[0].function_name, 'save');
  const metadataRows = await api.invoke('lowcode', 'listItems', {
    tableName: 'lowcode_pages', filters: { code }, includeData: false, limit: 1,
  });
  assert.equal(metadataRows[0].code, code);
}
for (const code of formCodes) {
  const rows = await api.invoke('lowcode', 'listItems', {
    resource: 'lowcode_form_definitions', filters: { code, enabled: true }, limit: 1,
  });
  assert.equal(rows[0].code, code);
  rows[0].schema.fields[0].field = 'modified by dialog';
}
const cachedForms = await api.invoke('lowcode', 'listItems', {
  resource: 'lowcode_form_definitions', filters: { code: [...formCodes], enabled: true },
});
assert.equal(cachedForms[0].schema.fields[0].field, formCodes[0], 'Dialogs must receive cloned schemas.');
await prefetch(api);
assert.equal(requests.length, 2, 'Page/form lookups and repeat preloads should hit the session cache.');

await api.invoke('lowcode', 'saveItem', { resource: 'lowcode_form_definitions', data: {} });
await prefetch(api);
assert.equal(requests.length, 4, 'A definition write should only invalidate the form cache.');
assert.equal(requests.at(-1).postData.resource, 'lowcode_form_definitions');
authState.user.value = { id: 'another-user' };
authState.activeAccount.value = { account_id: 'another-account' };
await prefetch(api);
assert.equal(requests.length, 6, 'Switching auth/account scope must reload both definition sets.');

const partialResources = await prefetch({
  invoke: async (_service, _method, data) => {
    if (data.resource) throw new Error('Forms temporarily unavailable');
    return [{ code: 'print-designer' }];
  },
});
assert.equal(partialResources.designerPage.code, 'print-designer');
assert.equal(partialResources.templateListPage, null);
const failedResources = await prefetch({ invoke: async () => { throw new Error('Unavailable'); } });
assert.equal(failedResources.designerPage, null, 'Failed preloads must allow the existing on-demand fallback.');
console.log('Print designer listItems prefetch/cache regression tests passed.');
