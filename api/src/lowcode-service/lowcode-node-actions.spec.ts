import assert from 'node:assert/strict';

import { lowCodeResources } from './lowcode.resources';
import { LowCodeService } from './lowcode.service';

type RuntimeService = {
  prepareRuntimePage(
    page: Record<string, unknown>,
    authorization: unknown,
    nodeActions?: Array<Record<string, unknown>>
  ): Record<string, unknown>;
};

const service = new LowCodeService() as unknown as RuntimeService;
const databaseAction = {
  id: 'action-1',
  node_type: 'grid',
  action_code: 'loadData',
  source_code: 'async function main() { return []; }'
};
const sourcePage = {
  id: 'page-1',
  code: 'records',
  schema: { code: 'records', blocks: [] }
};
const runtimePage = service.prepareRuntimePage(sourcePage, {}, [databaseAction]);

assert.deepEqual(runtimePage.node_actions, [databaseAction]);
assert.notEqual(
  runtimePage.schema,
  sourcePage.schema,
  'Runtime page preparation must clone the stored schema before attaching actions.'
);
assert.equal(lowCodeResources.lowcode_node_actions.tableName, 'lowcode_node_actions');
assert.equal(lowCodeResources.lowcode_node_actions.clientMode, 'user');
assert.deepEqual(
  lowCodeResources.lowcode_node_actions.list?.defaultSorts,
  [
    { field: 'node_type', direction: 'asc' },
    { field: 'sort_order', direction: 'asc' }
  ]
);
assert.ok(
  lowCodeResources.lowcode_node_actions.create?.allowedFields.includes('source_code')
);
assert.ok(
  lowCodeResources.lowcode_node_actions.update?.allowedFields.includes('source_code')
);
assert.equal(
  lowCodeResources.lowcode_node_actions.permissions?.create,
  'lowcode.pages.manage'
);

console.log('database node action API tests passed');
