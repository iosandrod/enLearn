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
  'supabase/migrations/20260812150000_planning_operationmaterial_base_info.sql',
  'supabase/migrations/20260813090000_planning_item_display_name.sql',
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
      select field_item as item_field
      from public.lowcode_pages pages
      cross join lateral jsonb_array_elements(coalesce(pages.schema->'blocks', '[]'::jsonb)) root_block
      cross join lateral jsonb_array_elements(coalesce(root_block->'tabs', '[]'::jsonb)) tab_item
      cross join lateral jsonb_array_elements(coalesce(tab_item->'blocks', '[]'::jsonb)) form_block
      cross join lateral jsonb_array_elements(coalesce(form_block#>'{schema,fields}', '[]'::jsonb)) field_item
      where pages.code = 'planning_operationmaterial-edit'
        and form_block->>'id' = 'planning_operationmaterial_edit_form'
        and field_item->>'field' = 'item_id'
      order by pages.updated_at desc
      limit 1
    `);
    const field = rows[0]?.item_field;
    if (
      field?.component !== 'base-info' ||
      field?.props?.relateInfoConfig?.resource !== 'planning_item' ||
      !(
        Array.isArray(field?.props?.relateInfoConfig?.displayField) &&
        field.props.relateInfoConfig.displayField[0] === 'display_name' &&
        field.props.relateInfoConfig.displayField[1] === 'name'
      ) ||
      field?.props?.relateInfoConfig?.fieldMappings?.[0]?.targetField !== 'item_id' ||
      Object.prototype.hasOwnProperty.call(field ?? {}, 'optionsSourceKey')
    ) {
      throw new Error(`Operation-material base-info verification failed: ${JSON.stringify(field)}`);
    }
    console.log(JSON.stringify(field));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
