import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260812200000_runtime_form_default_value_procedure.sql',
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
    connectionTimeoutMillis: 30_000,
  });
  client.on('error', () => undefined);

  await client.connect();
  try {
    await client.query(await readFile(migrationPath, 'utf8'));
    const { rows } = await client.query(`
      select
        pg_catalog.to_regprocedure(
          'public.read_lowcode_default_value_procedure(text,text)'
        ) is not null as rpc_exists,
        pg_catalog.pg_get_functiondef(
          'public.read_lowcode_default_value_procedure(text,text)'::regprocedure
        ) !~ 'pg_catalog\\.current_user' as permission_actor_valid,
        (
          select field_item
          from public.lowcode_form_definitions definitions,
            lateral jsonb_array_elements(definitions.schema->'fields') field_item
          where definitions.code = 'runtime-form-field-editor'
            and field_item->>'field' = 'defaultValueProcedure'
        ) as field
    `);
    const result = rows[0];
    if (
      result?.rpc_exists !== true ||
      result?.permission_actor_valid !== true ||
      result?.field?.component !== 'vxe-select' ||
      result?.field?.props?.filterable !== true
    ) {
      throw new Error(`Procedure-default verification failed: ${JSON.stringify(result)}`);
    }
    console.log(JSON.stringify(result));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
