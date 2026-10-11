import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../..');
const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20261012130000_admin_search_models.sql'),
  'utf8',
);
const service = readFileSync(resolve(__dirname, 'lowcode.service.ts'), 'utf8');
const runtime = readFileSync(
  resolve(repoRoot, 'packages/lowcode-framework/src/runtime/lowcode-page-script-runtime.ts'),
  'utf8',
);

assert.match(migration, /create table if not exists public\.admin_search_models/);
assert.match(migration, /user_id uuid not null default auth\.uid\(\)/);
assert.match(migration, /references public\.lowcode_pages\(code\)/);
assert.match(migration, /query_values jsonb not null default '\{\}'::jsonb/);
assert.match(migration, /create unique index if not exists admin_search_models_one_active_idx[\s\S]*where active/);
assert.match(migration, /create policy admin_search_models_owner[\s\S]*user_id = auth\.uid\(\)/);
assert.match(migration, /create or replace function public\.save_admin_search_model/);
assert.match(migration, /insert into public\.service_resource_metadata[\s\S]*'admin_search_models'/);

assert.match(service, /case 'saveSearchModel':[\s\S]*this\.saveSearchModel\(postData, context\)/);
assert.match(service, /getCurrentUser\(context\)[\s\S]*client\.rpc\('save_admin_search_model'/);
assert.match(runtime, /case 'searchModel\.save':[\s\S]*'lowcode', 'saveSearchModel'/);

console.log('Low-code search model persistence checks passed.');
