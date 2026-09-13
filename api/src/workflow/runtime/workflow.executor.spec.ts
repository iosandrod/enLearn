import assert from 'node:assert/strict';
import type {
  CreateNodeInstanceInput,
  CreateWorkflowTaskInput,
  WorkflowInstanceTaskPayload,
  WorkflowRuntimeStore,
  WorkflowTaskDecision
} from './runtime.engine.types';
import type {
  NodeInstanceRecord,
  ProcessInstanceStatus,
  WorkflowTaskRecord
} from './runtime.types';
import { executeWorkflowInstance, type WorkflowWaitDriver } from './workflow.executor';

async function main() {
  await verifyHumanCompletionPolicy('any', 1, 2);
  await verifyHumanCompletionPolicy('all', 3, 0);
  await verifyHumanCompletionPolicy('ratio', 2, 1);
  await verifyConditionSelectsOneBranch();
  console.log('workflow executor policy tests passed');
}

async function verifyHumanCompletionPolicy(
  completionStrategy: 'any' | 'all' | 'ratio',
  expectedCompleted: number,
  expectedCanceled: number
) {
  const harness = createHarness({ route: 'service' });
  const schema = {
    schemaVersion: 1,
    code: `human-${completionStrategy}`,
    name: `Human ${completionStrategy}`,
    nodes: [
      { id: 'start', type: 'start', name: 'Start' },
      {
        id: 'review',
        type: 'sign',
        name: 'Review',
        config: {
          completionStrategy,
          passRatio: 0.6,
          assigneeStrategy: {
            type: 'users',
            userIds: ['user-1', 'user-2', 'user-3']
          }
        }
      },
      { id: 'end', type: 'end', name: 'End' }
    ],
    edges: [
      { id: 'start-review', source: 'start', target: 'review' },
      { id: 'review-end', source: 'review', target: 'end' }
    ]
  };

  const result = await executeWorkflowInstance(payload(schema), harness.store, harness.waits);
  const reviewTasks = harness.tasks.filter((task) => task.nodeId === 'review');

  assert.equal(result.status, 'completed');
  assert.equal(harness.status, 'approved');
  assert.equal(reviewTasks.length, 3);
  assert.equal(reviewTasks.filter((task) => task.status === 'completed').length, expectedCompleted);
  assert.equal(reviewTasks.filter((task) => task.status === 'canceled').length, expectedCanceled);
  assert.equal(harness.nodes.find((node) => node.nodeId === 'end')?.status, 'completed');
}

async function verifyConditionSelectsOneBranch() {
  const harness = createHarness({ route: 'right' });
  const schema = {
    schemaVersion: 1,
    code: 'condition-route',
    name: 'Condition route',
    nodes: [
      { id: 'start', type: 'start', name: 'Start' },
      { id: 'condition', type: 'condition', name: 'Condition' },
      { id: 'left', type: 'serviceTask', name: 'Left' },
      { id: 'right', type: 'serviceTask', name: 'Right' },
      { id: 'end', type: 'end', name: 'End' }
    ],
    edges: [
      { id: 'start-condition', source: 'start', target: 'condition' },
      {
        id: 'condition-left',
        source: 'condition',
        target: 'left',
        priority: 1,
        condition: { type: 'field', field: 'route', operator: 'eq', value: 'left' }
      },
      {
        id: 'condition-right',
        source: 'condition',
        target: 'right',
        priority: 2,
        condition: { type: 'field', field: 'route', operator: 'eq', value: 'right' }
      },
      { id: 'left-end', source: 'left', target: 'end' },
      { id: 'right-end', source: 'right', target: 'end' }
    ]
  };

  await executeWorkflowInstance(payload(schema), harness.store, harness.waits);

  assert.equal(harness.nodes.some((node) => node.nodeId === 'left'), false);
  assert.equal(harness.nodes.some((node) => node.nodeId === 'right'), true);
  assert.equal(harness.status, 'approved');
}

function payload(schema: Record<string, unknown>): WorkflowInstanceTaskPayload {
  return {
    instanceId: 'instance-1',
    tenantId: 'tenant-1',
    definitionId: 'definition-1',
    definitionVersion: 1,
    title: 'Executor policy test',
    initiatorId: 'initiator-1',
    schema,
    variables: {}
  };
}

function createHarness(variables: Record<string, unknown>) {
  const nodes: NodeInstanceRecord[] = [];
  const tasks: WorkflowTaskRecord[] = [];
  const tokenOrder: string[] = [];
  const decisionPromises = new Map<string, Promise<WorkflowTaskDecision>>();
  let status: ProcessInstanceStatus = 'running';

  const store = {
    isInstanceRunning: async () => status === 'running',
    getVariables: async () => variables,
    createNodeInstance: async (input: CreateNodeInstanceInput) => {
      const existing = nodes.find((node) => node.executionKey === input.executionKey);
      if (existing) return existing;
      const node: NodeInstanceRecord = {
        id: input.id,
        processInstanceId: input.processInstanceId,
        executionKey: input.executionKey,
        nodeId: input.nodeId,
        nodeType: input.nodeType,
        name: input.name,
        status: input.status,
        startedAt: new Date().toISOString()
      };
      nodes.push(node);
      return node;
    },
    completeNodeInstance: async (nodeInstanceId: string) => {
      const node = nodes.find((candidate) => candidate.id === nodeInstanceId);
      if (node) node.status = 'completed';
    },
    failNodeInstance: async (nodeInstanceId: string) => {
      const node = nodes.find((candidate) => candidate.id === nodeInstanceId);
      if (node) node.status = 'failed';
    },
    setInstanceStatus: async (_instanceId: string, nextStatus: 'approved' | 'rejected' | 'failed') => {
      status = nextStatus;
    },
    recordHistory: async () => undefined,
    listNodeTasks: async (nodeInstanceId: string) =>
      tasks.filter((task) => task.nodeInstanceId === nodeInstanceId),
    createTasks: async (inputs: CreateWorkflowTaskInput[]) => {
      const created = inputs.map((input) => ({
        id: input.id,
        tenantId: input.tenantId,
        processInstanceId: input.processInstanceId,
        nodeInstanceId: input.nodeInstanceId,
        nodeId: input.nodeId,
        title: input.title,
        status: 'pending' as const,
        ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
        waitpointTokenId: input.waitpointTokenId,
        createdAt: new Date().toISOString()
      }));
      tasks.push(...created);
      return created;
    },
    markWaitpointCompleted: async () => undefined,
    cancelActiveNodeTasks: async (nodeInstanceId: string, exceptTaskId?: string) => {
      for (const task of tasks) {
        if (
          task.nodeInstanceId === nodeInstanceId &&
          task.id !== exceptTaskId &&
          (task.status === 'pending' || task.status === 'claimed')
        ) {
          task.status = 'canceled';
        }
      }
    }
  } as unknown as WorkflowRuntimeStore;

  const waits: WorkflowWaitDriver = {
    createToken: async () => {
      const id = `waitpoint-${tokenOrder.length + 1}`;
      tokenOrder.push(id);
      return { id };
    },
    waitForToken: async <T>(tokenId: string): Promise<T> => {
      let decision = decisionPromises.get(tokenId);
      if (!decision) {
        const order = tokenOrder.indexOf(tokenId);
        decision = new Promise<WorkflowTaskDecision>((resolve) => {
          setTimeout(() => {
            const task = tasks.find((candidate) => candidate.waitpointTokenId === tokenId);
            assert.ok(task, `Missing task for ${tokenId}`);
            if (task.status !== 'canceled') task.status = 'completed';
            resolve({ action: 'approve', taskId: task.id, nodeId: task.nodeId });
          }, Math.max(0, order) * 5);
        });
        decisionPromises.set(tokenId, decision);
      }
      return await decision as T;
    },
    waitFor: async () => undefined,
    waitUntil: async () => undefined
  };

  return {
    store,
    waits,
    nodes,
    tasks,
    get status() { return status; }
  };
}

void main();
