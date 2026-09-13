import assert from 'node:assert/strict';
import { executeHumanTaskAdapter } from './human-task.adapter';
import type { CreateWorkflowTaskInput, WorkflowRuntimeStore } from './runtime.engine.types';
import type { WorkflowTaskRecord } from './runtime.types';

async function main() {
  await testAnyPolicyCreatesDurableTasksAndCompletesOne();
  await testAllPolicyWaitsForEveryTask();
  await testTimeoutCanAutoApprove();
  console.log('workflow human task adapter tests passed');
}

async function testAnyPolicyCreatesDurableTasksAndCompletesOne() {
  const { store, created, completed, events } = createStore();
  const result = await executeHumanTaskAdapter({
    tenantId: 'tenant-1', processInstanceId: 'instance-1', nodeInstanceId: 'node-1', nodeId: 'approval', title: 'Approval',
    completionStrategy: 'any', candidates: [{ type: 'user', id: 'user-1' }, { type: 'user', id: 'user-2' }]
  }, store, {
    createToken: async ({ idempotencyKey }) => ({ id: `wait:${idempotencyKey}` }),
    waitForToken: async <T>(tokenId: string) => ({ action: 'approve', taskId: tokenId.includes('user-1') ? created[0]?.id ?? 'task-1' : 'task-2', nodeId: 'approval' } as T)
  });
  assert.equal(created.length, 2);
  assert.equal(completed.length, 1);
  assert.equal(result.status, 'continued');
  assert.ok(events.includes('HUMAN_TASK_CREATED'));
  assert.ok(events.includes('HUMAN_TASK_COMPLETED'));
}

async function testAllPolicyWaitsForEveryTask() {
  const { store, created, completed } = createStore();
  const result = await executeHumanTaskAdapter({
    tenantId: 'tenant-1', processInstanceId: 'instance-1', nodeInstanceId: 'node-1', nodeId: 'approval', title: 'Approval',
    completionStrategy: 'all', candidates: [{ type: 'user', id: 'user-1' }, { type: 'user', id: 'user-2' }]
  }, store, {
    createToken: async ({ idempotencyKey }) => ({ id: `wait:${idempotencyKey}` }),
    waitForToken: async <T>(tokenId: string) => ({ action: 'approve', taskId: created.find((task) => task.waitpointTokenId === tokenId)?.id ?? 'missing', nodeId: 'approval' } as T)
  });
  assert.equal(result.status, 'continued');
  assert.equal(completed.length, 2);
}

async function testTimeoutCanAutoApprove() {
  const { store, completed } = createStore();
  const result = await executeHumanTaskAdapter({
    tenantId: 'tenant-1', processInstanceId: 'instance-1', nodeInstanceId: 'node-1', nodeId: 'approval', title: 'Approval',
    completionStrategy: 'any', timeoutSeconds: 0.001, onTimeout: 'autoApprove', candidates: [{ type: 'user', id: 'user-1' }]
  }, store, {
    createToken: async () => ({ id: 'wait:1' }),
    waitForToken: async <T>() => new Promise<T>(() => undefined),
    waitFor: async () => undefined
  });
  assert.equal(result.status, 'continued');
  assert.equal(completed.length, 1);
}

function createStore() {
  const created: WorkflowTaskRecord[] = [];
  const completed: string[] = [];
  const events: string[] = [];
  const store = {
    listNodeTasks: async () => created,
    createTasks: async (inputs: CreateWorkflowTaskInput[]) => {
      const tasks = inputs.map((input: CreateWorkflowTaskInput) => ({ ...input, status: 'pending', createdAt: new Date().toISOString() })) as WorkflowTaskRecord[];
      created.push(...tasks);
      return tasks;
    },
    markWaitpointCompleted: async (taskId: string) => completed.push(taskId),
    recordHistory: async (_tenantId: string, _instanceId: string, eventType: string) => events.push(eventType)
  } as unknown as WorkflowRuntimeStore;
  return { store, created, completed, events };
}

void main();
