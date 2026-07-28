import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import { DefinitionService } from '../definition/definition.service';
import type {
  WorkflowInstanceTaskPayload,
  WorkflowTaskDecision,
  WorkflowTriggerClient
} from './runtime.engine.types';
import { MemoryWorkflowRuntimeStore } from './runtime.memory-store';
import { RuntimeService } from './runtime.service';
import { executeWorkflowInstance, type WorkflowWaitDriver } from './workflow.executor';

const actor = {
  tenantId: 'default',
  userId: '00000000-0000-0000-0000-000000000001'
};
const secondActor = {
  tenantId: 'default',
  userId: '00000000-0000-0000-0000-000000000002'
};

async function main() {
  await testApprovalAndAddSign();
  await testTransferNotification();
  await testReject();
  await testAutomaticNodes();
  console.log('workflow-api Trigger.dev runtime tests passed');
}

async function testApprovalAndAddSign() {
  const definitionService = new DefinitionService();
  const definition = await publishDefinition(definitionService, {
    schemaVersion: 1,
    code: 'expense_trigger_runtime',
    name: 'Expense Trigger Runtime',
    documentType: 'expense',
    nodes: [
      { id: 'start', type: 'start', name: 'Start' },
      {
        id: 'approval',
        type: 'approval',
        name: 'Manager Approval',
        config: {
          assigneeStrategy: {
            type: 'users',
            userIds: [actor.userId]
          }
        }
      },
      { id: 'end', type: 'end', name: 'End' }
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'approval' },
      { id: 'e2', source: 'approval', target: 'end' }
    ]
  });
  const store = new MemoryWorkflowRuntimeStore();
  const trigger = new TestTriggerClient();
  const service = new RuntimeService(definitionService, store, trigger);

  const started = await service.startInstance(
    {
      definitionId: definition.id,
      businessKey: 'expense:trigger:1',
      documentType: 'expense',
      documentId: 'trigger-1',
      title: 'Trigger Expense',
      variables: {
        amount: 1200
      }
    },
    actor
  );

  assert.equal(started.status, 'running');
  assert.equal(started.tasks.length, 0);
  assert.equal(started.triggerRunId, 'run-1');

  const execution = executeWorkflowInstance(trigger.lastWorkflowPayload(), store, trigger);
  const firstTask = await waitForTask(service, actor);
  const addSignTask = await service.addSignTask(
    firstTask.id,
    {
      targetUserId: secondActor.userId,
      comment: 'Please confirm'
    },
    actor
  );
  assert.equal(addSignTask.assigneeId, secondActor.userId);

  await service.completeTask(
    firstTask.id,
    {
      comment: 'Approved',
      variables: {
        managerApproved: true
      }
    },
    actor
  );
  assert.equal((await service.getInstance(started.id)).status, 'running');

  await service.completeTask(addSignTask.id, { comment: 'Confirmed' }, secondActor);
  await execution;

  const approved = await service.getInstance(started.id);
  assert.equal(approved.status, 'approved');
  assert.ok(approved.endedAt);
  assert.equal(approved.tasks.filter((task) => task.status === 'completed').length, 2);
  assert.ok(approved.variables.some((variable) => variable.key === 'managerApproved'));
  assert.ok((await service.getTimeline(approved.id)).some((event) => event.eventType === 'PROCESS_COMPLETED'));
  assert.equal((await service.listDoneTasks(actor)).length, 1);
  assert.ok(trigger.notificationEventTypes().includes('approval.task.created'));
  assert.ok(trigger.notificationEventTypes().includes('approval.task.add_signed'));
  assert.equal(
    trigger.notificationEventTypes().filter((eventType) => eventType === 'approval.task.completed').length,
    2
  );

  await assert.rejects(
    () => service.completeTask(firstTask.id, { comment: 'Duplicate' }, actor),
    BadRequestException
  );
}

async function testTransferNotification() {
  const definitionService = new DefinitionService();
  const definition = await publishDefinition(definitionService, {
    schemaVersion: 1,
    code: 'expense_trigger_transfer',
    name: 'Expense Trigger Transfer',
    nodes: [
      { id: 'start', type: 'start', name: 'Start' },
      {
        id: 'approval',
        type: 'approval',
        name: 'Approval',
        config: {
          assigneeStrategy: {
            type: 'users',
            userIds: [actor.userId]
          }
        }
      },
      { id: 'end', type: 'end', name: 'End' }
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'approval' },
      { id: 'e2', source: 'approval', target: 'end' }
    ]
  });
  const store = new MemoryWorkflowRuntimeStore();
  const trigger = new TestTriggerClient();
  const service = new RuntimeService(definitionService, store, trigger);
  const started = await service.startInstance(
    {
      definitionId: definition.id,
      businessKey: 'expense:trigger:transfer',
      title: 'Transfer Expense',
      variables: {}
    },
    actor
  );
  const execution = executeWorkflowInstance(trigger.lastWorkflowPayload(), store, trigger);
  const task = await waitForTask(service, actor);

  const transferred = await service.transferTask(
    task.id,
    {
      targetUserId: secondActor.userId,
      comment: 'Please take over'
    },
    actor
  );
  assert.equal(transferred.assigneeId, secondActor.userId);
  assert.ok(trigger.notificationEventTypes().includes('approval.task.transferred'));
  assert.equal((await service.listTodoTasks(secondActor)).length, 1);

  await service.completeTask(transferred.id, { comment: 'Approved after transfer' }, secondActor);
  await execution;

  assert.equal((await service.getInstance(started.id)).status, 'approved');
}

async function testReject() {
  const definitionService = new DefinitionService();
  const definition = await publishDefinition(definitionService, {
    schemaVersion: 1,
    code: 'expense_trigger_reject',
    name: 'Expense Trigger Reject',
    nodes: [
      { id: 'start', type: 'start', name: 'Start' },
      {
        id: 'approval',
        type: 'approval',
        name: 'Approval',
        config: {
          assigneeStrategy: {
            type: 'users',
            userIds: [actor.userId]
          }
        }
      },
      { id: 'end', type: 'end', name: 'End' }
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'approval' },
      { id: 'e2', source: 'approval', target: 'end' }
    ]
  });
  const store = new MemoryWorkflowRuntimeStore();
  const trigger = new TestTriggerClient();
  const service = new RuntimeService(definitionService, store, trigger);
  const started = await service.startInstance(
    {
      definitionId: definition.id,
      businessKey: 'expense:trigger:reject',
      title: 'Reject Expense',
      variables: {}
    },
    actor
  );
  const execution = executeWorkflowInstance(trigger.lastWorkflowPayload(), store, trigger);
  const task = await waitForTask(service, actor);

  const rejected = await service.rejectTask(task.id, { comment: 'Missing material' }, actor);
  await execution;

  assert.equal(rejected.status, 'rejected');
  assert.ok(rejected.comments.some((comment) => comment.action === 'reject'));
  assert.ok((await service.getTimeline(started.id)).some((event) => event.eventType === 'PROCESS_REJECTED'));
  assert.ok(trigger.notificationEventTypes().includes('approval.task.rejected'));
}

async function testAutomaticNodes() {
  const definitionService = new DefinitionService();
  const definition = await publishDefinition(definitionService, {
    schemaVersion: 1,
    code: 'automatic_trigger_runtime',
    name: 'Automatic Trigger Runtime',
    nodes: [
      { id: 'start', type: 'start', name: 'Start' },
      { id: 'condition', type: 'condition', name: 'Amount Condition' },
      {
        id: 'cc',
        type: 'cc',
        name: 'Notify',
        config: {
          assigneeStrategy: {
            type: 'users',
            userIds: [actor.userId]
          }
        }
      },
      {
        id: 'timer',
        type: 'timer',
        name: 'Delay',
        config: {
          delaySeconds: 0
        }
      },
      {
        id: 'service',
        type: 'serviceTask',
        name: 'Sync'
      },
      { id: 'end', type: 'end', name: 'End' }
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'condition' },
      {
        id: 'e2',
        source: 'condition',
        target: 'cc',
        priority: 1,
        condition: { type: 'field', field: 'amount', operator: 'gte', value: 5000 }
      },
      { id: 'e3', source: 'condition', target: 'end', priority: 99, condition: { type: 'always' } },
      { id: 'e4', source: 'cc', target: 'timer' },
      { id: 'e5', source: 'timer', target: 'service' },
      { id: 'e6', source: 'service', target: 'end' }
    ]
  });
  const store = new MemoryWorkflowRuntimeStore();
  const trigger = new TestTriggerClient();
  const service = new RuntimeService(definitionService, store, trigger);
  const started = await service.startInstance(
    {
      definitionId: definition.id,
      businessKey: 'automatic:trigger:1',
      title: 'Automatic Flow',
      variables: {
        amount: 6800
      }
    },
    actor
  );

  await executeWorkflowInstance(trigger.lastWorkflowPayload(), store, trigger);
  const completed = await service.getInstance(started.id);
  const timeline = await service.getTimeline(started.id);

  assert.equal(completed.status, 'approved');
  assert.equal((await service.listCc(actor)).length, 1);
  assert.ok(timeline.some((event) => event.eventType === 'CC_CREATED'));
  assert.ok(timeline.some((event) => event.eventType === 'TIMER_SCHEDULED'));
  assert.ok(timeline.some((event) => event.eventType === 'TIMER_FIRED'));
  assert.ok(timeline.some((event) => event.eventType === 'SERVICE_TASK_COMPLETED'));
}

async function publishDefinition(definitionService: DefinitionService, schema: Record<string, unknown>) {
  const model = await definitionService.saveModel(
    {
      code: String(schema.code),
      name: String(schema.name),
      documentType: typeof schema.documentType === 'string' ? schema.documentType : undefined,
      schema
    },
    actor
  );
  return (await definitionService.publishModel(model.id, { remark: 'runtime test' }, actor)).definition;
}

async function waitForTask(service: RuntimeService, taskActor: typeof actor) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const tasks = await service.listTodoTasks(taskActor);
    if (tasks[0]) return tasks[0];
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for workflow task projection.');
}

class TestTriggerClient implements WorkflowTriggerClient, WorkflowWaitDriver {
  private runSequence = 0;
  private tokenSequence = 0;
  private readonly workflowPayloads: WorkflowInstanceTaskPayload[] = [];
  private readonly taskPayloads: Array<{
    taskId: string;
    payload: Record<string, unknown>;
  }> = [];
  private readonly tokenIdsByKey = new Map<string, string>();
  private readonly tokenWaiters = new Map<
    string,
    {
      promise: Promise<WorkflowTaskDecision>;
      resolve: (decision: WorkflowTaskDecision) => void;
    }
  >();

  async triggerWorkflow(payload: WorkflowInstanceTaskPayload) {
    this.workflowPayloads.push(payload);
    this.runSequence += 1;
    return { id: `run-${this.runSequence}` };
  }

  async triggerTask(taskId: string, payload: Record<string, unknown>) {
    this.taskPayloads.push({ taskId, payload });
    this.runSequence += 1;
    return { id: `run-${this.runSequence}` };
  }

  async createWaitpoint(options: { idempotencyKey: string; tags: string[] }) {
    return this.createToken(options);
  }

  async createToken(options: { idempotencyKey: string; tags: string[] }) {
    const existing = this.tokenIdsByKey.get(options.idempotencyKey);
    if (existing) return { id: existing };

    this.tokenSequence += 1;
    const id = `waitpoint-${this.tokenSequence}`;
    let resolve!: (decision: WorkflowTaskDecision) => void;
    const promise = new Promise<WorkflowTaskDecision>((nextResolve) => {
      resolve = nextResolve;
    });
    this.tokenIdsByKey.set(options.idempotencyKey, id);
    this.tokenWaiters.set(id, { promise, resolve });
    return { id };
  }

  async completeWaitpoint(tokenId: string, decision: WorkflowTaskDecision) {
    const waiter = this.tokenWaiters.get(tokenId);
    if (!waiter) throw new Error(`Unknown waitpoint ${tokenId}.`);
    waiter.resolve(decision);
  }

  async cancelRun() {}

  async waitForToken<T>(tokenId: string) {
    const waiter = this.tokenWaiters.get(tokenId);
    if (!waiter) throw new Error(`Unknown waitpoint ${tokenId}.`);
    return waiter.promise as Promise<T>;
  }

  async waitFor() {}

  async waitUntil() {}

  lastWorkflowPayload() {
    const payload = this.workflowPayloads.at(-1);
    if (!payload) throw new Error('Workflow was not triggered.');
    return payload;
  }

  notificationEventTypes() {
    return this.taskPayloads
      .map((item) => readNotificationEventType(item.payload))
      .filter((eventType): eventType is string => Boolean(eventType));
  }
}

function readNotificationEventType(payload: Record<string, unknown>) {
  const event = payload.event;
  if (!event || typeof event !== 'object' || Array.isArray(event)) return undefined;
  const eventType = (event as Record<string, unknown>).eventType;
  return typeof eventType === 'string' ? eventType : undefined;
}

void main();
