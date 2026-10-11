import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

async function main() {
  const env = getEnv();
  const raw = env.DIRECT_URL || env.DATABASE_URL;
  if (!raw) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const url = new URL(normalizePostgresConnectionString(raw));
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const ssl = !local && url.searchParams.get('sslmode') !== 'disable' && url.searchParams.has('sslmode');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  const client = new Client({ connectionString: url.toString(), ssl: ssl ? { rejectUnauthorized: false } : false, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
    const before = await client.query(`
      select count(*) as templates, count(preview) as previews,
        coalesce(sum(octet_length(preview)), 0)::text as preview_bytes,
        md5(coalesce(string_agg(id::text || coalesce(content::text, '') || coalesce(workspace::text, ''), '' order by id), '')) as content_hash
      from public.print_templates
    `);
    const migration = await readFile(resolve(process.cwd(), '..', 'supabase/migrations/20261011190000_clear_print_templates_preview.sql'), 'utf8');
    await client.query(migration);
    const after = await client.query(`
      select count(*) as templates, count(preview) as previews,
        md5(coalesce(string_agg(id::text || coalesce(content::text, '') || coalesce(workspace::text, ''), '' order by id), '')) as content_hash
      from public.print_templates
    `);
    if (after.rows[0].previews !== '0' || before.rows[0].content_hash !== after.rows[0].content_hash) {
      throw new Error('Preview cleanup verification failed.');
    }
    console.log(JSON.stringify({ clearedPreviews: Number(before.rows[0].previews), removedBytes: Number(before.rows[0].preview_bytes), templates: Number(after.rows[0].templates), remainingPreviews: 0, contentPreserved: true }));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
