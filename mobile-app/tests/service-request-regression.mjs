import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { build } from 'esbuild';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(testDirectory, '../src/runtime/service-request.ts');
const result = await build({
  entryPoints: [sourcePath],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  write: false,
});
const moduleSource = result.outputFiles[0].text;
const requests = await import(
  `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`
);

assert.deepEqual(
  requests.normalizeMobileServiceRequest('lowcode', 'listPages', { limit: 30 }),
  {
    serviceName: 'lowcode',
    serviceMethod: 'listItems',
    postData: { limit: 30, tableName: 'lowcode_pages' },
  },
);
assert.deepEqual(
  requests.normalizeMobileServiceRequest('admin', 'listWorkflowJobRuns', { limit: 20 }),
  {
    serviceName: 'workflow',
    serviceMethod: 'listItems',
    postData: { limit: 20, pageSize: 20, itemType: 'jobRuns' },
  },
);
assert.deepEqual(
  requests.normalizeMobileServiceRequest('admin', 'listWorkflowJobRuns', { limit: 500 }),
  {
    serviceName: 'workflow',
    serviceMethod: 'listItems',
    postData: { limit: 100, pageSize: 100, itemType: 'jobRuns' },
  },
  'mobile workflow history requests must be capped to avoid statement timeouts',
);
assert.deepEqual(
  requests.normalizeMobileServiceRequest('admin', 'listWorkflowTimerJobs', { limit: 20 }),
  {
    serviceName: 'workflow',
    serviceMethod: 'listItems',
    postData: { limit: 20, filters: { type: 'cron' }, itemType: 'jobs' },
  },
);
assert.deepEqual(
  requests.normalizeMobileServiceRequest('notification', 'listMessages', {}),
  {
    serviceName: 'notification',
    serviceMethod: 'listItems',
    postData: { resource: 'notification_messages' },
  },
);
assert.deepEqual(
  requests.normalizeMobileServiceRequest('files', 'listStorageEntities', {}),
  {
    serviceName: 'files',
    serviceMethod: 'runAction',
    postData: { resource: 'file_objects', operation: 'listStorageEntities' },
  },
);
assert.deepEqual(
  requests.normalizeMobileServiceRequest('admin', 'listItems', {
    tableName: 'sales_orders',
  }),
  {
    serviceName: 'admin',
    serviceMethod: 'listItems',
    postData: { tableName: 'sales_orders' },
  },
);
assert.equal(
  requests.shouldReturnEmptyMobileList(
    new Error('Could not find the table system_execution_tasks'),
    'listSystemExecutionTasks',
  ),
  true,
);
assert.equal(
  requests.shouldReturnEmptyMobileList(new Error('Forbidden'), 'listUsers'),
  false,
);
for (const command of [
  'releaseWorkOrder', 'startOperation', 'pauseOperation', 'resumeOperation',
  'reportProduction', 'issueMaterial', 'returnMaterial', 'completeOperation',
  'reverseProduction', 'reverseMaterial', 'reverseTransaction',
]) {
  assert.equal(requests.isMobileMesCommand('mes', command), true);
}
assert.equal(requests.isMobileMesCommand('planning', 'releaseWorkOrder'), false);
assert.equal(requests.isMobileMesCommand('mes', 'listItems'), false);

console.log('mobile service request regression checks passed');
