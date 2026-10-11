import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { lowCodeMaterialTypeFileSystem, materialCompilerFilename } from '../../packages/lowcode-framework/src/lowcode/material-runtime/compiler-policy';

const materialCodes = ['vxe-select', 'lc-option-select', 'lc-array-table'];
const optionSlot = '<template #default>{{ option.label }}({{ option.value }})</template>';
const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();

async function main() {
  const env = getEnv();
  const rawConnectionString = env.DIRECT_URL || env.DATABASE_URL;
  if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const url = new URL(normalizePostgresConnectionString(rawConnectionString));
  const localDatabase = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  const client = new Client({
    connectionString: url.toString(),
    ssl: localDatabase ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000,
  });
  const require = createRequire(resolve(repoRoot, 'frontend/package.json'));
  const { parse, compileScript } = require('@vue/compiler-sfc');

  await client.connect();
  try {
    await client.query('begin');
    await client.query(await readFile(resolve(
      repoRoot,
      'supabase/migrations/20261011110000_form_select_option_label_value_slots.sql',
    ), 'utf8'));

    const { rows } = await client.query<{
      code: string; source_path: string; source_text: string; source_hash: string;
    }>(`
      select code, source_path, source_text, source_hash
      from public.lowcode_materials
      where material_kind = 'form' and code = any($1::text[])
      order by code
    `, [materialCodes]);
    assert.equal(rows.length, materialCodes.length, 'Expected all three dropdown materials.');
    for (const row of rows) {
      assert.ok(row.source_text.includes(optionSlot), `Missing option slot: ${row.code}`);
      assert.equal(row.source_hash, createHash('sha256').update(row.source_text).digest('hex'));
      const { descriptor, errors } = parse(row.source_text, { filename: materialCompilerFilename(row.source_path) });
      assert.deepEqual(errors, [], `Invalid SFC: ${row.code}`);
      compileScript(descriptor, {
        id: `lc-${row.source_hash.slice(0, 12)}`,
        inlineTemplate: true,
        fs: lowCodeMaterialTypeFileSystem,
      });
    }
    await client.query('commit');
    console.log(JSON.stringify({ updatedMaterials: rows.map((row) => row.code), display: 'label(value)', compiled: rows.length }));
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
