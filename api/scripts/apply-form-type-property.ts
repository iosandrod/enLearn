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
const migrationPaths = [
  resolve(repoRoot, 'supabase/migrations/20260811130000_form_type_property.sql'),
  resolve(repoRoot, 'supabase/migrations/20260817090000_repair_form_property_tabs.sql'),
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
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false },
  });
  client.on('error', () => undefined);

  await client.connect();
  try {
    await client.query('begin');
    for (const migrationPath of migrationPaths) {
      await client.query(await readFile(migrationPath, 'utf8'));
    }
    const { rows } = await client.query<{
      code: string;
      tab_labels: string[];
      has_form_type: boolean;
    }>(`
      select
        code,
        array(
          select tab ->> 'label'
          from jsonb_array_elements(schema #> '{layout,0,tabs}') tab
          order by tab ->> 'key'
        ) as tab_labels,
        coalesce(schema #> '{layout,0,tabs,0,blocks}', '[]'::jsonb)
          @> '[{"kind":"field","field":"formType"}]'::jsonb as has_form_type
      from public.lowcode_form_definitions
      where code in (
        'material-prop.form',
        'material-prop.lowcode-edit-form',
        'material-prop.lowcode-search-form'
      )
      order by code
    `);
    const form = rows.find((row) => row.code === 'material-prop.form');
    const editForm = rows.find((row) => row.code === 'material-prop.lowcode-edit-form');
    const searchForm = rows.find((row) => row.code === 'material-prop.lowcode-search-form');
    const hasGarbledLabel = rows.some((row) => row.tab_labels.some((label) => /^\?+$/.test(label)));
    if (
      !form?.has_form_type ||
      !editForm?.has_form_type ||
      !searchForm ||
      hasGarbledLabel
    ) {
      throw new Error(`Form property verification failed: ${JSON.stringify(rows)}`);
    }
    await client.query('commit');
    console.log(JSON.stringify(rows));
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
