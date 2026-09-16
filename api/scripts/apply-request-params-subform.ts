import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = process.env.DATABASE_URL
  ?? env.DATABASE_URL
  ?? process.env.DIRECT_URL
  ?? env.DIRECT_URL;

if (!rawConnectionString) {
  throw new Error('DATABASE_URL or DIRECT_URL is required.');
}

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPaths = [
  resolve(repoRoot, 'supabase/migrations/20260908010000_grid_designer_request_params_subform.sql'),
  resolve(repoRoot, 'supabase/migrations/20260910040000_edit_form_request_params_subform.sql'),
];

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
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false },
  });
  client.on('error', () => undefined);

  await client.connect();
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(hashtext('lowcode-request-params-subform'))`);
    for (const migrationPath of migrationPaths) {
      const sql = (await readFile(migrationPath, 'utf8'))
        .replace(/^\uFEFF?\s*begin;\s*/i, '')
        .replace(/\s*commit;\s*$/i, '');
      await client.query(sql);
    }

    const { rows } = await client.query<{
      code: string;
      component: string | null;
    }>(`
      select definition.code,
        case
          when definition.code = 'grid-designer' then (
            select field ->> 'component'
            from jsonb_array_elements(section #> '{props,schema,fields}') field
            where field ->> 'field' = 'postDataJson'
            limit 1
          )
          else (
            select field ->> 'component'
            from jsonb_array_elements(definition.schema -> 'fields') field
            where field ->> 'field' = 'postDataJson'
            limit 1
          )
        end as component
      from public.lowcode_form_definitions definition
      left join lateral jsonb_array_elements(definition.schema -> 'fields') section
        on definition.code = 'grid-designer'
       and section ->> 'field' = 'grid-designer-business-info'
      where definition.code in (
        'material-prop.form',
        'material-prop.lowcode-edit-form',
        'material-prop.lowcode-grid',
        'grid-designer'
      )
      order by definition.code
    `);
    if (rows.length !== 4 || rows.some((row) => row.component !== 'lc-sub-form')) {
      throw new Error(`Request-parameter sub-form verification failed: ${JSON.stringify(rows)}`);
    }

    await client.query('commit');
    console.log(JSON.stringify(rows));
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
