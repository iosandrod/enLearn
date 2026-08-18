import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = env.DIRECT_URL ?? process.env.DIRECT_URL ?? env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260817120000_planning_operation_type_options.sql'
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
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000
  });
  client.on('error', () => undefined);

  await client.connect();
  try {
    await client.query(await readFile(migrationPath, 'utf8'));
    const { rows } = await client.query(`
      select
        count(distinct sources.code)::integer as source_count,
        count(items.id)::integer as item_count,
        array_agg(items.value order by items.sort_order) as item_values,
        array_agg(items.label order by items.sort_order) as item_labels
      from public.system_option_sources sources
      left join public.system_option_items items
        on items.source_code = sources.code
       and items.status = 'active'
      where sources.code = 'planning_operation_type'
        and sources.source_type = 'dict'
        and sources.status = 'active'
      group by sources.code
    `);
    const result = rows[0];
    const expectedValues = ['fixed_time', 'time_per', 'routing', 'alternate', 'split'];
    const expectedLabels = ['固定时长工序', '按数量计时工序', '工艺路线', '备选工艺', '拆分工艺'];
    if (
      result?.source_count !== 1 ||
      result?.item_count !== 5 ||
      JSON.stringify(result?.item_values) !== JSON.stringify(expectedValues) ||
      JSON.stringify(result?.item_labels) !== JSON.stringify(expectedLabels)
    ) {
      throw new Error(`Planning operation type option verification failed: ${JSON.stringify(result)}`);
    }
    console.log(JSON.stringify(result));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
