import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionStrings = [env.DIRECT_URL, env.DATABASE_URL]
  .filter((value): value is string => Boolean(value?.trim()))
  .filter((value, index, values) => values.indexOf(value) === index);

if (!rawConnectionStrings.length) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260812113000_runtime_form_field_mode_disabled.sql'
);

function connectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

async function main() {
  let client: Client | undefined;
  let connectionError: unknown;

  for (const rawConnectionString of rawConnectionStrings) {
    const candidate = new Client({
      connectionString: connectionString(rawConnectionString),
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 30_000
    });
    candidate.on('error', () => undefined);

    try {
      await candidate.connect();
      client = candidate;
      break;
    } catch (error) {
      connectionError = error;
      await candidate.end().catch(() => undefined);
    }
  }

  if (!client) throw connectionError;

  try {
    await client.query(await readFile(migrationPath, 'utf8'));
    const { rows } = await client.query(`
      select jsonb_object_agg(field_item->>'field', field_item) as fields
      from public.lowcode_form_definitions definitions,
        lateral jsonb_array_elements(definitions.schema->'fields') field_item
      where definitions.code = 'runtime-form-field-editor'
        and field_item->>'field' in ('createDisabled', 'editDisabled')
    `);
    const fields = rows[0]?.fields ?? {};
    for (const field of ['createDisabled', 'editDisabled']) {
      if (fields[field]?.component !== 'vxe-switch') {
        throw new Error(`Runtime field mode-disabled verification failed: ${JSON.stringify(fields)}`);
      }
    }
    console.log(JSON.stringify(fields));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
