import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const MIGRATION_FILE = 'supabase/migrations/20260927100000_print_designer_material_camera_repair.sql';

async function main() {
  const env = getEnv();
  const raw = process.env.DIRECT_URL ?? env.DIRECT_URL ?? process.env.DATABASE_URL ?? env.DATABASE_URL;
  if (!raw) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const repoRoot = process.cwd().toLowerCase().endsWith('api') ? resolve(process.cwd(), '..') : process.cwd();
  const migration = await readFile(resolve(repoRoot, MIGRATION_FILE), 'utf8');
  const url = new URL(normalizePostgresConnectionString(raw));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 30_000, keepAlive: true, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    await client.query(migration);
    const { rows } = await client.query<{ material_version: string | null; source_text: string | null }>(`
      select material_version, source_text
      from public.lowcode_materials
      where material_kind = 'page' and code = 'label-designer'
    `);
    const row = rows[0];
    const source = row?.source_text ?? '';
    const setDataStart = source.indexOf('async function setData(');
    const loadDataStart = source.indexOf('async function loadData(');
    const setDataSource = setDataStart >= 0 && loadDataStart > setDataStart ? source.slice(setDataStart, loadDataStart) : '';
    const checks = {
      materialVersion: row?.material_version,
      hasStoreRepair: setDataSource.includes('ensureStoreIsUsable'),
      regeneratesIds: setDataSource.includes('preserveIds: false'),
      hasPageLoop: setDataSource.includes('for (const page of pages)'),
    };
    if (checks.materialVersion !== '1.6.2' || !checks.hasStoreRepair || !checks.regeneratesIds || !checks.hasPageLoop) {
      throw new Error(`Print designer material camera repair verification failed: ${JSON.stringify(checks)}`);
    }
    console.log(JSON.stringify({ applied: true, material: 'label-designer', materialVersion: row.material_version, checks }));
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
