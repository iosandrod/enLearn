import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const FORM_CODE = 'print-designer.datasource-script-meta';
const MIGRATION_FILES = [
  'supabase/migrations/20261009100000_print_script_meta_form.sql',
  'supabase/migrations/20261009110000_print_script_datasource_code.sql',
  'supabase/migrations/20261009120000_print_datasource_connection_form.sql',
];

async function main() {
  const env = getEnv();
  const connectionStrings = [env.DIRECT_URL, env.DATABASE_URL]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => values.indexOf(value) === index);
  if (!connectionStrings.length) throw new Error('DIRECT_URL or DATABASE_URL is required.');

  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const migrations = await Promise.all(MIGRATION_FILES.map((file) => readFile(resolve(repoRoot, file), 'utf8')));
  let client: Client | undefined;
  let connectionError: unknown;
  for (const connectionString of connectionStrings) {
    const url = new URL(normalizePostgresConnectionString(connectionString));
    const sslDisabled = url.searchParams.get('sslmode') === 'disable'
      || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    url.searchParams.delete('pgbouncer');
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    const candidate = new Client({
      connectionString: url.toString(),
      connectionTimeoutMillis: 30_000,
      ssl: sslDisabled ? false : { rejectUnauthorized: false },
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
    for (const sql of migrations) await client.query(sql);
    const { rows } = await client.query<{
      code: string;
      enabled: boolean;
      table_name: string;
      fields: string[];
    }>(`
      select code, enabled, table_name,
             array(select field->>'field' from jsonb_array_elements(schema->'fields') field) as fields
      from public.lowcode_form_definitions where code = $1
    `, [FORM_CODE]);
    const row = rows[0];
    if (!row?.enabled || row.table_name !== 'print_datasource_script'
      || !['code', 'name', 'enabled', 'datasource_code'].every((field) => row.fields.includes(field))) {
      throw new Error('Print script metadata form verification failed.');
    }
    const relation = await client.query(`
      select 1 from information_schema.columns column_info
      join pg_constraint constraint_info
        on constraint_info.conrelid = 'public.print_datasource_script'::regclass
        and constraint_info.conname = 'print_datasource_script_datasource_code_fkey'
      where column_info.table_schema = 'public'
        and column_info.table_name = 'print_datasource_script'
        and column_info.column_name = 'datasource_code'
        and column_info.data_type = 'text'
        and column_info.is_nullable = 'YES'
    `);
    if (relation.rowCount !== 1) throw new Error('Print script data source relation verification failed.');
    const form = await client.query(`
      select field #> '{props,schema,fields}' as fields
      from public.lowcode_form_definitions definition
      cross join lateral jsonb_array_elements(definition.schema->'fields') field
      where definition.code = 'print-designer.datasource-typeorm'
        and definition.enabled = true
        and field->>'field' = 'schema'
        and field->>'component' = 'lc-sub-form'
    `);
    if (form.rowCount !== 1 || !Array.isArray(form.rows[0].fields)
      || !['driver', 'host', 'port', 'database', 'username', 'password', 'query', 'parameters']
        .every((key) => form.rows[0].fields.some((field: { field: string }) => field.field === key))) {
      throw new Error('Print database connection sub-form verification failed.');
    }
    console.log(JSON.stringify({ applied: true, ...row }));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Migration failed.');
  process.exitCode = 1;
});
