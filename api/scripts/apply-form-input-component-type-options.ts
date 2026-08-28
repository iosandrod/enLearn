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
const migrationPaths = [
  resolve(repoRoot, 'supabase/migrations/20260823120000_form_input_component_type_options.sql'),
  resolve(repoRoot, 'supabase/migrations/20260826090000_form_input_monaco_component_type.sql'),
  resolve(repoRoot, 'supabase/migrations/20260828110000_remove_datetime_picker_form_component_type.sql'),
];

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
    connectionTimeoutMillis: 30_000,
  });
  client.on('error', () => undefined);

  await client.connect();
  try {
    for (const migrationPath of migrationPaths) {
      await client.query(await readFile(migrationPath, 'utf8'));
    }
    const { rows } = await client.query(`
      select
        count(distinct sources.code)::integer as source_count,
        count(items.id)::integer as item_count,
        array_agg(items.value order by items.sort_order) as item_values
      from public.system_option_sources sources
      left join public.system_option_items items
        on items.source_code = sources.code
       and items.status = 'active'
      where sources.code = 'form_input_component_type'
        and sources.source_type = 'dict'
        and sources.status = 'active'
      group by sources.code
    `);
    const result = rows[0];
    const expectedValues = [
      'input',
      'picker',
      'lc-monaco-editor',
      'switch',
      'checkbox',
      'radio',
      'stepper',
      'rate',
      'slider',
      'array-table',
      'sub-form',
    ];
    if (
      result?.source_count !== 1 ||
      result?.item_count !== expectedValues.length ||
      JSON.stringify(result?.item_values) !== JSON.stringify(expectedValues)
    ) {
      throw new Error(
        `Form input component type option verification failed: ${JSON.stringify(result)}`,
      );
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
