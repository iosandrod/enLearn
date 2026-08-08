import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const PAGE_CODE = process.env.PAGE_INFO_TEST_CODE ?? 'admin-system-entities';

function getRepoRoot() {
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, 'supabase/migrations'))) return cwd;
  const parent = resolve(cwd, '..');
  if (existsSync(resolve(parent, 'supabase/migrations'))) return parent;
  throw new Error('Could not find the repository root.');
}

function readDotEnv(filePath: string) {
  if (!existsSync(filePath)) return {} as Record<string, string>;
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .reduce<Record<string, string>>((env, rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) return env;
      const separatorIndex = line.indexOf('=');
      if (separatorIndex < 0) return env;
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');
      env[key] = value;
      return env;
    }, {});
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function main() {
  const repoRoot = getRepoRoot();
  const env = {
    ...readDotEnv(resolve(repoRoot, '.env')),
    ...readDotEnv(resolve(repoRoot, '.env.local')),
  };
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ??
    env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const originalResult = await supabase
    .from('lowcode_pages')
    .select('*')
    .eq('code', PAGE_CODE)
    .single();
  if (originalResult.error) throw new Error(originalResult.error.message);

  const original = originalResult.data;
  const originalSchema = isRecord(original.schema) ? original.schema : {};
  const testName = `codexRoundTrip${Date.now()}`;
  const testFunction = {
    name: testName,
    label: '页面函数保存往返测试',
    description: '验证名称、标题、说明、启用状态和完整脚本。',
    enabled: false,
    script: 'async function main() {\n  return { value: this.event.args.value };\n}',
  };
  const testApi = {
    serviceName: 'entityDesign',
    serviceMethod: 'validateView',
    method: 'POST',
    postData: { source: 'page-info-roundtrip' },
    resultPath: 'columns',
  };
  const testApiName = `${testName}Api`;
  const testSchema = {
    ...originalSchema,
    functions: [
      ...(Array.isArray(originalSchema.functions) ? originalSchema.functions : []),
      testFunction,
    ],
    apis: {
      ...(isRecord(originalSchema.apis) ? originalSchema.apis : {}),
      [testApiName]: testApi,
    },
  };

  let restored = false;
  try {
    const updateResult = await supabase
      .from('lowcode_pages')
      .update({ schema: testSchema })
      .eq('id', original.id);
    if (updateResult.error) throw new Error(updateResult.error.message);

    const rereadResult = await supabase
      .from('lowcode_pages')
      .select('schema')
      .eq('id', original.id)
      .single();
    if (rereadResult.error) throw new Error(rereadResult.error.message);
    const rereadSchema = isRecord(rereadResult.data.schema) ? rereadResult.data.schema : {};
    const rereadFunction = Array.isArray(rereadSchema.functions)
      ? rereadSchema.functions.find(
          (item) => isRecord(item) && item.name === testName,
        )
      : undefined;
    const rereadApi = isRecord(rereadSchema.apis) ? rereadSchema.apis[testApiName] : undefined;
    assert.deepEqual(
      rereadFunction,
      testFunction,
      'The page function did not survive the database round trip.',
    );
    assert.deepEqual(
      rereadApi,
      testApi,
      'The page API did not survive the database round trip.',
    );

    console.log(JSON.stringify({
      ok: true,
      pageCode: PAGE_CODE,
      functionName: testName,
      apiName: testApiName,
    }));
  } finally {
    const restoreResult = await supabase
      .from('lowcode_pages')
      .update({ schema: original.schema })
      .eq('id', original.id);
    if (restoreResult.error) throw new Error(`Restore failed: ${restoreResult.error.message}`);
    const restoredResult = await supabase
      .from('lowcode_pages')
      .select('schema')
      .eq('id', original.id)
      .single();
    if (restoredResult.error) throw new Error(`Restore verification failed: ${restoredResult.error.message}`);
    assert.deepEqual(
      restoredResult.data.schema,
      original.schema,
      'The original page schema was not restored exactly.',
    );
    restored = true;
  }

  if (!restored) throw new Error('The original page schema was not restored.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
