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
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260812130000_runtime_form_field_component_type.sql'
);

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
      connectionTimeoutMillis: 30_000
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
    await client.query(await readFile(migrationPath, 'utf8'));
    const { rows } = await client.query(`
      select
        count(distinct sources.code)::integer as source_count,
        count(items.id)::integer as item_count,
        array_agg(items.value order by items.sort_order) as item_values,
        (
          select array_agg(field_item->>'field' order by ordinal)
          from public.lowcode_form_definitions definitions,
            lateral jsonb_array_elements(definitions.schema->'fields')
              with ordinality fields(field_item, ordinal)
          where definitions.code = 'runtime-form-field-editor'
        ) as field_order,
        (
          select field_item
          from public.lowcode_form_definitions definitions,
            lateral jsonb_array_elements(definitions.schema->'fields') field_item
          where definitions.code = 'runtime-form-field-editor'
            and field_item->>'field' = 'component'
        ) as field
      from public.system_option_sources sources
      left join public.system_option_items items
        on items.source_code = sources.code
       and items.status = 'active'
      where sources.code = 'form_field_component_type'
        and sources.source_type = 'dict'
        and sources.status = 'active'
      group by sources.code
    `);
    const result = rows[0];
    const expectedValues = [
      'vxe-input',
      'vxe-textarea',
      'vxe-select',
      'vxe-switch',
      'vxe-password-input',
      'vxe-checkbox-group',
      'vxe-radio-group',
      'vxe-tree-select',
      'lc-cascader',
      'lc-number-input',
      'lc-color-picker',
      'lc-option-select',
      'lc-json-editor',
      'lc-monaco-editor',
      'base-info',
      'lc-array-table',
      'lc-sub-form'
    ];
    const componentIndex = result?.field_order?.indexOf('component') ?? -1;
    const requiredIndex = result?.field_order?.indexOf('required') ?? -1;
    if (
      result?.source_count !== 1 ||
      result?.item_count !== expectedValues.length ||
      JSON.stringify(result?.item_values) !== JSON.stringify(expectedValues) ||
      componentIndex < 0 ||
      componentIndex + 1 !== requiredIndex ||
      result?.field?.component !== 'vxe-select' ||
      result?.field?.optionsCode !== 'form_field_component_type' ||
      result?.field?.props?.filterable !== true ||
      result?.field?.props?.clearable !== false
    ) {
      throw new Error(`Runtime field component selector verification failed: ${JSON.stringify(result)}`);
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
