import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const FORM_CODE = 'admin.search-model.create';

async function main() {
  const env = getEnv();
  const connection = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!connection) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const root = process.cwd().toLowerCase().endsWith('api') ? resolve(process.cwd(), '..') : process.cwd();
  const sql = await readFile(resolve(root, 'supabase/migrations/20261012140000_admin_search_model_form.sql'), 'utf8');
  const url = new URL(normalizePostgresConnectionString(connection));
  const client = new Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 30_000,
    ssl: ['localhost', '127.0.0.1', '::1'].includes(url.hostname) ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    const result = await client.query<{ enabled: boolean; field: string; required: boolean }>(`
      select enabled, schema #>> '{fields,0,field}' as field,
        coalesce((schema #>> '{fields,0,rules,0,required}')::boolean, false) as required
      from public.lowcode_form_definitions where code = $1
    `, [FORM_CODE]);
    const row = result.rows[0];
    if (!row?.enabled || row.field !== 'name' || !row.required) {
      throw new Error(`Search model form verification failed: ${JSON.stringify(row ?? null)}`);
    }
    console.log(`Applied and verified low-code form ${FORM_CODE}.`);
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
