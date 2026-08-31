import assert from 'node:assert/strict';

import { LowCodeService } from './lowcode.service';
import { lowCodeResources } from './lowcode.resources';

type RuntimeService = {
  prepareRuntimePage(
    page: Record<string, unknown>,
    authorization: unknown,
    nodeActions?: Array<Record<string, unknown>>,
    runtimeFunctions?: Array<Record<string, unknown>>,
  ): Record<string, unknown>;
};

const service = new LowCodeService() as unknown as RuntimeService;
const runtimeFunction = {
  id: 'runtime-1',
  runtime_key: 'system:page:list.refresh',
  function_name: 'refresh',
  function_type: 'page_function',
  category: 'data',
  page_type: 'list',
  execution_mode: 'native',
  native_handler: 'builtin.list.refresh',
  enabled: true,
};

const runtimePage = service.prepareRuntimePage(
  {
    id: 'page-1',
    code: 'records',
    page_type: 'list',
    schema: { code: 'records', blocks: [] },
  },
  {},
  [],
  [runtimeFunction],
);

assert.deepEqual(runtimePage.runtime_functions, [runtimeFunction]);
assert.equal(lowCodeResources.lowcode_page_runtime.tableName, 'lowcode_page_runtime');
assert.equal(lowCodeResources.lowcode_page_runtime.clientMode, 'user');
assert.equal(
  lowCodeResources.lowcode_page_runtime.permissions?.create,
  'lowcode.pages.manage',
);
assert.ok(
  lowCodeResources.lowcode_page_runtime.create?.allowedFields?.includes('source_code'),
);
assert.ok(
  lowCodeResources.lowcode_page_runtime.update?.allowedFields?.includes('runtime_spec'),
);

console.log('low-code page runtime API tests passed');

async function testRemoteRuntimeEndpoint() {
  const remoteService = new LowCodeService() as unknown as RuntimeService & {
    getRuntimePage: () => Promise<Record<string, unknown>>;
    executeRuntime: (
      postData: Record<string, unknown>,
      context: unknown,
    ) => Promise<Record<string, unknown>>;
  };
  remoteService.getRuntimePage = async () => ({
    id: 'page-remote',
    code: 'remote-page',
    route: '/remote-page',
    title: 'Remote page',
    page_type: 'custom',
    version: 1,
    runtime_functions: [{
      runtime_key: 'test:remote:sum',
      function_name: 'sum',
      function_type: 'page_function',
      execution_mode: 'script',
      source_code: 'async function main(input) { return Number(input.args.left) + Number(input.args.right); }',
      capabilities: [],
      limits: { timeoutMs: 2000 },
    }],
  });

  const result = await remoteService.executeRuntime({
    pageId: 'page-remote',
    runtimeKey: 'test:remote:sum',
    args: { left: 4, right: 5 },
    context: { event: { name: 'test.remote' } },
  }, {});
  assert.equal(result.value, 9);
  assert.equal(result.executionMode, 'remote');
}

void testRemoteRuntimeEndpoint()
  .then(() => console.log('low-code remote runtime endpoint tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
