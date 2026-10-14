import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

async function main() {
  const env = getEnv();
  const connection = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!connection) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const root = process.cwd().toLowerCase().endsWith('api') ? resolve(process.cwd(), '..') : process.cwd();
  const anonymous = process.argv.includes('--anonymous');
  const migration = anonymous
    ? '20261014120000_lowcode_form_anonymous_submissions.sql'
    : '20261014110000_lowcode_form_submits.sql';
  const sql = await readFile(resolve(root, 'supabase/migrations', migration), 'utf8');
  const url = new URL(normalizePostgresConnectionString(connection));
  for (const key of ['pgbouncer', 'sslmode', 'uselibpqcompat']) url.searchParams.delete(key);
  const client = new Client({
    connectionString: url.toString(), connectionTimeoutMillis: 30_000,
    ssl: ['localhost', '127.0.0.1', '::1'].includes(url.hostname) ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    const { rows } = await client.query(`
      select to_regclass('public.lowcode_form_submits') is not null as table_ready,
        to_regprocedure('public.submit_lowcode_form(text,jsonb)') is not null as rpc_ready,
        exists (select 1 from public.lowcode_form_definitions where code = 'print-designer.feedback' and enabled) as form_ready
    `);
    if (!rows[0]?.table_ready || !rows[0]?.rpc_ready || !rows[0]?.form_ready) {
      throw new Error('Low-code form submissions verification failed.');
    }
    if (anonymous) {
      const { rows: definitions } = await client.query("select allow_anonymous_submit from public.lowcode_form_definitions where code = 'print-designer.feedback'");
      if (definitions[0]?.allow_anonymous_submit !== true) throw new Error('Anonymous feedback configuration failed.');
    }
    console.log(`Applied and verified ${migration}.`);
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
