import assert from 'node:assert/strict';
import {
  TRIGGER_WORKFLOW_ADAPTER_TASK_IDS,
  TRIGGER_WORKFLOW_RUNNER_TASK_ID,
  buildTriggerWorkflowJob
} from '../src/job-adapters';
import { TRIGGER_WORKFLOW_REGISTERED_QUEUE_NAMES } from '../src/runtime-catalog';
import type { TriggerWorkflowModel } from '../src/schema/types';

const model: TriggerWorkflowModel = {
  schemaVersion: 1,
  id: 'model-1',
  code: 'typed_job_adapters',
  name: 'Typed Job adapters',
  kind: 'custom',
  nodes: [
    { id: 'start', type: 'start', name: 'Start' },
    {
      id: 'frontend',
      type: 'task',
      name: 'Frontend command',
      config: {
        task: {
          type: 'frontendCommand',
          id: 'frontend.command.message.loop',
          frontendFunction: "async ({ payload }) => ({ code: 'message.show', params: { message: payload.message, type: 'success' } })",
          input: { message: '{{payload.message}}' }
        },
        metadata: {
          message: '接受指令成功',
          repeatCount: 6,
          intervalSeconds: 10
        }
      }
    },
    {
      id: 'backend',
      type: 'task',
      name: 'Backend command',
      config: {
        task: {
          type: 'backendCommand',
          backendFunction: "async ({ context }) => context.http.get('/health')"
        }
      }
    },
    {
      id: 'procedure',
      type: 'task',
      name: 'Stored procedure',
      config: {
        task: {
          type: 'storedProcedure',
          procedureName: 'publish_plan',
          input: { p_id: '{{payload.id}}' }
        }
      }
    },
    {
      id: 'registered',
      type: 'task',
      name: 'Registered task',
      config: {
        task: { type: 'registeredTask', id: 'notification.dispatch' }
      }
    },
    { id: 'end', type: 'end', name: 'End' }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'frontend' },
    { id: 'e2', source: 'frontend', target: 'backend' },
    { id: 'e3', source: 'backend', target: 'procedure' },
    { id: 'e4', source: 'procedure', target: 'registered' },
    { id: 'e5', source: 'registered', target: 'end' }
  ]
};

const job = buildTriggerWorkflowJob(model);
assert.equal(job.code, model.code);
assert.equal(job.name, model.name);
assert.equal(job.type, 'manual');
assert.equal(job.triggerTaskId, TRIGGER_WORKFLOW_RUNNER_TASK_ID);
assert.equal(job.payload.triggerWorkflow.modelId, model.id);
assert.equal(job.concurrencyKey, `trigger-workflow:${model.id}`);
assert.match(job.payload.triggerWorkflow.planSignature, /^fnv1a-[0-9a-f]{8}$/);

const adapters = job.payload.triggerWorkflow.executionPlan.operations
  .flatMap((operation) => operation.adapter ? [operation.adapter] : []);
assert.deepEqual(adapters.map((adapter) => adapter.type), [
  'frontendCommand',
  'backendCommand',
  'storedProcedure',
  'registeredTask'
]);
assert.deepEqual(adapters.map((adapter) => adapter.executorTaskId), [
  TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.frontendCommand,
  TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.backendCommand,
  TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.storedProcedure,
  'notification.dispatch'
]);
assert.equal(JSON.stringify(job).includes('frontend.command.message.loop'), false);
assert.equal(JSON.stringify(job).includes('接受指令成功'), false);
assert.equal(JSON.stringify(job).includes('repeatCount'), false);
assert.equal(JSON.stringify(job).includes('intervalSeconds'), false);

const queued = structuredClone(model);
const queuedTask = queued.nodes.find((node) => node.id === 'registered')?.config?.task;
assert.ok(queuedTask);
queuedTask.queue = { name: TRIGGER_WORKFLOW_REGISTERED_QUEUE_NAMES[0] };
const queuedAdapter = buildTriggerWorkflowJob(queued).payload.triggerWorkflow.executionPlan.operations
  .find((operation) => operation.nodeId === 'registered')?.adapter;
assert.deepEqual(queuedAdapter?.queue, { name: TRIGGER_WORKFLOW_REGISTERED_QUEUE_NAMES[0] });

const unregisteredQueue = structuredClone(model);
const unregisteredTask = unregisteredQueue.nodes.find(
  (node) => node.id === 'registered'
)?.config?.task;
assert.ok(unregisteredTask);
unregisteredTask.queue = { name: 'frontend-command-jobs' };
assert.throws(
  () => buildTriggerWorkflowJob(unregisteredQueue),
  /未随当前 worker 注册|not registered/
);

const dynamicConcurrency = structuredClone(model);
const dynamicConcurrencyTask = dynamicConcurrency.nodes.find(
  (node) => node.id === 'registered'
)?.config?.task;
assert.ok(dynamicConcurrencyTask);
dynamicConcurrencyTask.queue = {
  name: TRIGGER_WORKFLOW_REGISTERED_QUEUE_NAMES[0],
  concurrencyLimit: 2
};
assert.throws(
  () => buildTriggerWorkflowJob(dynamicConcurrency),
  /静态注册|defined by the workflow worker/
);

const scheduled = structuredClone(model);
scheduled.nodes[0] = {
  id: 'start',
  type: 'schedule',
  name: 'Schedule',
  config: { schedule: { cron: '0 8 * * *', timezone: 'Asia/Shanghai' } }
};
assert.deepEqual(
  {
    type: buildTriggerWorkflowJob(scheduled).type,
    cronExpr: buildTriggerWorkflowJob(scheduled).cronExpr
  },
  { type: 'cron', cronExpr: '0 8 * * *' }
);

const unsupported = structuredClone(model);
unsupported.nodes[1] = {
  id: 'frontend',
  type: 'manualApproval',
  name: 'Approval',
  config: { approval: { assigneeType: 'role' } }
};
assert.throws(() => buildTriggerWorkflowJob(unsupported), /human\.approval is not supported/);

console.log('trigger-workflow-editor typed Job adapter tests passed');
