import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const source = readFileSync(
  resolve(
    repoRoot,
    'supabase/migrations/20260812170000_mes_command_conflicts_and_refresh.sql'
  ),
  'utf8'
);

for (const command of [
  'mes_complete_command',
  'mes_start_operation',
  'mes_report_production',
  'mes_issue_material',
  'mes_complete_operation',
  'mes_pause_operation',
  'mes_resume_operation',
  'mes_return_material',
  'mes_reverse_production',
  'mes_reverse_material'
]) {
  assert.match(source, new RegExp(`'${command}'`));
}

assert.match(source, /pg_get_functiondef/);
assert.match(source, /'using errcode = ''40001'''/);
assert.match(source, /'using errcode = ''PT409'''/);
assert.match(source, /patched_count <> 10/);
assert.match(source, /page\.code = 'mes_execution_console'/);
assert.match(
  source,
  /\["workOrders","operations","components","productionTransactions","materialTransactions"\]/
);
assert.equal(
  (source.match(/\["blocks","3","tabs"/g) ?? []).length,
  9,
  'All nine execution-console commands must refresh version-dependent data.'
);

console.log('MES command conflict and refresh migration contract tests passed');
