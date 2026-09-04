import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = process.env.DIRECT_URL
  ?? env.DIRECT_URL
  ?? process.env.DATABASE_URL
  ?? env.DATABASE_URL;

if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationFiles = [
  'supabase/migrations/20260904113000_approval_workflow_lowcode.sql',
  'supabase/migrations/20260904113100_approval_workflow_designer_page.sql',
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
  try {
    await client.connect();
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(hashtext('approval-workflow-lowcode'))`);
    for (const file of migrationFiles) {
      await client.query(await readFile(resolve(repoRoot, file), 'utf8'));
    }
    const { rows } = await client.query<{ forms: number; materials: number; pages: number }>(`
      select
        (select count(*)::int from public.lowcode_form_definitions where code like 'approval-workflow.%' and enabled) as forms,
        (select count(*)::int from public.lowcode_materials where material_kind = 'page' and code = 'approval-workflow-designer' and enabled and status = 'published') as materials,
        (select count(*)::int from public.lowcode_pages where route = '/dashboard/workflow/designer' and status = 'published') as pages
    `);
    const result = rows[0];
    if (result.forms !== 12 || result.materials !== 1 || result.pages !== 1) {
      throw new Error(`Approval low-code verification failed: ${JSON.stringify(result)}`);
    }
    await client.query('commit');
    console.log('Approval workflow low-code migration applied: 1 page, 1 material, 12 forms.');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
