import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getBuiltinLowCodePageFunctions,
  resolveBuiltinLowCodePageFunction,
} from '../../packages/lowcode-framework/src/runtime/page-function/index.ts';
import * as legacyPageFunctions from '../../packages/lowcode-framework/src/runtime/builtin-page-functions.ts';

const listFunctions = getBuiltinLowCodePageFunctions('list');
const editFunctions = getBuiltinLowCodePageFunctions('edit');

assert.deepEqual(
  listFunctions.map((item) => item.name),
  ['create', 'edit', 'approve', 'unapprove', 'close', 'open', 'refresh', 'print', 'exit'],
);
assert.deepEqual(
  editFunctions.map((item) => item.name),
  ['copy', 'create', 'modify', 'save', 'approve', 'unapprove', 'close', 'open', 'refresh', 'exit'],
);
assert.equal(resolveBuiltinLowCodePageFunction('list', 'copy'), undefined);
assert.equal(resolveBuiltinLowCodePageFunction('edit', 'print'), undefined);
assert.equal(
  legacyPageFunctions.resolveBuiltinLowCodePageFunction('list', 'refresh')?.id,
  'list.refresh',
  'The previous built-in page-function import path must remain compatible.',
);

const calls = [];
const baseContext = {
  pageType: 'list',
  args: {},
  getSelectedRows: () => [{ id: 'row-1', status: 'draft' }],
  getFormRecords: () => [],
  navigateToEdit: async (row) => calls.push(['navigateToEdit', row]),
  updateRecords: async (rows, values) => {
    calls.push(['updateRecords', rows, values]);
    return [{ id: 'row-1', ...values }];
  },
  invokeService: async (serviceName, serviceMethod, postData) => {
    calls.push(['invokeService', serviceName, serviceMethod, postData]);
    return { ok: true };
  },
  prepareForms: async (mode) => calls.push(['prepareForms', mode]),
  patchForms: async (values) => calls.push(['patchForms', values]),
  submitForms: async () => true,
  setMode: async (mode) => calls.push(['setMode', mode]),
  refresh: async () => calls.push(['refresh']),
  print: async () => calls.push(['print']),
  exit: async () => calls.push(['exit']),
  notify: (message, status) => calls.push(['notify', message, status]),
};

await assert.rejects(
  resolveBuiltinLowCodePageFunction('list', 'approve').execute({
    ...baseContext,
    getSelectedRows: () => [{ id: 'row-without-status' }],
  }),
  /未找到状态字段/,
);

await resolveBuiltinLowCodePageFunction('list', 'edit').execute(baseContext);
assert.deepEqual(calls.shift(), ['navigateToEdit', { id: 'row-1', status: 'draft' }]);

await resolveBuiltinLowCodePageFunction('list', 'approve').execute(baseContext);
assert.deepEqual(calls.shift(), [
  'updateRecords',
  [{ id: 'row-1', status: 'draft' }],
  { status: 'approved' },
]);
assert.deepEqual(calls.shift(), ['refresh']);
assert.deepEqual(calls.shift(), ['notify', '审核成功。', 'success']);

await resolveBuiltinLowCodePageFunction('list', 'approve').execute({
  ...baseContext,
  args: {
    serviceName: 'sales',
    serviceMethod: 'approveOrders',
    postData: { reason: 'checked' },
  },
});
assert.deepEqual(calls.shift(), [
  'invokeService',
  'sales',
  'approveOrders',
  {
    reason: 'checked',
    rows: [{ id: 'row-1', status: 'draft' }],
  },
]);
assert.deepEqual(calls.shift(), ['refresh']);
assert.deepEqual(calls.shift(), ['notify', '审核成功。', 'success']);

const editCalls = [];
const editContext = {
  ...baseContext,
  pageType: 'edit',
  getFormRecords: () => [{ id: 'row-1', status: 'open' }],
  patchForms: async (values) => editCalls.push(['patchForms', values]),
  submitForms: async () => {
    editCalls.push(['submitForms']);
    return true;
  },
  notify: (message, status) => editCalls.push(['notify', message, status]),
};
await resolveBuiltinLowCodePageFunction('edit', 'close').execute(editContext);
assert.deepEqual(editCalls, [
  ['patchForms', { status: 'closed' }],
  ['submitForms'],
  ['notify', '关闭成功。', 'success'],
]);

const rendererSource = await readFile(
  new URL('../../packages/lowcode-framework/src/components/LowCodePageRenderer.vue', import.meta.url),
  'utf8',
);
const contextSource = await readFile(
  new URL('../../packages/lowcode-framework/src/runtime/lowcode-context.ts', import.meta.url),
  'utf8',
);
const [listPageFunctionSource, editPageFunctionSource, pageFunctionIndexSource] =
  await Promise.all([
    readFile(
      new URL(
        '../../packages/lowcode-framework/src/runtime/page-function/list-page-function.ts',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../../packages/lowcode-framework/src/runtime/page-function/edit-page-function.ts',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../../packages/lowcode-framework/src/runtime/page-function/index.ts',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);

assert.match(
  listPageFunctionSource,
  /BUILTIN_LOW_CODE_LIST_PAGE_FUNCTIONS[\s\S]*?id: 'list\.create'[\s\S]*?id: 'list\.exit'/,
  'List-page executable functions must live in list-page-function.ts.',
);
assert.match(
  editPageFunctionSource,
  /BUILTIN_LOW_CODE_EDIT_PAGE_FUNCTIONS[\s\S]*?id: 'edit\.copy'[\s\S]*?id: 'edit\.exit'/,
  'Edit-page executable functions must live in edit-page-function.ts.',
);
assert.match(
  pageFunctionIndexSource,
  /BUILTIN_LOW_CODE_LIST_PAGE_FUNCTIONS[\s\S]*?BUILTIN_LOW_CODE_EDIT_PAGE_FUNCTIONS[\s\S]*?getBuiltinLowCodePageFunctions/,
  'The page-function index must aggregate page-owned function definitions.',
);

assert.match(
  rendererSource,
  /resolveBuiltinLowCodePageFunction[\s\S]*?createBuiltinPageFunctionContext[\s\S]*?resolvedFunction\.pageFunction\.execute/,
  'executeFunction must fall back to the page-type-specific built-in registry.',
);
assert.match(
  contextSource,
  /getBuiltinLowCodePageFunctions[\s\S]*?group: '内置页面函数'/,
  'The script context drawer must list built-in page functions.',
);

console.log('Built-in page functions regression test passed.');
