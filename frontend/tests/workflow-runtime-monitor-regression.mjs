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
const rpcControllerSource = await readFile(
  new URL('../../api/src/workflow-service/workflow.rpc.controller.ts', import.meta.url),
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
  /getRuntimeStatus:[\s\S]*path: '\/runtime\/status'/,
  'The gateway service must expose the runtime status action.'
);
assert.match(
  rpcControllerSource,
  /resource === 'runtime'[\s\S]*idOrAction === 'status'[\s\S]*triggerRuntimeStatus\.getStatus\(actor\.tenantId\)/,
  'Runtime status must be scoped to the authenticated tenant.'
);

console.log('Workflow Trigger.dev runtime monitor regression test passed.');
