import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionStrings = [env.DATABASE_URL, env.DIRECT_URL]
  .filter((value): value is string => Boolean(value?.trim()))
  .filter((value, index, values) => values.indexOf(value) === index);

if (!rawConnectionStrings.length) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPaths = [
  'supabase/migrations/20260812130000_runtime_form_field_component_type.sql',
  'supabase/migrations/20260812143000_runtime_form_field_base_info.sql',
].map((path) => resolve(repoRoot, path));

function connectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

async function connect() {
  let connectionError: unknown;

  for (const rawConnectionString of rawConnectionStrings) {
    const client = new Client({
      connectionString: connectionString(rawConnectionString),
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 30_000,
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

async function main() {
  const client = await connect();

  try {
    for (const migrationPath of migrationPaths) {
      await client.query(await readFile(migrationPath, 'utf8'));
    }
    const { rows } = await client.query(`
      select
        count(items.id)::integer as item_count,
        bool_or(items.value = 'base-info') as has_base_info,
        (
          select field_item
          from public.lowcode_form_definitions definitions,
            lateral jsonb_array_elements(definitions.schema->'fields') field_item
          where definitions.code = 'runtime-form-field-editor'
            and field_item->>'field' = 'relateInfoConfig'
        ) as config_field
      from public.system_option_items items
      where items.source_code = 'form_field_component_type'
        and items.status = 'active'
    `);
    const result = rows[0];
    const mappingField = result?.config_field?.props?.schema?.fields?.find(
      (field: { field?: string }) => field.field === 'fieldMappings',
    );
    if (
      result?.item_count !== 17 ||
      result?.has_base_info !== true ||
      result?.config_field?.component !== 'lc-sub-form' ||
      mappingField?.component !== 'lc-array-table'
    ) {
      throw new Error(`Base-info field editor verification failed: ${JSON.stringify(result)}`);
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
