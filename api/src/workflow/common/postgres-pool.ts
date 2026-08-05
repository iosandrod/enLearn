import {
  Pool,
  type PoolClient,
  type PoolConfig,
  type QueryResult,
  type QueryResultRow
} from 'pg';
import {
  isTransientPostgresError,
  retryTransientPostgresOperation
} from './postgres-resilience';
import { guardPostgresPoolClientErrorEvents } from '../../common/utils/postgres-client-errors';

type WorkflowDatabaseEnv = {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
};

type WorkflowPostgresPoolOptions = {
  max?: number;
  name: string;
  onIdleClientError?: (message: string) => void;
};

type PostgresHealthCheckOptions = {
  timeoutMs?: number;
  retry?: Parameters<typeof retryTransientPostgresOperation>[1];
};

const POSTGRES_HEALTH_CHECK_TIMEOUT_MS = 2_000;

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
  guardPostgresPoolClientErrorEvents(pool);

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

export async function acquireHealthyPostgresClient(
  pool: Pool,
  options: PostgresHealthCheckOptions = {}
) {
  return retryTransientPostgresOperation(
    () => acquireHealthyPostgresClientOnce(pool, options),
    options.retry
  );
}

export async function withHealthyPostgresClient<T>(
  pool: Pool,
  callback: (client: PoolClient) => Promise<T>,
  options: PostgresHealthCheckOptions = {}
) {
  const client = await acquireHealthyPostgresClient(pool, options);
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

export function queryWithHealthyPostgresClient<T extends QueryResultRow = QueryResultRow>(
  pool: Pool,
  text: string,
  values: unknown[] = []
): Promise<QueryResult<T>> {
  return retryTransientPostgresOperation(async () => {
    const client = await acquireHealthyPostgresClientOnce(pool);
    let failure: unknown;
    try {
      return await client.query<T>(text, values);
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      client.release(isTransientPostgresError(failure) ? true : undefined);
    }
  });
}

async function acquireHealthyPostgresClientOnce(
  pool: Pool,
  options: PostgresHealthCheckOptions = {}
) {
  const client = await pool.connect();
  try {
    await runPostgresHealthCheck(
      client,
      options.timeoutMs ?? POSTGRES_HEALTH_CHECK_TIMEOUT_MS
    );
    return client;
  } catch (error) {
    client.release(true);
    throw error;
  }
}

async function runPostgresHealthCheck(client: PoolClient, timeoutMs: number) {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutError = Object.assign(
    new Error(`Postgres health check timed out after ${timeoutMs}ms.`),
    { code: 'ETIMEDOUT' }
  );

  try {
    await Promise.race([
      client.query('select 1'),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(timeoutError), timeoutMs);
        timeout.unref();
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
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
