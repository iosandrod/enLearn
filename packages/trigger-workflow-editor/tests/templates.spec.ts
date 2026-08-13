import { strict as assert } from 'node:assert';
import { compileTriggerWorkflow, type TriggerWorkflowOperationType } from '../src/compiler/trigger';
import { normalizeTriggerWorkflow } from '../src/schema/normalize';
import { assertValidTriggerWorkflow } from '../src/schema/validate';
import type { TriggerWorkflowModel } from '../src/schema/types';
import {
  createAiAgentTriggerWorkflow,
  createApprovalTriggerWorkflow,
  createDataSyncTriggerWorkflow
} from '../src/templates';

const cases: Array<{
  name: string;
  create: () => TriggerWorkflowModel;
  expectedOperations: TriggerWorkflowOperationType[];
}> = [
  {
    name: 'approval',
    create: createApprovalTriggerWorkflow,
    expectedOperations: ['webhook', 'condition', 'human.approval', 'task.trigger', 'complete']
  },
  {
    name: 'data sync',
    create: createDataSyncTriggerWorkflow,
    expectedOperations: ['schedule', 'data.connector', 'task.trigger', 'task.batchTriggerAndWait', 'complete']
  },
  {
    name: 'AI agent',
    create: createAiAgentTriggerWorkflow,
    expectedOperations: ['webhook', 'task.trigger', 'ai.agent', 'parallel', 'task.triggerAndWait', 'human.approval', 'complete']
  }
];

for (const testCase of cases) {
  const workflow = testCase.create();
  assert.doesNotThrow(
    () => assertValidTriggerWorkflow(workflow),
    `${testCase.name} template should pass validation`
  );

  const plan = compileTriggerWorkflow(workflow);
  assert.equal(plan.workflowCode, workflow.code);
  assert.equal(plan.kind, workflow.kind);
  assert.equal(plan.operations.length, workflow.nodes.length);

  const operationTypes = new Set(plan.operations.map((operation) => operation.type));
  for (const expectedType of testCase.expectedOperations) {
    assert.ok(
      operationTypes.has(expectedType),
      `${testCase.name} template should compile a ${expectedType} operation`
    );
  }
}

const approvalPlan = compileTriggerWorkflow(createApprovalTriggerWorkflow());
assert.deepEqual(
  approvalPlan.operations.find((operation) => operation.nodeId === 'amount_condition')?.next,
  ['manager_approval', 'finance_approval']
);

const syncPlan = compileTriggerWorkflow(createDataSyncTriggerWorkflow());
assert.equal(syncPlan.schedule?.cron, '0 8 * * *');
assert.equal(syncPlan.schedule?.timezone, 'Asia/Shanghai');

const agentPlan = compileTriggerWorkflow(createAiAgentTriggerWorkflow());
assert.deepEqual(
  agentPlan.operations.find((operation) => operation.nodeId === 'tool_parallel')?.next,
  ['search_docs', 'draft_reply']
);
assert.ok(agentPlan.taskIds.includes('agent.support.triage'));
assert.ok(agentPlan.taskIds.includes('support.sendReply'));

const taskKindsWorkflow: TriggerWorkflowModel = {
  schemaVersion: 1,
  code: 'task_kinds',
  name: 'Task kinds',
  kind: 'custom',
  nodes: [
    { id: 'start', type: 'start', name: 'Start' },
    {
      id: 'frontend',
      type: 'task',
      name: 'Frontend',
      config: {
        task: {
          type: 'frontendCommand',
          frontendFunction: 'async () => ({ code: "message.show" })'
        }
      }
    },
    {
      id: 'backend',
      type: 'task',
      name: 'Backend',
      config: {
        task: {
          type: 'backendCommand',
          backendFunction: 'async ({ context }) => context.http.get("/health")'
        }
      }
    },
    {
      id: 'procedure',
      type: 'task',
      name: 'Procedure',
      config: {
        task: {
          type: 'storedProcedure',
          procedureSchema: 'public',
          procedureName: 'publish_plan'
        }
      }
    },
    {
      id: 'registered',
      type: 'task',
      name: 'Registered',
      config: { task: { type: 'registeredTask', id: 'custom.registered' } }
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
const taskKindsPlan = compileTriggerWorkflow(taskKindsWorkflow);
assert.deepEqual(taskKindsPlan.taskIds, ['custom.registered']);
assert.equal(
  taskKindsPlan.operations.find((operation) => operation.nodeId === 'procedure')?.task?.procedureName,
  'publish_plan'
);

const invalidFrontendWorkflow = structuredClone(taskKindsWorkflow);
const invalidFrontend = invalidFrontendWorkflow.nodes.find((node) => node.id === 'frontend');
assert.ok(invalidFrontend?.config?.task);
delete invalidFrontend.config.task.frontendFunction;
assert.throws(() => assertValidTriggerWorkflow(invalidFrontendWorkflow), /前端指令函数/);

const missingTaskTypeWorkflow = structuredClone(taskKindsWorkflow);
const registeredWithoutType = missingTaskTypeWorkflow.nodes.find((node) => node.id === 'registered');
assert.ok(registeredWithoutType?.config?.task);
delete registeredWithoutType.config.task.type;
assert.throws(() => assertValidTriggerWorkflow(missingTaskTypeWorkflow), /任务类型/);

const normalizedLegacyWorkflow = normalizeTriggerWorkflow({
  ...taskKindsWorkflow,
  nodes: taskKindsWorkflow.nodes.map((node) =>
    node.id === 'registered'
      ? { ...node, config: { task: { id: 'legacy.registered' } } }
      : node
  )
});
assert.equal(
  normalizedLegacyWorkflow.nodes.find((node) => node.id === 'registered')?.config?.task?.type,
  'registeredTask'
);

console.log('trigger-workflow-editor template/compiler tests passed');
