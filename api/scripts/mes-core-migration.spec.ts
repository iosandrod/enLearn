import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const source = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260811170000_mes_core.sql'),
  'utf8'
);

const tables = [
  'mes_work_order',
  'mes_work_order_operation',
  'mes_work_order_component',
  'mes_production_transaction',
  'mes_material_transaction',
  'mes_command_log',
  'mes_outbox_event',
  'mes_inbox_message'
];
for (const table of tables) {
  assert.match(source, new RegExp(`create table if not exists public\\.${table}\\b`));
  assert.match(source, new RegExp(`alter table public\\.${table} enable row level security;`));
}

for (const command of [
  'mes_release_work_order',
  'mes_start_operation',
  'mes_report_production',
  'mes_issue_material',
  'mes_complete_operation'
]) {
  assert.match(source, new RegExp(`create or replace function public\\.${command}\\(`));
  assert.match(source, new RegExp(`perform public\\.mes_assert_command_permission\\(p_account_id\\);[\\s\\S]*?mes_claim_command`, 'm'));
  assert.match(source, new RegExp(`grant execute on function public\\.${command}\\([\\s\\S]*?to authenticated, service_role;`, 'm'));
}

assert.match(source, /if auth\.uid\(\) is null then\s*raise exception 'Authenticated MES caller required\.'/s);
assert.match(source, /p_user_id is distinct from auth\.uid\(\)/);
assert.match(source, /localSequence must be non-negative/);
assert.match(source, /unique \(account_id, command_id\)/);
assert.match(source, /unique \(account_id, device_id, local_sequence\)/);
assert.match(source, /MES command id was reused with different data/);
assert.match(source, /MES operation version conflict/);
assert.match(source, /mes_production_transaction_immutable/);
assert.match(source, /mes_material_transaction_immutable/);
assert.match(source, /MES fact records are immutable/);
assert.match(source, /insert into public\.mes_outbox_event/);
assert.match(source, /route_snapshot jsonb not null/);
assert.match(source, /bom_snapshot jsonb not null/);
assert.match(source, /resource_snapshot jsonb not null/);
assert.match(source, /version_row\.status <> 'published'/);
assert.match(source, /previously_released \+ released_quantity > plan_row\.quantity/);
assert.match(source, /revoke insert, update, delete on public\.%I from authenticated/);
assert.match(source, /revoke all on function public\.mes_assert_command_permission\(uuid\)\s+from public, anon, authenticated;/s);
assert.match(source, /grant execute on function public\.mes_assert_command_permission\(uuid\)\s+to service_role;/s);

for (const forbidden of [
  /grant (?:insert|update|delete)[^;]* on public\.mes_(?:work_order|work_order_operation|work_order_component|production_transaction|material_transaction)[^;]* to authenticated/i,
  /create policy[\s\S]*?for (?:insert|update|delete) to authenticated/i
]) {
  assert.doesNotMatch(source, forbidden);
}

console.log('MES core migration contract tests passed');
