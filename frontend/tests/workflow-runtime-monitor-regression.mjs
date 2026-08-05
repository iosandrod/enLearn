import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const designerSource = await readFile(
  new URL('../pages/dashboard/workflow/designer.vue', import.meta.url),
  'utf8'
);
const workflowServiceSource = await readFile(
  new URL('../../api/src/workflow/workflow.service.ts', import.meta.url),
  'utf8'
);

assert.match(
  designerSource,
  /ri-pulse-line[\s\S]*运行监控[\s\S]*openRuntimeMonitor/,
  'The workflow designer must expose the Trigger.dev runtime monitor button.'
);
assert.match(
  designerSource,
  /role="dialog"[\s\S]*runtimeMonitorData\.workflows[\s\S]*runtimeMonitorData\.runs[\s\S]*runtimeMonitorData\.queues/,
  'The runtime monitor must render business workflows, Trigger runs, and queues.'
);
assert.match(
  designerSource,
  /terminateWorkflowFromMonitor[\s\S]*invokeWorkflowService<WorkflowRuntimeInstance>\('terminateInstance'/,
  'Closing a monitored workflow must use the formal terminateInstance action.'
);
assert.match(
  workflowServiceSource,
  /case 'getRuntimeStatus':[\s\S]*triggerRuntimeStatus\.getStatus\(this\.resolveActor\(context\)\.tenantId\)/,
  'The gateway service must invoke the runtime status domain service directly.'
);
assert.match(
  workflowServiceSource,
  /case 'getApprovalConsole':[\s\S]*approvalConsoleService\.listInstances/,
  'Runtime status must be scoped to the authenticated tenant.'
);
assert.doesNotMatch(workflowServiceSource, /path:\s*['"`]\/|workflowClient\.send|WORKFLOW_REQUEST_PATTERN/);

console.log('Workflow Trigger.dev runtime monitor regression test passed.');
