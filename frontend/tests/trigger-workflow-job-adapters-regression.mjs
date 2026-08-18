import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const designer = await readFile(
  new URL('../pages/dashboard/trigger-workflow/designer.vue', import.meta.url),
  'utf8',
);
const adapters = await readFile(
  new URL('../../packages/trigger-workflow-editor/src/job-adapters.ts', import.meta.url),
  'utf8',
);
const runner = await readFile(
  new URL('../../api/src/workflow/trigger/trigger-workflow-runner.task.ts', import.meta.url),
  'utf8',
);
const editorQueueCatalog = await readFile(
  new URL('../../packages/trigger-workflow-editor/src/runtime-catalog.ts', import.meta.url),
  'utf8',
);
const workerQueueCatalog = await readFile(
  new URL('../../api/src/workflow/trigger/trigger-workflow-queues.ts', import.meta.url),
  'utf8',
);

for (const legacyName of [
  'demoJobCode',
  'demoTaskId',
  'createFrontendCommandJob',
  'runFrontendCommandJob',
  'createFrontendCommandWorkflowModel',
  'frontend.command.message.loop',
  '接受指令成功',
]) {
  assert.equal(designer.includes(legacyName), false, `Designer still contains ${legacyName}.`);
}

assert.match(designer, /buildTriggerWorkflowJob\(model\.value\)/);
assert.match(designer, /workflowApi<WorkflowJobRecord>\('upsertJob', definition\)/);
assert.match(designer, /readJobPlanSignature\(workflowJob\.value\) === currentPlanSignature\.value/);
assert.match(adapters, /frontendCommand:[\s\S]*backendCommand:[\s\S]*storedProcedure:[\s\S]*registeredTask:/);
assert.match(runner, /const executorTaskId = resolveAdapterExecutorTaskId\(adapter\)/);
assert.match(runner, /function resolveAdapterExecutorTaskId[\s\S]*assertWorkflowRegisteredTaskId\(adapter\.executorTaskId\)/);
assert.match(runner, /TRIGGER_WORKFLOW_ADAPTER_TASK_IDS\[adapter\.type\]/);
assert.match(runner, /tasks\.triggerAndWait\(executorTaskId/);
assert.match(runner, /adapter\.type === 'registeredTask'/);
assert.match(editorQueueCatalog, /trigger-workflow-jobs/);
assert.match(editorQueueCatalog, /planning-supply/);
assert.match(workerQueueCatalog, /trigger-workflow-jobs/);
assert.match(workerQueueCatalog, /planning-supply/);
assert.match(workerQueueCatalog, /TRIGGER_WORKFLOW_REGISTERED_QUEUES\.map/);
assert.match(runner, /resolveTriggerWorkflowQueueName\(adapter\.queue\?\.name\)/);

console.log('Trigger workflow typed Job adapter regression passed.');
