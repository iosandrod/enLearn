import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const MIGRATION_FILE = 'supabase/migrations/20260919153000_form_material_component_map.sql';

async function main() {
  const env = getEnv();
  const rawConnectionStrings = [
    env.DIRECT_URL,
    process.env.DIRECT_URL,
    env.DATABASE_URL,
    process.env.DATABASE_URL,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => values.indexOf(value) === index);

  if (!rawConnectionStrings.length) {
    throw new Error('DIRECT_URL or DATABASE_URL is required.');
  }

  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const migration = await readFile(resolve(repoRoot, MIGRATION_FILE), 'utf8');
  let applyError: unknown;

  for (const rawConnectionString of rawConnectionStrings) {
    const client = createClient(rawConnectionString);
    try {
      await client.connect();
      const installed = await applyAndVerify(client, migration);
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

async function applyAndVerify(client: Client, migration: string) {
  await client.query(migration);
  const { rows } = await client.query<{
    material_count: number;
    mapping_count: number;
  }>(`
    with mapped_materials as (
      select manifest
      from public.lowcode_materials
      where material_kind = 'form'
        and code in (
          'vxe-input',
          'vxe-textarea',
          'vxe-password-input',
          'vxe-select',
          'vxe-switch',
          'vxe-checkbox-group',
          'vxe-radio-group',
          'lc-basic-control',
          'lc-array-table',
          'lc-sub-form',
          'vxe-upload'
        )
        and jsonb_typeof(manifest->'componentMap') = 'object'
    )
    select
      (select count(*)::integer from mapped_materials) as material_count,
      (select count(*)::integer
       from mapped_materials,
         lateral jsonb_each_text(manifest->'componentMap')) as mapping_count
  `);

  const installed = rows[0];
  if (!installed || installed.material_count !== 11 || installed.mapping_count !== 14) {
    throw new Error(
      `Form material component mappings were not installed correctly: ${JSON.stringify(installed)}.`,
    );
  }

  return installed;
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
