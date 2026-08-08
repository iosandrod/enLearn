import assert from 'node:assert/strict';

import {
  clearServiceIdempotencyCache,
  executeDurableIdempotentServiceWrite,
  executeIdempotentServiceWrite,
  isIdempotentServiceWrite,
  type RequestIdempotencyPersistence,
} from './request-idempotency';

async function main() {
  clearServiceIdempotencyCache();
  let calls = 0;
  const first = executeIdempotentServiceWrite('request-1', { id: 1 }, async () => {
    calls += 1;
    return { saved: true };
  });
  const second = executeIdempotentServiceWrite('request-1', { id: 1 }, async () => {
    calls += 1;
    return { saved: false };
  });
  assert.deepEqual(await Promise.all([first, second]), [{ saved: true }, { saved: true }]);
  assert.equal(calls, 1);
  await assert.rejects(
    () => executeIdempotentServiceWrite('request-1', { id: 2 }, async () => null),
    /reused with different write data/,
  );
  assert.equal(isIdempotentServiceWrite('saveItem', {}), true);
  assert.equal(isIdempotentServiceWrite('runAction', { idempotent: true }), true);
  assert.equal(isIdempotentServiceWrite('runAction', {}), false);
  assert.equal(isIdempotentServiceWrite('listItems', {}), false);

  clearServiceIdempotencyCache();
  const scope = {
    accountId: '00000000-0000-4000-8000-000000000001',
    userId: '00000000-0000-4000-8000-000000000002',
    requestId: 'durable-request-1'
  };
  let durableCalls = 0;
  let storedFingerprint = '';
  let storedResponse: unknown;
  let storedStatus: 'missing' | 'pending' | 'completed' = 'missing';
  const persistence: RequestIdempotencyPersistence = {
    claim: async (_scope, nextFingerprint) => {
      if (storedStatus !== 'missing' && storedFingerprint !== nextFingerprint) {
        return { state: 'conflict' };
      }
      if (storedStatus === 'completed') {
        return { state: 'completed', response: storedResponse };
      }
      if (storedStatus === 'pending') return { state: 'pending' };
      storedFingerprint = nextFingerprint;
      storedStatus = 'pending';
      return { state: 'claimed' };
    },
    complete: async (_scope, nextFingerprint, response) => {
      assert.equal(nextFingerprint, storedFingerprint);
      storedResponse = response;
      storedStatus = 'completed';
    },
    release: async () => {
      storedStatus = 'missing';
      storedFingerprint = '';
    }
  };
  const durableFirst = await executeDurableIdempotentServiceWrite(
    scope,
    { resource: 'orders', data: { id: 1 } },
    async () => {
      durableCalls += 1;
      return { id: 1, saved: true };
    },
    persistence
  );
  assert.deepEqual(durableFirst, { id: 1, saved: true });

  clearServiceIdempotencyCache();
  const durableReplay = await executeDurableIdempotentServiceWrite(
    scope,
    { data: { id: 1 }, resource: 'orders' },
    async () => {
      durableCalls += 1;
      return { id: 1, saved: false };
    },
    persistence
  );
  assert.deepEqual(durableReplay, durableFirst);
  assert.equal(durableCalls, 1, 'a completed durable request must survive process cache loss');

  clearServiceIdempotencyCache();
  await assert.rejects(
    () => executeDurableIdempotentServiceWrite(
      scope,
      { resource: 'orders', data: { id: 2 } },
      async () => null,
      persistence
    ),
    /reused with different write data/
  );

  clearServiceIdempotencyCache();
  storedStatus = 'pending';
  await assert.rejects(
    () => executeDurableIdempotentServiceWrite(
      { ...scope, requestId: 'durable-request-pending' },
      { resource: 'orders', data: { id: 1 } },
      async () => null,
      {
        ...persistence,
        claim: async () => ({ state: 'pending' })
      }
    ),
    /still being processed/
  );

  clearServiceIdempotencyCache();
  let released = false;
  await assert.rejects(
    () => executeDurableIdempotentServiceWrite(
      { ...scope, requestId: 'durable-request-failed' },
      { resource: 'orders', data: { id: 3 } },
      async () => {
        throw new Error('business write failed');
      },
      {
        claim: async () => ({ state: 'claimed' }),
        complete: async () => undefined,
        release: async () => { released = true; }
      }
    ),
    /business write failed/
  );
  assert.equal(released, true, 'a failed business operation must release its durable claim');
  console.log('service request idempotency tests passed');
}

void main();
