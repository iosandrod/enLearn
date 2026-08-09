import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260810130000_search_form_material_schema.sql',
);

function connectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

async function main() {
  const client = new Client({
    connectionString: connectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false },
  });
  client.on('error', () => undefined);

  await client.connect();
  try {
    await client.query('begin');
    await client.query(await readFile(migrationPath, 'utf8'));
    const { rows } = await client.query<{
      found: boolean;
      has_initial_values: boolean;
      initial_values_tab: string | null;
    }>(`
      select
        count(*) = 1 as found,
        coalesce(schema #> '{layout,0,tabs,1,blocks}', '[]'::jsonb)
          @> '[{"kind":"field","field":"initialValuesJson"}]'::jsonb as has_initial_values,
        schema #>> '{layout,0,tabs,1,label}' as initial_values_tab
      from public.lowcode_form_definitions
      where code = 'material-prop.lowcode-search-form'
      group by schema
    `);
    const result = rows[0];
    if (!result?.found || !result.has_initial_values || result.initial_values_tab !== '数据') {
      throw new Error(`Search-form material schema verification failed: ${JSON.stringify(result)}`);
    }
    await client.query('commit');
    console.log(JSON.stringify(result));
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
