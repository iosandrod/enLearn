import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const MIGRATION_FILE = 'supabase/migrations/20260927120000_print_designer_data_import.sql';

async function main() {
  const env = getEnv();
  const connectionStrings = [env.DIRECT_URL, env.DATABASE_URL]
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
      const result = await client.query<{ script: string }>(`
        select action.value ->> 'script' as script
        from public.lowcode_pages page
        cross join lateral jsonb_array_elements(page.schema -> 'blocks') block(value)
        cross join lateral jsonb_array_elements(block.value -> 'actions') action(value)
        where page.code = 'print-designer'
          and block.value ->> 'id' = 'label-designer-actions'
          and action.value ->> 'code' = 'label-excel'
      `);
      const script = result.rows[0]?.script ?? '';
      if (!script.includes("name: 'confirmForm'") || !script.includes('formCode')) {
        throw new Error('Print data import migration verification failed.');
      }
      console.log(JSON.stringify({ applied: true, button: 'label-excel' }));
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
    }
  }

  throw lastError;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
