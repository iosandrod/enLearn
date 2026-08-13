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
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260813130000_trigger_workflow_inspector_forms.sql'
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
      connectionTimeoutMillis: 30_000,
      keepAlive: true
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
    const { rows } = await client.query<{
      field_names: string[];
      tab_keys: string[];
    }>(`
      select
        array(
          select field->>'field'
          from jsonb_array_elements(schema->'fields') field
          order by field->>'field'
        ) as field_names,
        array(
          select tab->>'key'
          from jsonb_array_elements(schema->'layout'->0->'tabs') tab
        ) as tab_keys
      from public.lowcode_form_definitions
      where code = 'trigger-workflow.node.task'
    `);
    const result = rows[0];
    const requiredFields = [
      'taskType',
      'frontendFunction',
      'backendFunction',
      'procedureName',
      'taskInput',
      'outputMapping',
      'failureStrategy',
      'priority',
      'taskTags'
    ];
    if (
      !result ||
      !requiredFields.every((field) => result.field_names.includes(field)) ||
      !result.tab_keys.includes('execution')
    ) {
      throw new Error(`Trigger task inspector verification failed: ${JSON.stringify(result)}`);
    }
    console.log(JSON.stringify({
      requiredFields,
      tabKeys: result.tab_keys
    }));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
