import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [page, router, migration, viewer, workflowService, dashboardLayout] = await Promise.all([
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
  readFile(new URL('../../api/src/workflow/workflow.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../layouts/dashboard.vue', import.meta.url), 'utf8')
]);

assert.match(router, /path: '\/dashboard\/approval\/console'/);
assert.match(page, /流程实例/);
assert.match(page, /ApprovalRuntimeViewer/);
assert.match(page, /approval-console-workspace/);
assert.match(page, /approval-console-instance-list/);
assert.equal((page.match(/<ApprovalRuntimeViewer\b/g) ?? []).length, 1);
assert.match(page, /grid-template-columns: clamp\(340px, 27vw, 430px\) minmax\(0, 1fr\)/);
assert.match(page, /approval-console-flow-viewer \{ height: 100%; min-height: 0; \}/);
assert.match(page, /getApprovalConsole/);
assert.match(page, /getApprovalConsoleDetail/);
assert.doesNotMatch(page, /approval-console-header/);
assert.doesNotMatch(page, /approval-console-summary/);
assert.doesNotMatch(page, /approval-console-filters/);
assert.doesNotMatch(page, /approval-console-detail__header/);
assert.doesNotMatch(page, /approval-console-inspector/);
assert.doesNotMatch(page, /terminateInstance/);

for (const status of ['completed', 'waiting', 'rejected', 'failed', 'skipped', 'pending']) {
  assert.match(viewer, new RegExp(`['\"]${status}['\"]|--${status}`));
}

assert.match(migration, /'approval-flow-console'/);
assert.match(migration, /'\/dashboard\/approval\/console'/);
assert.match(migration, /where parent\.code = 'approval-management-root'/);
assert.match(migration, /'workflow\.runtime\.manage'/);
assert.match(workflowService, /case 'getApprovalConsole':[\s\S]*approvalConsoleService\.listInstances/);
assert.match(workflowService, /case 'getApprovalConsoleDetail':[\s\S]*approvalConsoleService\.getInstanceDetail/);
assert.match(workflowService, /assertRuntimeManagementAccess/);
assert.doesNotMatch(workflowService, /path:\s*['"`]\/console\/instances/);
assert.match(
  dashboardLayout,
  /class="admin-approval-console-button"[\s\S]*:to="APPROVAL_CONSOLE_PATH"[\s\S]*审批总控/
);
assert.match(
  dashboardLayout,
  /auth\.permissions\.value\.includes\('workflow\.runtime\.manage'\)/
);

console.log('Approval flow console regression test passed.');
