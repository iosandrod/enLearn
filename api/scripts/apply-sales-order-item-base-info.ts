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
const migrationPaths = [
  'supabase/migrations/20260813090000_planning_item_display_name.sql',
  'supabase/migrations/20260813110000_sales_order_item_base_info.sql',
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
      keepAlive: true,
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
      select column_item as item_column
      from public.lowcode_pages pages
      cross join lateral jsonb_array_elements(coalesce(pages.schema->'blocks', '[]'::jsonb)) root_block
      cross join lateral jsonb_array_elements(coalesce(root_block->'tabs', '[]'::jsonb)) tab_item
      cross join lateral jsonb_array_elements(coalesce(tab_item->'blocks', '[]'::jsonb)) grid_block
      cross join lateral jsonb_array_elements(coalesce(grid_block#>'{schema,grid,columns}', '[]'::jsonb)) column_item
      where pages.code = 'sales-orders-edit'
        and grid_block->>'id' = 'sales-order-lines-grid'
        and column_item->>'field' = 'item_code'
      order by pages.updated_at desc
      limit 1
    `);
    const field = rows[0]?.item_column;
    const config = field?.params?.lowcodeField?.props?.relateInfoConfig;
    if (
      field?.params?.lowcodeField?.component !== 'base-info' ||
      config?.resource !== 'planning_item' ||
      config?.valueField !== 'name' ||
      !config?.fieldMappings?.some((mapping: Record<string, unknown>) =>
        mapping.sourceField === 'display_name' && mapping.targetField === 'item_name'
      )
    ) {
      throw new Error(`Sales-order material base-info verification failed: ${JSON.stringify(field)}`);
    }
    console.log(JSON.stringify({
      component: field.params.lowcodeField.component,
      resource: config.resource,
      mappingCount: config.fieldMappings.length,
    }));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
