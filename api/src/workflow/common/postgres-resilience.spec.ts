import { strict as assert } from 'node:assert';
import {
  isTransientPostgresError,
  retryTransientPostgresOperation
} from './postgres-resilience';

async function main() {
  assert.equal(isTransientPostgresError(new Error('Connection terminated unexpectedly')), true);
  assert.equal(isTransientPostgresError({ code: 'ECONNRESET' }), true);
  assert.equal(
    isTransientPostgresError(Object.assign(new Error('outer'), { cause: { code: '08006' } })),
    true
  );
  assert.equal(isTransientPostgresError({ code: '23505', message: 'duplicate key' }), false);

  let attempts = 0;
  const delays: number[] = [];
  const result = await retryTransientPostgresOperation(
    async () => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
      return 'ok';
    },
    {
      attempts: 3,
      initialDelayMs: 10,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      }
    }
  );
  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [10, 20]);

  attempts = 0;
  await assert.rejects(
    () =>
      retryTransientPostgresOperation(async () => {
        attempts += 1;
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      }),
    /duplicate key/
  );
  assert.equal(attempts, 1);

  console.log('workflow-api PostgreSQL resilience tests passed');
}

void main();
