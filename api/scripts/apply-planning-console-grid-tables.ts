import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { PLANNING_CONSOLE_GRID_TABLES } from '../src/planning-service/planning-console.schema';
import { PLANNING_CONSOLE_GRID_TABLES_MIGRATION_FILE } from './generate-planning-console-grid-tables-migration';

async function main() {
  const env = getEnv();
  const rawConnectionString = env.DATABASE_URL ?? env.DIRECT_URL;
  if (!rawConnectionString) throw new Error('DATABASE_URL or DIRECT_URL is required.');

  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const migration = await readFile(
    resolve(repoRoot, PLANNING_CONSOLE_GRID_TABLES_MIGRATION_FILE),
    'utf8'
  );
  const client = new Client({
    connectionString: normalizePostgresConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    await client.query(migration);
    const result = await client.query<{ grid_id: string; table_name: string; source_type: string }>(`
      select block->>'id' as grid_id,
             block->>'tableName' as table_name,
             block->>'sourceType' as source_type
      from public.lowcode_pages page
      cross join lateral jsonb_path_query(
        page.schema,
        'strict $.** ? (@.kind == "grid" && exists(@.tableName))'
      ) as block
      where page.code = 'planning_console'
        and block->>'id' = any($1::text[])
      order by block->>'id'
    `, [Object.keys(PLANNING_CONSOLE_GRID_TABLES)]);

    const installed = Object.fromEntries(result.rows.map((row) => [row.grid_id, row]));
    const installedGridIds = new Set(result.rows.map((row) => row.grid_id));
    if (installedGridIds.size !== Object.keys(PLANNING_CONSOLE_GRID_TABLES).length) {
      throw new Error(`Expected ${Object.keys(PLANNING_CONSOLE_GRID_TABLES).length} planning console grid tables, found ${installedGridIds.size}.`);
    }
    for (const [gridId, tableName] of Object.entries(PLANNING_CONSOLE_GRID_TABLES)) {
      if (
        installed[gridId]?.table_name !== tableName ||
        installed[gridId]?.source_type !== 'custom' ||
        tableName.startsWith('public.')
      ) {
        throw new Error(`Planning console grid table was not installed: ${gridId}.`);
      }
    }
    const sourceResult = await client.query<{
      source_key: string;
      source_type: string;
      service_name: string;
      service_method: string;
      table_name: string | null;
    }>(`
      select source.key as source_key,
             source.value->>'sourceType' as source_type,
             source.value->>'serviceName' as service_name,
             source.value->>'serviceMethod' as service_method,
             source.value->>'tableName' as table_name
      from public.lowcode_pages page
      cross join lateral jsonb_each(page.schema->'dataSources') as source(key, value)
      where page.code = 'planning_console'
        and source.key = any($1::text[])
      order by source.key
    `, [[
      'demands',
      'operationPlans',
      'materials',
      'planResources',
      'resourcePlans',
      'problems',
      'constraints',
      'runs'
    ]]);
    if (sourceResult.rows.length !== Object.keys(PLANNING_CONSOLE_GRID_TABLES).length) {
      throw new Error(
        `Expected ${Object.keys(PLANNING_CONSOLE_GRID_TABLES).length} aggregate data sources, found ${sourceResult.rows.length}.`
      );
    }
    for (const source of sourceResult.rows) {
      if (
        source.source_type !== 'custom' ||
        source.service_name !== 'planning' ||
        source.service_method !== 'getPlanningConsoleData' ||
        source.table_name !== null
      ) {
        throw new Error(`Planning console data source changed unexpectedly: ${source.source_key}.`);
      }
    }
    console.log(JSON.stringify({ grid_tables: installedGridIds.size, occurrences: result.rows.length, applied: true }));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
