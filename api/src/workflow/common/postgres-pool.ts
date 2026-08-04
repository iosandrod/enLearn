import { Pool, type PoolClient, type PoolConfig } from 'pg';
import {
  isTransientPostgresError,
  retryTransientPostgresOperation
} from './postgres-resilience';

type WorkflowDatabaseEnv = {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
};

type WorkflowPostgresPoolOptions = {
  max?: number;
  name: string;
  onIdleClientError?: (message: string) => void;
};

const WORKFLOW_POOL_DEFAULTS = {
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 15_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5_000,
  maxLifetimeSeconds: 300
} satisfies PoolConfig;

export function resolveWorkflowDatabaseUrl(env: WorkflowDatabaseEnv) {
  return readNonEmptyString(env.DATABASE_URL) ?? readNonEmptyString(env.DIRECT_URL);
}

export function createWorkflowPostgresPool(
  connectionString: string,
  options: WorkflowPostgresPoolOptions
) {
  const poolConnectionString = normalizeWorkflowPoolConnectionString(connectionString);
  const pool = new Pool({
    ...WORKFLOW_POOL_DEFAULTS,
    connectionString: poolConnectionString,
    max: options.max ?? 3
  });

  pool.on('error', (error) => {
    const message = `${options.name} Postgres idle client error: ${error.message}`;
    if (options.onIdleClientError) {
      options.onIdleClientError(message);
      return;
    }
    console.warn(`[workflow-postgres] ${message}`);
  });

  return pool;
}

export async function acquireHealthyPostgresClient(pool: Pool) {
  return retryTransientPostgresOperation(async () => {
    const client = await pool.connect();
    try {
      await client.query('select 1');
      return client;
    } catch (error) {
      client.release(true);
      throw error;
    }
  });
}

export async function withHealthyPostgresClient<T>(
  pool: Pool,
  callback: (client: PoolClient) => Promise<T>
) {
  const client = await acquireHealthyPostgresClient(pool);
  let failure: unknown;
  try {
    return await callback(client);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    client.release(isTransientPostgresError(failure) ? true : undefined);
  }
}

function readNonEmptyString(value: string | undefined) {
  return value?.trim() || undefined;
}

function normalizeWorkflowPoolConnectionString(connectionString: string) {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete('pgbouncer');
    return url.toString();
  } catch {
    return connectionString;
  }
}
