import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = process.env.DIRECT_URL
  ?? env.DIRECT_URL
  ?? process.env.DATABASE_URL
  ?? env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260904100000_lowcode_materials.sql',
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
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false },
  });
  client.on('error', () => undefined);

  try {
    await client.connect();
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(hashtext('lowcode-materials'))`);
    await client.query(await readFile(migrationPath, 'utf8'));

    const { rows } = await client.query<{
      material_kind: 'page' | 'form';
      material_count: number;
      source_count: number;
    }>(`
      select
        material_kind,
        count(*)::int as material_count,
        count(*) filter (where length(source_text) > 0)::int as source_count
      from public.lowcode_materials
      where enabled and status = 'published'
      group by material_kind
      order by material_kind
    `);
    const counts = new Map(rows.map((row) => [row.material_kind, row]));
    if ((counts.get('page')?.material_count ?? 0) < 17 || (counts.get('page')?.source_count ?? 0) < 17) {
      throw new Error('Expected at least 17 published Page material sources.');
    }
    if (counts.get('form')?.material_count !== 18 || counts.get('form')?.source_count !== 18) {
      throw new Error('Expected 18 published Form material sources.');
    }

    await client.query('commit');
    console.log(`Low-code material migration applied: ${counts.get('page')?.material_count ?? 0} Page, ${counts.get('form')?.material_count ?? 0} Form.`);
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
