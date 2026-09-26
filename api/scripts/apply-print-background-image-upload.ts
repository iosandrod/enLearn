import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const MIGRATION_FILE = 'supabase/migrations/20260926140000_print_background_image_upload_props.sql';
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
        field_props: Record<string, unknown> | null;
      }>(`
        select field.value -> 'props' as field_props
        from public.lowcode_form_definitions definition
        cross join lateral jsonb_array_elements(definition.schema -> 'fields') field(value)
        where definition.code = $1
          and field.value ->> 'field' = 'imageUrl'
      `, [FORM_CODE]);
      const props = result.rows[0]?.field_props ?? {};
      const fileTypes = Array.isArray(props.fileTypes) ? props.fileTypes : [];
      if (
        !fileTypes.includes('png') ||
        props.mode !== 'image' ||
        !Array.isArray(props.imageTypes) ||
        !props.imageTypes.includes('png') ||
        props.previewType !== 'image' ||
        props.buttonText !== '选择图片' ||
        props.multiple !== false
      ) {
        throw new Error(`Print background image upload verification failed: ${JSON.stringify({ fileTypes, previewType: props.previewType, buttonText: props.buttonText, multiple: props.multiple })}`);
      }
      console.log(JSON.stringify({
        applied: true,
        form: FORM_CODE,
        component: 'vxe-upload',
        uploadType: 'image',
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
