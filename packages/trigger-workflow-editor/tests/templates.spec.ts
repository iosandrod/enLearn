import { strict as assert } from 'node:assert';
import { compileTriggerWorkflow, type TriggerWorkflowOperationType } from '../src/compiler/trigger';
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

console.log('trigger-workflow-editor template/compiler tests passed');
