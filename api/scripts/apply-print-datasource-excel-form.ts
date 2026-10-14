import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

async function main() {
  const env = getEnv();
  const connection = env.DIRECT_URL ?? process.env.DIRECT_URL ?? env.DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connection) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const root = process.cwd().toLowerCase().endsWith('api') ? resolve(process.cwd(), '..') : process.cwd();
  const sql = await readFile(resolve(root, 'supabase/migrations/20261014100000_print_datasource_excel_confirm_form.sql'), 'utf8');
  const url = new URL(normalizePostgresConnectionString(connection));
  for (const key of ['pgbouncer', 'sslmode', 'uselibpqcompat']) url.searchParams.delete(key);
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 30_000, ssl: ['localhost', '127.0.0.1', '::1'].includes(url.hostname) ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    const result = await client.query('select enabled, schema from public.lowcode_form_definitions where code = $1', ['print-designer.datasource-excel']);
    const row = result.rows[0];
    if (!row?.enabled || !['sheetName', 'appendExisting'].every(name => row.schema?.fields?.some((field: { field: string }) => field.field === name))) {
      throw new Error('Excel data source confirm form verification failed.');
    }
    console.log('Applied and verified print-designer.datasource-excel.');
  } finally { await client.end(); }
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
