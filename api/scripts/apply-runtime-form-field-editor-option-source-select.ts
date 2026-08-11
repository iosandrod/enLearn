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
  'supabase/migrations/20260812100000_runtime_form_field_editor_option_source_select.sql'
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
        count(*) filter (
          where sources.code = 'option_source_code'
            and sources.source_type = 'view'
            and sources.status = 'active'
        )::integer as source_count,
        (select count(*)::integer from public.system_option_source_code_options) as option_count,
        (
          select count(*)::integer
          from public.system_option_sources
          where status = 'active'
        ) as expected_option_count,
        (
          select field_item
          from public.lowcode_form_definitions definitions,
            lateral jsonb_array_elements(definitions.schema->'fields') field_item
          where definitions.code = 'runtime-form-field-editor'
            and field_item->>'field' = 'optionsCode'
        ) as field
      from public.system_option_sources sources
    `);
    const result = rows[0];
    if (
      result?.source_count !== 1 ||
      result?.option_count !== result?.expected_option_count ||
      result?.field?.component !== 'vxe-select' ||
      result?.field?.optionsCode !== 'option_source_code' ||
      result?.field?.props?.filterable !== true ||
      result?.field?.props?.allowCreate !== true
    ) {
      throw new Error(`Runtime field option-source select verification failed: ${JSON.stringify(result)}`);
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
