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
assert.equal(
  queue.isTransientMobileWriteError(Object.assign(new Error('TypeError: fetch failed'), { status: 400 })),
  true,
  'Supabase fetch failures wrapped by an older API must remain retryable',
);
assert.equal(
  queue.isTransientMobileWriteError(Object.assign(new Error('upstream request timeout'), { status: 400 })),
  true,
);
assert.equal(
  queue.isTransientMobileWriteError(Object.assign(new Error('Timed out acquiring connection from connection pool.'), { status: 400 })),
  true,
);
assert.equal(
  queue.isTransientMobileWriteError(Object.assign(new Error('Supabase request timed out after 30000 ms.'), { name: 'TimeoutError', status: 400 })),
  true,
);
assert.equal(
  queue.isTransientMobileWriteError(Object.assign(new Error('This operation was aborted'), { name: 'AbortError', status: 400 })),
  true,
);
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

await queue.enqueueOfflineRequest({
  accountId: 'account-a',
  userId: 'user-a',
  pageId: 'work-orders',
  sourceKey: 'orders',
  request: { ...request, requestId: 'mobile-operation-retry' },
});
for (let attempt = 1; attempt <= 8; attempt += 1) {
  const failedResult = await queue.flushOfflineQueue({
    replay: async () => {
      throw new Error('Failed to fetch');
    },
  }, 'account-a', 'user-a', true);
  assert.equal(failedResult.completed, 0);
}
assert.equal(queue.mobileOfflineQueue.failed, 1, 'a repeatedly failing write must enter failed state');
await queue.retryFailedOfflineRequests('account-a', 'user-a');
assert.equal(queue.mobileOfflineQueue.pending, 1, 'manual retry must return failed writes to pending');
const retriedResult = await queue.flushOfflineQueue({
  replay: async () => undefined,
}, 'account-a', 'user-a', true);
assert.deepEqual(retriedResult, { completed: 1, failed: 0, pending: 0, conflicts: 0 });

const mesRequest = await queue.enrichMobileMesCommandRequest({
  serviceName: 'mes',
  serviceMethod: 'pauseOperation',
  postData: { operationId: 'operation-1', expectedVersion: 3, reasonCode: 'breakdown' },
  requestId: 'mobile-mes-command-1',
}, 'account-a', 'user-a');
const secondMesRequest = await queue.enrichMobileMesCommandRequest({
  serviceName: 'mes',
  serviceMethod: 'resumeOperation',
  postData: { operationId: 'operation-1', expectedVersion: 4 },
  requestId: 'mobile-mes-command-2',
}, 'account-a', 'user-a');
assert.match(mesRequest.postData.deviceId, /^mes-mobile-/);
assert.equal(mesRequest.postData.commandId, mesRequest.requestId);
assert.equal(secondMesRequest.postData.deviceId, mesRequest.postData.deviceId);
assert.equal(secondMesRequest.postData.commandId, secondMesRequest.requestId);
assert.equal(secondMesRequest.postData.localSequence, mesRequest.postData.localSequence + 1);
const concurrentMesRequests = await Promise.all(
  Array.from({ length: 12 }, (_, index) => queue.enrichMobileMesCommandRequest({
    serviceName: 'mes',
    serviceMethod: 'reportProduction',
    postData: { operationId: 'operation-1', expectedVersion: index + 5, goodQuantity: 1 },
    requestId: `mobile-mes-concurrent-${index}`,
  }, 'account-a', 'user-concurrent')),
);
assert.equal(
  new Set(concurrentMesRequests.map((value) => value.postData.localSequence)).size,
  concurrentMesRequests.length,
  'parallel MES commands must reserve unique local sequence numbers',
);
const explicitSequenceRequest = await queue.enrichMobileMesCommandRequest({
  serviceName: 'mes',
  serviceMethod: 'resumeOperation',
  postData: { operationId: 'operation-1', deviceId: 'scanner-1', localSequence: 0 },
  requestId: 'mobile-mes-explicit-sequence',
}, 'account-a', 'user-a');
assert.equal(explicitSequenceRequest.postData.localSequence, 0);
assert.equal(explicitSequenceRequest.postData.commandId, explicitSequenceRequest.requestId);
await assert.rejects(
  () => queue.enrichMobileMesCommandRequest({
    serviceName: 'mes',
    serviceMethod: 'pauseOperation',
    postData: { deviceId: 'scanner-1', localSequence: 99, commandId: 'different-command' },
    requestId: 'mobile-mes-command-mismatch',
  }, 'account-a', 'user-a'),
  /commandId must match/,
);
const stableMesRequest = await queue.enrichMobileMesCommandRequest(
  mesRequest,
  'account-a',
  'user-a',
);
assert.deepEqual(stableMesRequest, mesRequest, 'replay metadata must remain stable');

const mesReplayRequests = [];
await queue.enqueueOfflineRequest({
  accountId: 'account-a',
  userId: 'user-a',
  pageId: 'mes-execution',
  sourceKey: 'operations',
  request: mesRequest,
});
await queue.flushOfflineQueue({
  replay: async (value) => mesReplayRequests.push(value),
}, 'account-a', 'user-a', true);
assert.equal(mesReplayRequests[0].requestId, mesRequest.requestId);
assert.equal(mesReplayRequests[0].postData.commandId, mesRequest.requestId);
assert.equal(mesReplayRequests[0].postData.deviceId, mesRequest.postData.deviceId);
assert.equal(mesReplayRequests[0].postData.localSequence, mesRequest.postData.localSequence);

console.log('mobile offline queue regression checks passed');
