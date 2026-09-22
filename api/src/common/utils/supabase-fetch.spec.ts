import assert from 'node:assert/strict';

import { createSupabaseFetch } from './supabase-fetch';

async function main() {
  let calls = 0;
  const recoverableFetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return Response.json(
        {
          code: 'PGRST002',
          message: 'Could not query the database for the schema cache. Retrying.'
        },
        { status: 503 }
      );
    }
    return Response.json({ ok: true });
  }) as typeof fetch;
  const retryingFetch = createSupabaseFetch(recoverableFetch, {
    timeoutMs: 1_000,
    schemaCacheRetryDelaysMs: [0]
  });

  const recovered = await retryingFetch('https://example.test/rest/v1/items');
  assert.equal(recovered.status, 200);
  assert.equal(calls, 2, 'PGRST002 should be retried once before reaching the caller');

  calls = 0;
  const ordinaryFailureFetch = (async () => {
    calls += 1;
    return Response.json({ code: 'OTHER_ERROR' }, { status: 503 });
  }) as typeof fetch;
  const nonRetryingFetch = createSupabaseFetch(ordinaryFailureFetch, {
    timeoutMs: 1_000,
    schemaCacheRetryDelaysMs: [0]
  });

  const ordinaryFailure = await nonRetryingFetch('https://example.test/rest/v1/items');
  assert.equal(ordinaryFailure.status, 503);
  assert.equal(calls, 1, 'unrelated failures must not be replayed');

  calls = 0;
  const transientNetworkFailureFetch = (async () => {
    calls += 1;
    if (calls <= 3) {
      throw new TypeError('fetch failed: read ECONNRESET');
    }
    return Response.json({ ok: true });
  }) as typeof fetch;
  const networkRetryingFetch = createSupabaseFetch(transientNetworkFailureFetch, {
    timeoutMs: 1_000,
    schemaCacheRetryDelaysMs: [],
    networkRetryDelaysMs: [0, 0, 0]
  });

  const networkRecovered = await networkRetryingFetch('https://example.test/auth/v1/token', {
    method: 'POST'
  });
  assert.equal(networkRecovered.status, 200);
  assert.equal(calls, 4, 'transient network failures should be retried up to the configured limit');

  const requestBodies: string[] = [];
  calls = 0;
  const requestBodyRetryFetch = (async (input: Parameters<typeof fetch>[0]) => {
    calls += 1;
    const request = input instanceof Request ? input : new Request(input);
    requestBodies.push(await request.text());
    if (calls === 1) throw new TypeError('fetch failed');
    return Response.json({ ok: true });
  }) as typeof fetch;
  const bodyPreservingFetch = createSupabaseFetch(requestBodyRetryFetch, {
    timeoutMs: 1_000,
    schemaCacheRetryDelaysMs: [],
    networkRetryDelaysMs: [0]
  });
  const bodyRequest = new Request('https://example.test/rest/v1/rpc/example', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: 42 })
  });

  const bodyRetryResponse = await bodyPreservingFetch(bodyRequest);
  assert.equal(bodyRetryResponse.status, 200);
  assert.deepEqual(requestBodies, ['{"value":42}', '{"value":42}']);

  calls = 0;
  const exhaustedNetworkFetch = (async () => {
    calls += 1;
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  const boundedNetworkRetryFetch = createSupabaseFetch(exhaustedNetworkFetch, {
    timeoutMs: 1_000,
    schemaCacheRetryDelaysMs: [],
    networkRetryDelaysMs: [0, 0]
  });

  await assert.rejects(
    () => boundedNetworkRetryFetch('https://example.test/auth/v1/token'),
    /fetch failed/
  );
  assert.equal(calls, 3, 'network retries must remain bounded');

  const hangingFetch = ((_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      const rejectWithAbortReason = () => reject(signal?.reason);
      if (signal?.aborted) rejectWithAbortReason();
      else signal?.addEventListener('abort', rejectWithAbortReason, { once: true });
    })) as typeof fetch;
  const boundedFetch = createSupabaseFetch(hangingFetch, {
    timeoutMs: 20,
    schemaCacheRetryDelaysMs: [],
    networkRetryDelaysMs: []
  });

  await assert.rejects(
    () => boundedFetch('https://example.test/auth/v1/user'),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.name, 'TimeoutError');
      assert.match(error.message, /timed out after 20 ms/);
      return true;
    }
  );

  console.log('Supabase timeout, schema-cache retry, and network retry tests passed');
}

void main();
