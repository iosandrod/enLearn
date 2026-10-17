import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

async function main() {
  const env = getEnv();
  const connection = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!connection) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const root = process.cwd().toLowerCase().endsWith('api') ? resolve(process.cwd(), '..') : process.cwd();
  const sql = await readFile(resolve(root, 'supabase/migrations/20261017100000_print_material_columns_tab.sql'), 'utf8');
  const url = new URL(normalizePostgresConnectionString(connection));
  for (const key of ['pgbouncer', 'sslmode', 'uselibpqcompat']) url.searchParams.delete(key);
  const client = new Client({
    connectionString: url.toString(), connectionTimeoutMillis: 30_000,
    ssl: ['localhost', '127.0.0.1', '::1'].includes(url.hostname) ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    const result = await client.query<{ valid: boolean }>(`
      select jsonb_path_exists(schema, '$.fields[*] ? (@.field == "columns" && @.component == "lc-array-table")')
        and jsonb_path_exists(schema, '$.layout[*].tabs[*] ? (@.key == "material-columns" && @.label == "列属性")') as valid
      from public.lowcode_form_definitions where code = 'print-designer.property.vue-material'
    `);
    if (!result.rows[0]?.valid) throw new Error('Material columns property tab verification failed.');
    console.log('Applied and verified material columns property tab.');
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
