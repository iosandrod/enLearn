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
  'supabase/migrations/20260823130000_picker_option_source_code_property.sql',
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
        (
          select field_item
          from public.lowcode_form_definitions definitions,
            lateral jsonb_array_elements(definitions.schema->'fields') field_item
          where definitions.code = 'material-prop.picker'
            and field_item->>'field' = '__lowcodeOptionsCode'
        ) as code_field,
        (
          select field_item
          from public.lowcode_form_definitions definitions,
            lateral jsonb_array_elements(definitions.schema->'fields') field_item
          where definitions.code = 'material-prop.picker'
            and field_item->>'field' = 'columns'
        ) as columns_field,
        (
          select array_agg(block_item->>'field' order by blocks.ordinal)
          from public.lowcode_form_definitions definitions,
            lateral jsonb_array_elements(definitions.schema#>'{layout,0,tabs}') tabs(tab_item),
            lateral jsonb_array_elements(tabs.tab_item->'blocks') with ordinality blocks(block_item, ordinal)
          where definitions.code = 'material-prop.picker'
            and tabs.tab_item->>'key' = 'options'
        ) as option_blocks
    `);
    const result = rows[0];
    if (
      result?.code_field?.target !== 'props' ||
      result?.code_field?.path !== '__lowcodeOptionsCode' ||
      result?.code_field?.component !== 'vxe-select' ||
      result?.code_field?.valueKind !== 'string' ||
      result?.code_field?.optionsCode !== 'option_source_code' ||
      result?.code_field?.props?.filterable !== true ||
      result?.code_field?.props?.allowCreate !== true ||
      result?.columns_field?.label !== '\u4e0b\u62c9\u9009\u9879\u8868' ||
      result?.columns_field?.props?.height !== 180 ||
      result?.columns_field?.props?.minHeight !== 0 ||
      JSON.stringify(result?.option_blocks) !== JSON.stringify(['__lowcodeOptionsCode', 'columns'])
    ) {
      throw new Error(
        `Picker option-source code property verification failed: ${JSON.stringify(result)}`,
      );
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
