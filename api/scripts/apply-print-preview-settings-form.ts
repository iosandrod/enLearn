import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

async function main() {
  const env = getEnv();
  const repoRoot = process.cwd().toLowerCase().endsWith('api') ? resolve(process.cwd(), '..') : process.cwd();
  const migration = await readFile(resolve(repoRoot, 'supabase/migrations/20261012160000_print_preview_settings_form.sql'), 'utf8');
  const connections = [...new Set([env.DIRECT_URL, env.DATABASE_URL].filter((value): value is string => Boolean(value?.trim())))];
  if (!connections.length) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  let client: Client | undefined;
  let lastError: unknown;
  for (const connection of connections) {
    const url = new URL(normalizePostgresConnectionString(connection));
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const ssl = !local && url.searchParams.has('sslmode') && url.searchParams.get('sslmode') !== 'disable';
    url.searchParams.delete('pgbouncer');
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    const candidate = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 15_000, ssl: ssl ? { rejectUnauthorized: false } : false });
    candidate.on('error', () => undefined);
    try {
      await candidate.connect();
      client = candidate;
      break;
    } catch (error) {
      lastError = error;
      await candidate.end().catch(() => undefined);
    }
  }
  if (!client) throw lastError;
  try {
    await client.query(migration);
    const result = await client.query(`select code, enabled, schema from public.lowcode_form_definitions where code = $1`, ['print-designer.preview-settings']);
    const row = result.rows[0];
    if (!row?.enabled || !['mode', 'materialId', 'detailField'].every(field => row.schema.fields.some((item: { field: string }) => item.field === field))) {
      throw new Error('Preview settings form verification failed.');
    }
    console.log(JSON.stringify({ applied: true, code: row.code, fields: row.schema.fields.map((field: { field: string }) => field.field) }));
  } finally {
    await client.end();
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Migration failed.');
  process.exitCode = 1;
});
