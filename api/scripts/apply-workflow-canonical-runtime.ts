import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const source = env.DIRECT_URL ?? env.DATABASE_URL;
if (!source) throw new Error('DIRECT_URL or DATABASE_URL is required.');

const root = process.cwd().toLowerCase().endsWith('api') ? resolve(process.cwd(), '..') : process.cwd();
const migrations = [
  resolve(root, 'supabase/migrations/20260909030000_workflow_canonical_runtime.sql'),
  resolve(root, 'supabase/migrations/20260909040000_trigger_workflow_parallel_join_inspector.sql'),
];

function connectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

async function main() {
  if (process.env.WORKFLOW_DB_ALLOW_MIGRATION !== '1') {
    throw new Error(
      'Refusing to modify the database. Set WORKFLOW_DB_ALLOW_MIGRATION=1 after selecting the target database.',
    );
  }
  const client = new Client({
    connectionString: connectionString(source),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000
  });
  try {
    await client.connect();
    for (const migration of migrations) {
      await client.query(await readFile(migration, 'utf8'));
    }
    const { rows } = await client.query<{
      tokens: boolean;
      events: boolean;
      capabilities: number;
      approval_fields: string[] | null;
      join_fields: string[] | null;
      parallel_join_fields: string[] | null;
    }>(`
      select
        to_regclass('public.wf_execution_token') is not null as tokens,
        to_regclass('public.wf_execution_event') is not null as events,
        (select count(*)::int from public.wf_node_capability where enabled) as capabilities,
        (select array_agg(field->>'field') from jsonb_array_elements(schema->'fields') field
          where code = 'trigger-workflow.node.manual-approval') as approval_fields,
        (select array_agg(field->>'field') from jsonb_array_elements(schema->'fields') field
          where code = 'trigger-workflow.node.parallel') as join_fields
        ,(select array_agg(field->>'field') from jsonb_array_elements(schema->'fields') field
          where code = 'trigger-workflow.node.parallel-join') as parallel_join_fields
      from public.lowcode_form_definitions
      limit 1
    `);
    const result = rows[0];
    if (!result?.tokens || !result.events || result.capabilities < 13 ||
      !result.approval_fields?.includes('completionStrategy') ||
      !result.approval_fields?.includes('passRatio') ||
      !result.join_fields?.includes('joinKey') ||
      !result.parallel_join_fields?.includes('joinKey')) {
      throw new Error(`Canonical workflow runtime verification failed: ${JSON.stringify(result)}`);
    }
    console.log(JSON.stringify(result));
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
