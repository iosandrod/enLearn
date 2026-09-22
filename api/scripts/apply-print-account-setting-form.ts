import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const MIGRATION_FILE = 'supabase/migrations/20260921130000_print_account_setting_form.sql';
const FORM_CODE = 'print-account-setting';

async function main() {
  const env = getEnv();
  const connectionStrings = [
    env.DIRECT_URL,
    process.env.DIRECT_URL,
    env.DATABASE_URL,
    process.env.DATABASE_URL,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => values.indexOf(value) === index);

  if (!connectionStrings.length) {
    throw new Error('DIRECT_URL or DATABASE_URL is required.');
  }

  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const sql = await readFile(resolve(repoRoot, MIGRATION_FILE), 'utf8');
  const client = await connect(connectionStrings);

  try {
    await client.query(sql);
    const result = await client.query<{
      code: string;
      enabled: boolean;
      fields: string[];
    }>(`
      select
        code,
        enabled,
        array(
          select field.value ->> 'field'
          from jsonb_array_elements(schema -> 'fields') with ordinality as field(value, position)
          order by field.position
        ) as fields
      from public.lowcode_form_definitions
      where code = $1
    `, [FORM_CODE]);
    const row = result.rows[0];

    if (!row?.enabled || row.fields.join(',') !== 'fullName,email') {
      throw new Error(`Print account setting form verification failed: ${JSON.stringify(row ?? null)}.`);
    }

    console.log(JSON.stringify({ applied: true, ...row }));
  } finally {
    await client.end();
  }
}

async function connect(connectionStrings: string[]) {
  let connectionError: unknown;

  for (const connectionString of connectionStrings) {
    const url = new URL(normalizePostgresConnectionString(connectionString));
    url.searchParams.delete('pgbouncer');
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    const client = new Client({
      connectionString: url.toString(),
      connectionTimeoutMillis: 30_000,
      keepAlive: true,
      ssl: { rejectUnauthorized: false },
    });
    client.on('error', () => undefined);

    try {
      await client.connect();
      return client;
    } catch (error) {
      connectionError = error;
      await client.end().catch(() => undefined);
    }
  }

  throw connectionError;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
