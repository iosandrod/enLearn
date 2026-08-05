import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const migrationFile = 'supabase/migrations/20260805100000_system_option_source_edit_page.sql';

function getRepoRoot() {
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, 'supabase/migrations'))) return cwd;

  const parent = resolve(cwd, '..');
  if (existsSync(resolve(parent, 'supabase/migrations'))) return parent;

  throw new Error('Could not find supabase/migrations from the current directory.');
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

function readPageSchema(migrationSource: string) {
  const match = migrationSource.match(/\$json\$\s*([\s\S]*?)\s*\$json\$::jsonb/);
  if (!match) throw new Error('Could not read the option-source edit page schema.');
  return JSON.parse(match[1]) as Record<string, unknown>;
}

function assertResult(error: { message: string } | null, operation: string) {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

async function main() {
  const repoRoot = getRepoRoot();
  const env = {
    ...readDotEnv(resolve(repoRoot, '.env')),
    ...readDotEnv(resolve(repoRoot, '.env.local')),
  };
  const supabaseUrl =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    env.SUPABASE_URL ??
    env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const schema = readPageSchema(readFileSync(resolve(repoRoot, migrationFile), 'utf8'));
  const now = new Date().toISOString();

  const existingEditResult = await supabase
    .from('lowcode_pages')
    .select('id, version')
    .eq('code', 'admin-system-options-edit')
    .maybeSingle();
  assertResult(existingEditResult.error, 'Read option-source edit page');

  const existingEdit = existingEditResult.data;
  const version = Number(existingEdit?.version ?? 0) + 1;
  const editPagePayload = {
    code: 'admin-system-options-edit',
    route: '/dashboard/system/options/edit',
    title: '下拉数据编辑',
    description: '维护下拉数据源的基础信息、来源配置与字典明细。',
    page_type: 'edit',
    layout: 'dashboard',
    status: 'published',
    keep_alive: false,
    schema,
    version,
    published_at: now,
    updated_at: now,
  };

  const editPageResult = existingEdit
    ? await supabase
        .from('lowcode_pages')
        .update(editPagePayload)
        .eq('id', existingEdit.id)
        .select('id, code, route, page_type, version')
        .single()
    : await supabase
        .from('lowcode_pages')
        .insert(editPagePayload)
        .select('id, code, route, page_type, version')
        .single();
  assertResult(editPageResult.error, 'Save option-source edit page');
  if (!editPageResult.data) throw new Error('Option-source edit page was not returned.');

  const versionResult = await supabase.from('lowcode_page_versions').upsert(
    {
      page_id: editPageResult.data.id,
      version,
      schema,
      published_at: now,
    },
    { onConflict: 'page_id,version' }
  );
  assertResult(versionResult.error, 'Save option-source edit page version');

  const listPageResult = await supabase
    .from('lowcode_pages')
    .select('id, code')
    .eq('code', 'admin-system-options')
    .single();
  assertResult(listPageResult.error, 'Read option-source list page');
  if (!listPageResult.data) throw new Error('Option-source list page was not found.');

  const linkResult = await supabase
    .from('lowcode_pages')
    .update({ edit_page_id: editPageResult.data.id, updated_at: now })
    .eq('id', listPageResult.data.id);
  assertResult(linkResult.error, 'Link option-source list and edit pages');

  console.log(JSON.stringify({
    list_code: listPageResult.data.code,
    edit_code: editPageResult.data.code,
    edit_route: editPageResult.data.route,
    edit_page_type: editPageResult.data.page_type,
    block_count: Array.isArray(schema.blocks) ? schema.blocks.length : 0,
    version,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
