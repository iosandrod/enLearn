import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  executeTriggerWorkflowJobPlan,
  runTriggerWorkflowRunner
} from './trigger-workflow-runner.task';
import type {
  TriggerWorkflowJobDefinitionPayload,
  TriggerWorkflowTaskJobAdapter
} from './trigger-workflow.types';
import { resolveTriggerWorkflowQueueName } from './trigger-workflow-queues';
import {
  assertWorkflowRegisteredTaskId,
  getTriggerWorkflowExecutionPlanSignature
} from './trigger-workflow-policy';

async function main() {
  assert.equal(resolveTriggerWorkflowQueueName(undefined), undefined);
  assert.equal(resolveTriggerWorkflowQueueName('trigger-workflow-jobs'), 'trigger-workflow-jobs');
  assert.equal(resolveTriggerWorkflowQueueName('planning-supply'), 'planning-supply');
  assert.throws(
    () => resolveTriggerWorkflowQueueName('frontend-command-jobs'),
    /not registered/
  );
  assert.equal(assertWorkflowRegisteredTaskId('notification.dispatch'), 'notification.dispatch');
  assert.throws(
    () => assertWorkflowRegisteredTaskId('workflow.adapter.frontend-command'),
    /not registered for workflow-node execution/
  );
  await testRuntimePolicyRejectsTamperedAdapter();
  await testRunnerProjectsInvalidDefinitionAsFailed();
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

async function testRuntimePolicyRejectsTamperedAdapter() {
  const definition = createDefinition();
  const frontend = definition.executionPlan.operations.find(
    (operation) => operation.nodeId === 'frontend'
  );
  assert.ok(frontend?.adapter);
  frontend.adapter.executorTaskId = 'workflow.timer.fire';
  await assert.rejects(
    () => executeTriggerWorkflowJobPlan({
      runId: 'run-tampered',
      tenantId: 'account-1',
      payload: {},
      definition,
      executeAdapter: async () => ({})
    }),
    /frontendCommand adapter has an invalid executor Task ID/
  );
}

async function testRunnerProjectsInvalidDefinitionAsFailed() {
  const calls: Array<{ action: string; payload: Record<string, unknown> }> = [];
  const client = {
    rpc: async (
      _name: string,
      args: { p_action: string; p_payload: Record<string, unknown> }
    ) => {
      calls.push({ action: args.p_action, payload: args.p_payload });
      if (args.p_action === 'mark_run_running') {
        return { data: { id: 'run-invalid', status: 'running' }, error: null };
      }
      return { data: { id: 'run-invalid', status: 'failed' }, error: null };
    }
  } as unknown as SupabaseClient;
  const definition = createDefinition();
  definition.planSignature = 'fnv1a-00000000';

  await assert.rejects(
    () => runTriggerWorkflowRunner({
      runId: 'run-invalid',
      tenantId: 'account-1',
      triggerWorkflow: definition
    }, { supabase: client }),
    /planSignature does not match executionPlan/
  );

  assert.deepEqual(calls.map((call) => call.action), [
    'mark_run_running',
    'finish_run'
  ]);
  assert.equal(calls[1].payload.status, 'failed');
  assert.match(String(calls[1].payload.error_message), /planSignature/);
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
  const definition: TriggerWorkflowJobDefinitionPayload = {
    version: 1,
    modelId: 'model-1',
    modelCode: 'typed-workflow',
    modelName: 'Typed workflow',
    planSignature: '',
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
  definition.planSignature = getTriggerWorkflowExecutionPlanSignature(
    definition.executionPlan
  );
  return definition;
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
