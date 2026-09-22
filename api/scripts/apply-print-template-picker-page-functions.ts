import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const MIGRATION_FILE = 'supabase/migrations/20260921110000_print_template_picker_page_functions.sql';

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
  if (!connectionStrings.length) throw new Error('DIRECT_URL or DATABASE_URL is required.');

  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const sql = await readFile(resolve(repoRoot, MIGRATION_FILE), 'utf8');
  const client = await connect(connectionStrings);

  try {
    await client.query(sql);
    const result = await client.query<{
      function_names: string[];
      load_script: string;
      empty_selection_id: string;
    }>(`
      select
        (
          select array_agg(function_name order by sort_order)
          from public.lowcode_page_runtime
          where runtime_key in (
            'system:page:common.confirmLowCodePage',
            'system:page:common.confirmForm'
          )
            and page_id is null
            and page_type is null
            and status = 'published'
            and enabled
        ) as function_names,
        (
          select action.value ->> 'script'
          from public.lowcode_pages page
          cross join lateral jsonb_array_elements(page.schema -> 'blocks') block(value)
          cross join lateral jsonb_array_elements(block.value -> 'actions') action(value)
          where page.code = 'print-designer'
            and block.value ->> 'id' = 'label-designer-actions'
            and action.value ->> 'code' = 'label-load'
        ) as load_script,
        (
          select schema #>> '{dataSources,selectedPrintTemplateRows,postData,filters,id}'
          from public.lowcode_pages
          where code = 'print-templates'
        ) as empty_selection_id
    `);
    const row = result.rows[0];
    if (
      row?.function_names?.join(',') !== 'confirmLowCodePage,confirmForm' ||
      !row.load_script?.includes('name: "confirmLowCodePage"') ||
      !row.load_script?.includes('pageCode: "print-templates"') ||
      !row.load_script?.includes('method: "loadData"') ||
      row.empty_selection_id !== '00000000-0000-0000-0000-000000000000'
    ) {
      throw new Error(`Print template picker verification failed: ${JSON.stringify(row ?? null)}.`);
    }
    console.log(JSON.stringify({ applied: true, functions: row.function_names }));
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
