import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

async function main() {
  const env = getEnv();
  const connection = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!connection) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const root = process.cwd().toLowerCase().endsWith('api') ? resolve(process.cwd(), '..') : process.cwd();
  const migrations = await Promise.all([
    '20261017110000_array_table_property_form.sql',
    '20261017111000_array_table_button_scripts.sql',
  ].map(async (file) => (await readFile(resolve(root, 'supabase/migrations', file), 'utf8'))
    .replace(/^\s*(?:--[^\n]*\n)*\s*begin;\s*/i, '').replace(/\s*commit;\s*$/i, '')));
  const source = await readFile(resolve(root, 'packages/lowcode-framework/src/lowcode/form-materials/lc-array-table/index.vue'), 'utf8');
  const url = new URL(normalizePostgresConnectionString(connection));
  for (const key of ['pgbouncer', 'sslmode', 'uselibpqcompat']) url.searchParams.delete(key);
  const client = new Client({
    connectionString: url.toString(), connectionTimeoutMillis: 30_000,
    ssl: ['localhost', '127.0.0.1', '::1'].includes(url.hostname) ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query('begin');
    await client.query(`set local lock_timeout = '10s'`);
    await client.query(`set local statement_timeout = '60s'`);
    await client.query(`select pg_advisory_xact_lock(hashtext('array-table-property-form'))`);
    const loadSchema = async () => (await client.query(
      `select schema from public.lowcode_form_definitions where code = 'material-prop.array-table'`,
    )).rows[0]?.schema;
    const before = await loadSchema();
    assert.ok(before, 'Array-table property form must exist.');
    for (const sql of migrations) await client.query(sql);
    const schema = await loadSchema();
    for (const field of ['rowDraggable', 'rowDragConfig', 'showActions', 'actionWidth', 'rowActions', 'toolbarButtons']) {
      assert.equal(schema.fields.filter((item: any) => item.field === field).length, 1, `Missing or duplicated field: ${field}`);
    }
    for (const field of ['rowActions', 'toolbarButtons']) {
      const input = schema.fields.find((item: any) => item.field === field);
      assert.equal(input.props.rowDraggable, true);
      assert.ok(input.props.columns.some((column: any) => column.field === 'script' && column.component === 'lc-monaco-editor'));
    }
    for (const field of before.fields) {
      assert.ok(schema.fields.some((item: any) => item.field === field.field), `Existing field lost: ${field.field}`);
    }
    for (const tab of ['drag', 'actions', 'toolbar', 'behavior']) {
      assert.ok(schema.layout.some((node: any) => node.tabs?.some((item: any) => item.key === tab)));
    }
    // Reapplying must preserve the exact schema, including existing/custom blocks.
    await client.query(migrations[0]);
    assert.deepEqual(await loadSchema(), schema);
    const material = (await client.query(`select source_text, source_hash from public.lowcode_materials
      where material_kind = 'form' and code = 'lc-array-table'`)).rows[0];
    assert.equal(material?.source_text, source);
    assert.equal(material?.source_hash, createHash('sha256').update(source).digest('hex'));
    const checkOnly = process.argv.includes('--check-only');
    await client.query(checkOnly ? 'rollback' : 'commit');
    console.log(checkOnly
      ? 'Array-table property form and material verified (rolled back).'
      : 'Applied and verified array-table property form and material.');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  if (error && typeof error === 'object' && 'where' in error) console.error(error.where);
  process.exitCode = 1;
});
