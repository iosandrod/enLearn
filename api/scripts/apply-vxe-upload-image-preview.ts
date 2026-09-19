import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const MIGRATION_FILE = 'supabase/migrations/20260919160000_vxe_upload_image_preview.sql';

async function main() {
  const env = getEnv();
  const connectionStrings = [
    env.DIRECT_URL,
    process.env.DIRECT_URL,
    env.DATABASE_URL,
    process.env.DATABASE_URL,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => values.indexOf(value) === index);

  if (!connectionStrings.length) throw new Error('DIRECT_URL or DATABASE_URL is required.');

  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const migration = await readFile(resolve(repoRoot, MIGRATION_FILE), 'utf8');
  let applyError: unknown;

  for (const connectionString of connectionStrings) {
    const client = createClient(connectionString);
    try {
      await client.connect();
      await client.query(migration);
      const { rows } = await client.query<{
        material_version: string;
        has_image_preview: boolean;
        has_video_player: boolean;
      }>(`
        select
          material_version,
          position('v-if="isImagePreview && activePreviewUrl"' in source_text) > 0 as has_image_preview,
          position('new Artplayer({' in source_text) > 0 as has_video_player
        from public.lowcode_materials
        where material_kind = 'form' and code = 'vxe-upload'
      `);
      const installed = rows[0];
      if (!installed || !installed.has_image_preview || !installed.has_video_player) {
        throw new Error(`VxeUpload image preview was not installed correctly: ${JSON.stringify(installed)}.`);
      }
      console.log(JSON.stringify({ ...installed, applied: true }));
      return;
    } catch (error) {
      applyError = error;
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  throw applyError;
}

function createClient(rawConnectionString: string) {
  const url = new URL(normalizePostgresConnectionString(rawConnectionString));
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  const client = new Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false },
  });
  client.on('error', () => undefined);
  return client;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
