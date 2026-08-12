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

  const hangingFetch = ((_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      const rejectWithAbortReason = () => reject(signal?.reason);
      if (signal?.aborted) rejectWithAbortReason();
      else signal?.addEventListener('abort', rejectWithAbortReason, { once: true });
    })) as typeof fetch;
  const boundedFetch = createSupabaseFetch(hangingFetch, {
    timeoutMs: 20,
    schemaCacheRetryDelaysMs: []
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

  console.log('Supabase request timeout and schema-cache retry tests passed');
}

void main();
