import { strict as assert } from 'node:assert';
import type { Pool } from 'pg';
import {
  acquireHealthyPostgresClient,
  createWorkflowPostgresPool,
  queryWithHealthyPostgresClient,
  resolveWorkflowDatabaseUrl
} from './postgres-pool';

async function main() {
  const passthroughSleep = async () => undefined;

  assert.equal(
    resolveWorkflowDatabaseUrl({ DATABASE_URL: 'pooled', DIRECT_URL: 'direct' }),
    'pooled'
  );
  assert.equal(resolveWorkflowDatabaseUrl({ DIRECT_URL: 'direct' }), 'direct');

  const configuredPool = createWorkflowPostgresPool(
    'postgresql://user:password@localhost:5432/database?pgbouncer=true&sslmode=require',
    { name: 'test' }
  );
  const configuredConnectionString = configuredPool.options.connectionString ?? '';
  assert.equal(configuredConnectionString.includes('pgbouncer='), false);
  assert.equal(configuredConnectionString.includes('sslmode=require'), true);
  assert.equal(configuredPool.options.maxLifetimeSeconds, 300);
  await configuredPool.end();

  const releases: unknown[] = [];
  let connectionAttempts = 0;
  const deadClient = {
    query: async () => {
      throw Object.assign(new Error('Connection terminated unexpectedly'), {
        code: 'ECONNRESET'
      });
    },
    release: (destroy?: unknown) => releases.push(destroy)
  };
  const healthyClient = {
    query: async () => ({ rows: [{ '?column?': 1 }] }),
    release: (destroy?: unknown) => releases.push(destroy)
  };
  const pool = {
    connect: async () => {
      connectionAttempts += 1;
      return connectionAttempts === 1 ? deadClient : healthyClient;
    }
  } as unknown as Pool;

  const client = await acquireHealthyPostgresClient(pool);
  assert.equal(client, healthyClient);
  assert.equal(connectionAttempts, 2);
  assert.deepEqual(releases, [true]);
  client.release();

  const queryReleases: unknown[] = [];
  const queryTexts: string[] = [];
  const queryClient = {
    query: async (text: string) => {
      queryTexts.push(text);
      return text === 'select 1'
        ? { rows: [{ '?column?': 1 }] }
        : { rows: [{ id: 'row-1' }] };
    },
    release: (destroy?: unknown) => queryReleases.push(destroy)
  };
  const queryPool = {
    connect: async () => queryClient
  } as unknown as Pool;

  const queryResult = await queryWithHealthyPostgresClient<{ id: string }>(
    queryPool,
    'select id from example where id = $1',
    ['row-1']
  );
  assert.deepEqual(queryTexts, ['select 1', 'select id from example where id = $1']);
  assert.deepEqual(queryResult.rows, [{ id: 'row-1' }]);
  assert.deepEqual(queryReleases, [undefined]);

  const timeoutReleases: unknown[] = [];
  let timeoutConnectionAttempts = 0;
  const timeoutPool = {
    connect: async () => {
      timeoutConnectionAttempts += 1;
      return {
        query: async () => new Promise(() => undefined),
        release: (destroy?: unknown) => timeoutReleases.push(destroy)
      };
    }
  } as unknown as Pool;

  await assert.rejects(
    () => acquireHealthyPostgresClient(timeoutPool, {
      timeoutMs: 5,
      retry: { sleep: passthroughSleep }
    }),
    /health check timed out/
  );
  assert.equal(timeoutConnectionAttempts, 3);
  assert.deepEqual(timeoutReleases, [true, true, true]);

  console.log('workflow PostgreSQL pool health tests passed');
}

void main();
