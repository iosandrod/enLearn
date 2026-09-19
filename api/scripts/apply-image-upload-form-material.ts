import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const MIGRATION_FILE = 'supabase/migrations/20260919150000_image_upload_form_material.sql';

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
      visual_option_count: number;
      runtime_option_count: number;
      material_count: number;
      property_form_count: number;
      property_field_count: number;
  }>(`
    select
      (select count(*)::integer
       from public.system_option_items
       where source_code = 'form_input_component_type'
         and value = 'image'
         and status = 'active') as visual_option_count,
      (select count(*)::integer
       from public.system_option_items
       where source_code = 'form_field_component_type'
         and value = 'vxe-upload'
         and status = 'active') as runtime_option_count,
      (select count(*)::integer
       from public.lowcode_materials
       where material_kind = 'form'
         and code = 'vxe-upload'
         and enabled = true
         and status = 'published'
         and aliases @> array['image']::text[]) as material_count,
      (select count(*)::integer
       from public.lowcode_form_definitions
       where code = 'material-prop.image'
         and enabled = true
         and schema->>'componentKey' = 'image'
         and schema#>>'{layout,0,kind}' = 'tabs') as property_form_count,
      (select jsonb_array_length(schema->'fields')
       from public.lowcode_form_definitions
       where code = 'material-prop.image'
         and enabled = true) as property_field_count
  `);

  const installed = rows[0];
  if (
    !installed ||
    installed.visual_option_count !== 1 ||
    installed.runtime_option_count !== 1 ||
    installed.material_count !== 1 ||
    installed.property_form_count !== 1 ||
    installed.property_field_count < 20
  ) {
    throw new Error(`Image upload material was not installed correctly: ${JSON.stringify(installed)}.`);
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
