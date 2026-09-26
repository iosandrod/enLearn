import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const MIGRATION_FILE = 'supabase/migrations/20260926120000_print_designer_material_load_fix.sql';

async function main() {
  const env = getEnv();
  const connectionStrings = [env.DIRECT_URL, process.env.DIRECT_URL, env.DATABASE_URL, process.env.DATABASE_URL]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => values.indexOf(value) === index);
  if (!connectionStrings.length) throw new Error('DIRECT_URL or DATABASE_URL is required.');

  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const migration = await readFile(resolve(repoRoot, MIGRATION_FILE), 'utf8');
  let lastError: unknown;

  for (const rawConnectionString of connectionStrings) {
    const url = new URL(normalizePostgresConnectionString(rawConnectionString));
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
      await client.query(migration);
      const { rows } = await client.query<{
        material_version: string | null;
        source_text: string | null;
      }>(`
        select material_version, source_text
        from public.lowcode_materials
        where material_kind = 'page' and code = 'label-designer'
      `);
      const row = rows[0];
      const source = row?.source_text ?? '';
      const oldTransactionWrapper = 'mergeRemoteChanges(() => instance.run';
      const setDataStart = source.indexOf('async function setData(');
      const loadDataStart = source.indexOf('async function loadData(');
      const setDataSource = setDataStart >= 0 && loadDataStart > setDataStart
        ? source.slice(setDataStart, loadDataStart)
        : '';
      const checks = {
        materialVersion: row?.material_version,
        hasNormalizer: source.includes('const normalizePageContent ='),
        hasCreatePage: source.includes('instance.createPage({ id: page.id, name: page.name })'),
        hasPutContent: source.includes('instance.putContentOntoCurrentPage'),
        hasCurrentPageRestore: source.includes('document.currentPageId'),
        hasOldTransactionWrapper: setDataSource.includes(oldTransactionWrapper),
      };
      if (
        checks.materialVersion !== '1.6.1' ||
        !checks.hasNormalizer ||
        !checks.hasCreatePage ||
        !checks.hasPutContent ||
        !checks.hasCurrentPageRestore ||
        checks.hasOldTransactionWrapper
      ) {
        throw new Error(`Print designer material load fix migration verification failed: ${JSON.stringify(checks)}`);
      }
      console.log(JSON.stringify({
        applied: true,
        material: 'label-designer',
        materialVersion: row.material_version,
        multiPageLoaderUpdated: true,
      }));
      return;
    } catch (error) {
      lastError = error;
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  throw lastError;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
