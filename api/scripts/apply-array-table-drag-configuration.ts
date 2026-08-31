import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionStrings = [
  process.env.DIRECT_URL,
  env.DIRECT_URL,
  process.env.DATABASE_URL,
  env.DATABASE_URL,
]
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
  'supabase/migrations/20260829120000_array_table_drag_configuration.sql',
);

function connectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

function unwrapMigration(sql: string) {
  return sql
    .replace(/^\uFEFF?\s*begin;\s*/i, '')
    .replace(/\s*commit;\s*$/i, '');
}

type VerificationResult = {
  database_name: string;
  grid_drag_trigger: string | null;
  grid_row_draggable: boolean | null;
  array_table_has_drag_fields: boolean;
  array_table_has_drag_tab: boolean;
};

async function applyMigration(rawConnectionString: string, migrationSql: string) {
  const client = new Client({
    connectionString: connectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false },
  });
  client.on('error', () => undefined);

  let stage = 'connect';
  try {
    await client.connect();
    stage = 'begin transaction';
    await client.query('begin');
    stage = 'acquire migration lock';
    await client.query(`select pg_advisory_xact_lock(hashtext('array-table-drag-configuration'))`);
    stage = 'configure transaction timeouts';
    await client.query(`set local lock_timeout = '10s'`);
    await client.query(`set local statement_timeout = '60s'`);
    stage = 'execute migration';
    await client.query(migrationSql);

    stage = 'verify migration';
    const { rows } = await client.query<VerificationResult>(`
      with grid as (
        select nested.value as column_field
        from public.lowcode_form_definitions definition
        cross join lateral jsonb_array_elements(
          coalesce(definition.schema -> 'fields', '[]'::jsonb)
        ) section
        cross join lateral jsonb_array_elements(
          coalesce(section.value #> '{props,schema,fields}', '[]'::jsonb)
        ) nested
        where definition.code = 'grid-designer'
          and section.value ->> 'field' = 'grid-designer-columns'
          and nested.value ->> 'field' = 'columns'
      ), array_table as (
        select schema
        from public.lowcode_form_definitions
        where code = 'material-prop.array-table'
      )
      select
        current_database() as database_name,
        (select column_field #>> '{props,rowDragConfig,trigger}' from grid)
          as grid_drag_trigger,
        (select (column_field #>> '{props,rowDraggable}')::boolean from grid)
          as grid_row_draggable,
        coalesce((
          select (schema -> 'fields') @> '[{"field":"rowDraggable"},{"field":"rowDragConfig"}]'::jsonb
          from array_table
        ), false) as array_table_has_drag_fields,
        coalesce((
          select (schema #> '{layout,0,tabs}') @> '[{"key":"drag"}]'::jsonb
          from array_table
        ), false) as array_table_has_drag_tab
    `);
    const result = rows[0];
    if (
      !result
      || result.grid_drag_trigger !== 'cell'
      || result.grid_row_draggable !== true
      || result.array_table_has_drag_fields !== true
      || result.array_table_has_drag_tab !== true
    ) {
      throw new Error(`Array-table drag configuration verification failed: ${JSON.stringify(result)}`);
    }

    stage = 'commit transaction';
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${stage}: ${message}`);
  } finally {
    await client.end();
  }
}

async function main() {
  const migrationSql = unwrapMigration(await readFile(migrationPath, 'utf8'));
  let connectionError: unknown;

  for (const rawConnectionString of rawConnectionStrings) {
    try {
      const result = await applyMigration(rawConnectionString, migrationSql);
      console.log(JSON.stringify(result));
      return;
    } catch (error) {
      connectionError = error;
    }
  }

  throw connectionError;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
