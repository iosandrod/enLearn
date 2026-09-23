import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const MIGRATION_FILE = 'supabase/migrations/20260923121000_print_background_form_definition.sql';
const FORM_CODE = 'print-designer.background';

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
      const result = await client.query<{
        code: string;
        enabled: boolean;
        title: string | null;
        field_count: number;
      }>(
        `select code, enabled, schema->>'title' as title,
                jsonb_array_length(schema->'fields')::integer as field_count
           from public.lowcode_form_definitions
          where code = $1`,
        [FORM_CODE],
      );
      const row = result.rows[0];
      if (!row?.enabled || row.field_count !== 4) {
        throw new Error(`Migration verification failed: ${JSON.stringify(row ?? null)}.`);
      }
      console.log(JSON.stringify({ applied: true, ...row }));
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
