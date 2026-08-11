import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const compensation = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260811180000_mes_compensation_commands.sql'),
  'utf8'
);
const pages = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260811190000_mes_lowcode_pages.sql'),
  'utf8'
);
const actionGuards = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260812110000_mes_runtime_action_guards.sql'),
  'utf8'
);

for (const command of [
  'mes_pause_operation',
  'mes_resume_operation',
  'mes_return_material',
  'mes_reverse_production',
  'mes_reverse_material'
]) {
  assert.match(compensation, new RegExp(`create or replace function public\\.${command}\\(`));
  assert.match(
    compensation,
    new RegExp(`grant execute on function public\\.${command}\\([\\s\\S]*?to authenticated, service_role;`, 'm')
  );
}

assert.match(compensation, /add column if not exists original_transaction_id uuid/);
assert.match(compensation, /uq_mes_production_single_reversal/);
assert.match(compensation, /uq_mes_material_single_reversal/);
assert.match(compensation, /Production transaction has already been reversed/);
assert.match(compensation, /Material transaction has already been reversed/);
assert.match(compensation, /Downstream execution facts must be compensated in reverse sequence first/);
assert.match(compensation, /insert into public\.mes_production_transaction[\s\S]*?'reverse'/m);
assert.match(compensation, /insert into public\.mes_material_transaction[\s\S]*?'return'/m);
assert.match(compensation, /insert into public\.mes_material_transaction[\s\S]*?'reverse'/m);
assert.match(compensation, /'mes\.operation\.paused'/);
assert.match(compensation, /'mes\.operation\.resumed'/);
assert.match(compensation, /'mes\.material\.returned'/);
assert.match(compensation, /'mes\.production\.reversed'/);
assert.match(compensation, /'mes\.material\.reversed'/);

for (const view of [
  'mes_work_order_runtime_view',
  'mes_work_order_operation_runtime_view',
  'mes_work_order_component_runtime_view',
  'mes_production_transaction_runtime_view',
  'mes_material_transaction_runtime_view'
]) {
  assert.match(pages, new RegExp(`create or replace view public\\.${view}`));
  assert.match(pages, new RegExp(`grant select on public\\.${view} to authenticated, service_role;`));
}

for (const page of [
  'mes_release_console',
  'mes_execution_console',
  'mes_production_ledger',
  'mes_material_ledger'
]) {
  assert.match(pages, new RegExp(`['"]${page}['"]`));
}

for (const method of [
  'pauseOperation',
  'resumeOperation',
  'returnMaterial',
  'reverseProduction',
  'reverseMaterial'
]) {
  assert.match(pages, new RegExp(`"serviceMethod": "${method}"`));
}

assert.match(pages, /'production-root', '生产管理'/);
assert.match(pages, /'production-execution', '生产执行工作台'/);
assert.match(pages, /from public\.admin_routes business_root\s+where business_root\.code = 'business-root'/);
assert.match(pages, /parent_id = excluded\.parent_id/);
assert.match(pages, /"permissionCode": "mes\.execution\.manage"/);
assert.doesNotMatch(pages, /"serviceMethod": "(?:createItem|updateItem|deleteItem|saveItem)"/);
assert.match(actionGuards, /page\.code = 'mes_execution_console'/);
assert.match(actionGuards, /work_order\.status not in \('closed', 'canceled'\)\) as reversible/);
assert.match(actionGuards, /"field":"available_to_return","operator":"gt","value":0/);
const executionGuardSection = actionGuards.split('with ledger_guards')[0];
assert.equal(
  (executionGuardSection.match(/rowActions,actions,\d+,visible/g) ?? []).length,
  9,
  'The execution console must keep all nine guarded row actions.'
);
assert.equal(
  (actionGuards.match(/mes_(?:production|material)_ledger/g) ?? []).length,
  2,
  'Both standalone ledgers must keep their reversal guard.'
);
assert.match(actionGuards, /available_to_return,[\s\S]*?work_order\.status as work_order_status/);
assert.match(actionGuards, /as reversible,[\s\S]*?work_order\.status as work_order_status/);

console.log('MES compensation and low-code migration contract tests passed');
