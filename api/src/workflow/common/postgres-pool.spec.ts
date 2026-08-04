import { strict as assert } from 'node:assert';
import type { Pool } from 'pg';
import {
  acquireHealthyPostgresClient,
  createWorkflowPostgresPool,
  resolveWorkflowDatabaseUrl
} from './postgres-pool';

async function main() {
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

  console.log('workflow PostgreSQL pool health tests passed');
}

void main();
