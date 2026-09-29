import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const MIGRATION_FILE = 'supabase/migrations/20260929140000_vxe_upload_backend_preview.sql';

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
        material_version: string;
        uses_backend_upload: boolean;
        uses_signed_upload: boolean;
        show_preview: boolean;
      }>(`
        select
          material.material_version,
          position('/api/files/upload' in material.source_text) > 0 as uses_backend_upload,
          position('createUploadIntent' in material.source_text) > 0 as uses_signed_upload,
          coalesce((field.value -> 'props' ->> 'showPreview')::boolean, false) as show_preview
        from public.lowcode_materials material
        cross join public.lowcode_form_definitions definition
        cross join lateral jsonb_array_elements(definition.schema -> 'fields') field(value)
        where material.material_kind = 'form'
          and material.code = 'vxe-upload'
          and definition.code = 'print-designer.background'
          and definition.enabled
          and field.value ->> 'field' = 'imageUrl'
        limit 1
      `);
      const installed = result.rows[0];
      if (!installed?.uses_backend_upload || installed.uses_signed_upload || !installed.show_preview) {
        throw new Error(`VxeUpload backend preview migration verification failed: ${JSON.stringify(installed)}.`);
      }
      console.log(JSON.stringify({ ...installed, applied: true }));
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
