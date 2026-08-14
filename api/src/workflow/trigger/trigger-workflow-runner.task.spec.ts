import assert from 'node:assert/strict';
import { executeTriggerWorkflowJobPlan } from './trigger-workflow-runner.task';
import type {
  TriggerWorkflowJobDefinitionPayload,
  TriggerWorkflowTaskJobAdapter
} from './trigger-workflow.types';
import { resolveTriggerWorkflowQueueName } from './trigger-workflow-queues';

async function main() {
  assert.equal(resolveTriggerWorkflowQueueName(undefined), undefined);
  assert.equal(resolveTriggerWorkflowQueueName('trigger-workflow-jobs'), 'trigger-workflow-jobs');
  assert.throws(
    () => resolveTriggerWorkflowQueueName('frontend-command-jobs'),
    /not registered/
  );
  const calls: Array<{
    type: string;
    executorTaskId: string;
    payload: Record<string, unknown>;
  }> = [];
  const definition = createDefinition();
  const output = await executeTriggerWorkflowJobPlan({
    runId: 'run-1',
    jobId: 'job-1',
    tenantId: 'account-1',
    userId: 'user-1',
    payload: { message: '当前节点函数消息', recordId: 'record-1' },
    definition,
    executeAdapter: async (_operation, adapter, payload) => {
      calls.push({
        type: adapter.type,
        executorTaskId: adapter.executorTaskId,
        payload: payload.payload
      });
      return adapter.type === 'frontendCommand'
        ? { commandId: 'command-1' }
        : { registered: true };
    }
  });

  assert.deepEqual(calls, [
    {
      type: 'frontendCommand',
      executorTaskId: 'workflow.adapter.frontend-command',
      payload: { message: '当前节点函数消息' }
    },
    {
      type: 'registeredTask',
      executorTaskId: 'notification.dispatch',
      payload: { sourceId: 'record-1', commandId: 'command-1' }
    }
  ]);
  assert.deepEqual(output.variables, {
    taskOutputs: { command: { commandId: 'command-1' } }
  });
  assert.deepEqual(output.operationOutputs, {
    frontend: { commandId: 'command-1' },
    registered: { registered: true }
  });
  console.log('workflow-api Trigger workflow runner dispatch tests passed');
}

function createDefinition(): TriggerWorkflowJobDefinitionPayload {
  const frontend: TriggerWorkflowTaskJobAdapter = {
    type: 'frontendCommand',
    executorTaskId: 'workflow.adapter.frontend-command',
    functionSource: "async () => ({ code: 'message.show', params: { message: 'ok' } })",
    input: { message: '{{payload.message}}' },
    outputPath: 'taskOutputs.command'
  };
  const registered: TriggerWorkflowTaskJobAdapter = {
    type: 'registeredTask',
    executorTaskId: 'notification.dispatch',
    input: {
      sourceId: '{{payload.recordId}}',
      commandId: '{{variables.taskOutputs.command.commandId}}'
    }
  };
  return {
    version: 1,
    modelId: 'model-1',
    modelCode: 'typed-workflow',
    modelName: 'Typed workflow',
    planSignature: 'fnv1a-test',
    executionPlan: {
      workflowId: 'model-1',
      workflowCode: 'typed-workflow',
      workflowName: 'Typed workflow',
      entryNodeId: 'start',
      operations: [
        operation('start', 'entry', ['frontend']),
        { ...operation('frontend', 'task.trigger', ['registered']), adapter: frontend },
        { ...operation('registered', 'task.trigger', ['end']), adapter: registered },
        operation('end', 'complete', [])
      ]
    }
  };
}

function operation(nodeId: string, type: string, next: string[]) {
  return {
    id: `op_${nodeId}`,
    nodeId,
    type,
    label: nodeId,
    dependsOn: [],
    next,
    options: {}
  };
}

void main();
