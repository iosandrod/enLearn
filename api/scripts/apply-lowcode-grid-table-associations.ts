import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { LOWCODE_GRID_TABLE_ASSOCIATIONS_MIGRATION_FILE } from './generate-lowcode-grid-table-associations-migration';
import {
  assertLowCodeGridTableAssociations,
  assertPlanningConsoleAggregateSources,
  inspectLowCodeGridTableAssociations,
  inspectPlanningConsoleAggregateSources
} from './lowcode-grid-table-associations';

const RETRYABLE_CONNECTION_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  '57P01',
  '57P02',
  '57P03'
]);

function isRetryableConnectionError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  const message = error instanceof Error ? error.message : String(error);
  return RETRYABLE_CONNECTION_CODES.has(code) ||
    /connection (?:ended|terminated)|read ECONNRESET|socket hang up/i.test(message);
}

async function delay(milliseconds: number) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function applyAndVerify(connectionString: string, migration: string) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  client.on('error', () => undefined);

  await client.connect();
  try {
    await client.query(migration);
    const audit = await inspectLowCodeGridTableAssociations(client);
    assertLowCodeGridTableAssociations(audit);
    const planningSources = await inspectPlanningConsoleAggregateSources(client);
    assertPlanningConsoleAggregateSources(planningSources);
    return { audit, planningSources };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  const env = getEnv();
  const rawConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');

  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const migration = await readFile(
    resolve(repoRoot, LOWCODE_GRID_TABLE_ASSOCIATIONS_MIGRATION_FILE),
    'utf8'
  );
  const connectionString = normalizePostgresConnectionString(rawConnectionString);
  let result: Awaited<ReturnType<typeof applyAndVerify>> | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      result = await applyAndVerify(connectionString, migration);
      break;
    } catch (error) {
      lastError = error;
      if (!isRetryableConnectionError(error) || attempt === 4) throw error;
      await delay(attempt * 750);
    }
  }
  if (!result) throw lastError ?? new Error('Low-code grid table migration did not run.');

  const { audit, planningSources } = result;
  console.log(JSON.stringify({
    total_grids: audit.totalGrids,
    associated_grids: audit.associatedGrids,
    grids_without_single_table: audit.unresolvedGrids.length,
    dropdown_options: audit.optionCount,
    public_prefixes: audit.prefixedAssociations.length + audit.prefixedOptionCount,
    null_schema_nodes: audit.nullBlockCount,
    unexpected_source_types: audit.unexpectedSourceTypeCount,
    planning_custom_sources: planningSources.length,
    applied: true
  }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
