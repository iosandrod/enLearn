import { Pool, type PoolClient } from 'pg';
import { getEnv } from './env';

let pool: Pool | null = null;

function getConnectionString() {
  const env = getEnv();
  return env.DIRECT_URL?.trim() || env.DATABASE_URL?.trim() || '';
}

export function getPostgresPool() {
  if (pool) return pool;

  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error('DIRECT_URL or DATABASE_URL is required for database operations.');
  }

  pool = new Pool({
    connectionString,
    max: 5,
    ssl: { rejectUnauthorized: false }
  });

  return pool;
}

export async function withPostgresClient<T>(
  callback: (client: PoolClient) => Promise<T>
) {
  const client = await getPostgresPool().connect();

  try {
    return await callback(client);
  } finally {
    client.release();
  }
}
