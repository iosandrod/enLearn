import { createHash } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../../common/utils/env';
import {
  PLANNING_MODEL_BY_KEY,
  type PlanningFieldDefinition
} from '../planning.models';
import {
  PLANNING_INPUT_TABLES,
  type PlanningDataSnapshot,
  type PlanningInputTable,
  type PlanningRow
} from './planning-execution.types';

export class PlanningDataLoader {
  constructor(private readonly pool: Pool) {}

  static fromEnvironment() {
    return new PlanningDataLoader(createPlanningPool());
  }

  async load(accountId: string): Promise<PlanningDataSnapshot> {
    const client = await this.pool.connect();
    try {
      await client.query('begin isolation level repeatable read read only');
      const loadedAt = await readTransactionTimestamp(client);
      const rows = {} as Record<PlanningInputTable, PlanningRow[]>;
      for (const table of PLANNING_INPUT_TABLES) {
        rows[table] = await loadTable(client, table, accountId);
      }
      await client.query('commit');
      const counts = Object.fromEntries(
        PLANNING_INPUT_TABLES.map((table) => [table, rows[table].length])
      ) as Record<PlanningInputTable, number>;
      return {
        accountId,
        counts,
        hash: createHash('sha256').update(stableStringify(rows)).digest('hex'),
        loadedAt,
        rows
      };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}

export function createPlanningPool() {
  const env = getEnv();
  const configuredConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!configuredConnectionString?.trim()) {
    throw new Error('DIRECT_URL or DATABASE_URL is required for planning execution.');
  }
  const connectionString = resolvePlanningConnectionString(configuredConnectionString);
  const pool = new Pool({
    connectionString: normalizePostgresConnectionString(connectionString),
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
    max: positiveInteger(env.PLANNING_DATABASE_POOL_SIZE, 4),
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined
  });
  pool.on('connect', (client) => {
    client.on('error', () => undefined);
  });
  pool.on('error', (error) => {
    console.warn(`Planning database pool discarded a failed idle connection: ${error.message}`);
  });
  return pool;
}

async function loadTable(client: PoolClient, table: PlanningInputTable, accountId: string) {
  const model = PLANNING_MODEL_BY_KEY.get(table);
  if (!model) throw new Error(`Planning model definition is missing for ${table}.`);
  const columns = [
    '"id"::text as "id"',
    '"account_id"::text as "account_id"',
    ...model.fields.map(selectExpression),
    `to_char("updated_at" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updated_at"`
  ];
  const { rows } = await client.query<PlanningRow>(
    `select ${columns.join(', ')} from public.${quoteIdentifier(table)} where account_id = $1${baselineFilter(table)} order by id`,
    [accountId]
  );
  return rows;
}

function baselineFilter(table: PlanningInputTable) {
  return table === 'planning_operationplan' ||
    table === 'planning_operationplanresource' ||
    table === 'planning_operationplanmaterial'
    ? ' and plan_version_id is null'
    : '';
}

function selectExpression(field: PlanningFieldDefinition) {
  const column = quoteIdentifier(field.name);
  if (field.kind === 'number') return `${column}::double precision as ${column}`;
  if (field.kind === 'interval') return `extract(epoch from ${column})::double precision as ${column}`;
  if (field.kind === 'datetime') {
    return `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as ${column}`;
  }
  if (field.kind === 'time') return `${column}::text as ${column}`;
  if (field.kind === 'relation' || field.kind === 'uuid') return `${column}::text as ${column}`;
  return column;
}

async function readTransactionTimestamp(client: PoolClient) {
  const result = await client.query<{ value: string }>(
    `select to_char(transaction_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as value`
  );
  const value = result.rows[0]?.value;
  if (!value) throw new Error('Unable to read planning snapshot timestamp.');
  return value;
}

function quoteIdentifier(value: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function shouldUseSsl(connectionString: string) {
  try {
    const hostname = new URL(connectionString).hostname.toLowerCase();
    return hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1';
  } catch {
    return true;
  }
}

export function resolvePlanningConnectionString(value: string) {
  const normalized = normalizePostgresConnectionString(value);
  try {
    const url = new URL(normalized);
    const match = url.username.match(/^postgres\.([a-z0-9]+)$/i);
    if (match && url.hostname.includes('.pooler.supabase.com')) {
      url.hostname = `db.${match[1]}.supabase.co`;
      url.port = '5432';
      url.username = 'postgres';
    }
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    return url.toString();
  } catch {
    return normalized;
  }
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
