import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { build } from 'esbuild';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(testDirectory, '../src/runtime/offline-queue.ts');
const storage = new Map();
globalThis.window = {
  __localStorage: {
    get length() { return storage.size; },
    key: (index) => [...storage.keys()][index] ?? null,
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
};

const result = await build({
  entryPoints: [sourcePath],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  write: false,
  define: { __PLATFORM__: '"web"' },
});
const queue = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
);

const request = {
  serviceName: 'admin',
  serviceMethod: 'saveItem',
  postData: { resource: 'work_orders', data: { id: 'wo-1', status: 'started' } },
  requestId: 'mobile-operation-1',
};
await queue.enqueueOfflineRequest({
  accountId: 'account-a',
  userId: 'user-a',
  pageId: 'work-orders',
  sourceKey: 'orders',
  request,
});
await queue.enqueueOfflineRequest({
  accountId: 'account-a',
  userId: 'user-a',
  pageId: 'work-orders',
  sourceKey: 'orders',
  request,
});
assert.equal(queue.mobileOfflineQueue.pending, 1, 'the stable request id must deduplicate writes');

const replayed = [];
const synced = await queue.flushOfflineQueue({
  replay: async (value) => replayed.push(value.requestId),
}, 'account-a', 'user-a', true);
assert.deepEqual(replayed, ['mobile-operation-1']);
assert.deepEqual(synced, { completed: 1, failed: 0, pending: 0, conflicts: 0 });

await queue.enqueueOfflineRequest({
  accountId: 'account-a',
  userId: 'user-b',
  pageId: 'quality',
  sourceKey: 'checks',
  request: { ...request, requestId: 'mobile-operation-2' },
});
await queue.clearOfflineQueue('account-a', 'user-a');
assert.equal(
  (await queue.refreshOfflineQueueState('account-a', 'user-b')).length,
  1,
  'queue cleanup must remain isolated by user and account',
);

assert.equal(queue.isTransientMobileWriteError(new Error('Failed to fetch')), true);
assert.equal(queue.isTransientMobileWriteError(Object.assign(new Error('Forbidden'), { status: 403 })), false);
assert.equal(queue.isMobileWriteConflict(Object.assign(new Error('Conflict'), { status: 409 })), true);
assert.equal(queue.isMobileWriteConflict(Object.assign(new Error('Precondition failed'), { status: 412 })), true);

await queue.enqueueOfflineRequest({
  accountId: 'account-a',
  userId: 'user-a',
  pageId: 'work-orders',
  sourceKey: 'orders',
  request: { ...request, requestId: 'mobile-operation-conflict' },
});
const conflictResult = await queue.flushOfflineQueue({
  replay: async () => {
    throw Object.assign(new Error('The record changed on the server.'), { status: 409 });
  },
}, 'account-a', 'user-a', true);
assert.deepEqual(conflictResult, { completed: 0, failed: 0, pending: 0, conflicts: 1 });
assert.equal(queue.mobileOfflineQueue.conflicts, 1);
assert.equal(await queue.discardConflictedOfflineRequests('account-a', 'user-a'), 1);
assert.equal(queue.mobileOfflineQueue.conflicts, 0);

console.log('mobile offline queue regression checks passed');
