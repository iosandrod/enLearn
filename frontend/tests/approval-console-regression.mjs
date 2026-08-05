import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [page, router, migration, viewer, workflowService] = await Promise.all([
  readFile(new URL('../pages/dashboard/approval/console.vue', import.meta.url), 'utf8'),
  readFile(new URL('../src/router.ts', import.meta.url), 'utf8'),
  readFile(
    new URL('../../supabase/migrations/20260805113000_approval_flow_console.sql', import.meta.url),
    'utf8'
  ),
  readFile(
    new URL('../../packages/approval-workflow/src/components/ApprovalRuntimeViewer.vue', import.meta.url),
    'utf8'
  ),
  readFile(new URL('../../api/src/workflow/workflow.service.ts', import.meta.url), 'utf8')
]);

assert.match(router, /path: '\/dashboard\/approval\/console'/);
assert.match(page, /审批流总控制台/);
assert.match(page, /ApprovalRuntimeViewer/);
assert.match(page, /getApprovalConsole/);
assert.match(page, /getApprovalConsoleDetail/);
assert.match(page, /terminateInstance/);
assert.match(page, /管理员从审批流总控制台终止流程/);

for (const status of ['completed', 'waiting', 'rejected', 'failed', 'skipped', 'pending']) {
  assert.match(viewer, new RegExp(`['\"]${status}['\"]|--${status}`));
}

assert.match(migration, /'approval-flow-console'/);
assert.match(migration, /'\/dashboard\/approval\/console'/);
assert.match(migration, /where parent\.code = 'approval-management-root'/);
assert.match(migration, /'workflow\.runtime\.manage'/);
assert.match(workflowService, /getApprovalConsole:/);
assert.match(workflowService, /getApprovalConsoleDetail:/);
assert.match(workflowService, /assertRuntimeManagementAccess/);

console.log('Approval flow console regression test passed.');
