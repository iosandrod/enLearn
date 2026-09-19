import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const MIGRATION_FILE = 'supabase/migrations/20260920100000_print_data_source_form_definitions.sql';
const FORM_CODE = 'print-designer.datasource.sales-orders';

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
      table_name: string;
      has_header: boolean;
      has_detail: boolean;
      selector_options_code: string;
      option_source_type: string;
      option_source_view: string;
      option_count: number;
    }>(`
      select
        definitions.code,
        definitions.table_name,
        jsonb_path_exists(definitions.schema, '$.fields[*] ? (@.field == "header" && @.component == "lc-sub-form")') as has_header,
        jsonb_path_exists(definitions.schema, '$.fields[*] ? (@.field == "detail" && @.component == "lc-array-table")') as has_detail,
        selector.schema #>> '{fields,0,optionsCode}' as selector_options_code,
        option_source.source_type as option_source_type,
        option_source.source_config ->> 'view' as option_source_view,
        (select count(*)::integer from public.print_data_source_form_definition_options) as option_count
      from public.lowcode_form_definitions definitions
      cross join public.lowcode_form_definitions selector
      cross join public.system_option_sources option_source
      where definitions.code = $1
        and definitions.enabled = true
        and selector.code = 'print-designer.datasource-selector'
        and selector.enabled = true
        and option_source.code = 'print_data_source_form_definition'
    `, [FORM_CODE]);
    const row = result.rows[0];

    if (
      !row ||
      row.table_name !== 'sales_orders' ||
      !row.has_header ||
      !row.has_detail ||
      row.selector_options_code !== 'print_data_source_form_definition' ||
      row.option_source_type !== 'view' ||
      row.option_source_view !== 'public.print_data_source_form_definition_options' ||
      row.option_count < 1
    ) {
      throw new Error(`Print data source form verification failed: ${JSON.stringify(row ?? null)}.`);
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
