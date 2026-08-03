import { strict as assert } from 'node:assert';
import type { DefinitionService } from '../definition/definition.service';
import type {
  PreparedTaskDecision,
  WorkflowRuntimeStore,
  WorkflowTriggerClient
} from './runtime.engine.types';
import { RuntimeService } from './runtime.service';
import type {
  ProcessInstanceDetail,
  ProcessInstanceRecord,
  RuntimeActor,
  WorkflowTaskRecord
} from './runtime.types';

const actor: RuntimeActor = {
  tenantId: 'default',
  userId: '00000000-0000-0000-0000-000000000001'
};

async function main() {
  await testTriggerFailureMarksInstanceFailed();
  await testTriggerFailureIsPreservedWhenFailureProjectionFails();
  await testTriggerSuccessStoresPersistentRunId();
  await testRunIsCanceledWhenRunIdProjectionFails();
  await testAddSignDoesNotFallBackWhenWaitpointCreationFails();
  await testApprovalRecordsWaitpointFailureWithoutContinuing();
  console.log('workflow-api Trigger.dev runtime boundary tests passed');
}

async function testTriggerFailureMarksInstanceFailed() {
  const instance = createInstance();
  let failedPayload: Record<string, unknown> | undefined;
  let storedRunId: string | undefined;
  const store = createStore({
    createInstance: async () => instance,
    setTriggerRun: async (_instanceId, runId) => {
      storedRunId = runId;
    },
    setInstanceStatus: async (_instanceId, status, payload) => {
      instance.status = status;
      failedPayload = payload;
    }
  });
  const trigger = createTriggerClient({
    triggerWorkflow: async (): Promise<{ id: string }> => {
      throw new Error('Trigger.dev unavailable');
    }
  });
  const service = new RuntimeService(createDefinitionService(), store, trigger);

  await assert.rejects(
    () => service.startInstance(startInput(), actor),
    /Trigger.dev unavailable/
  );

  assert.equal(instance.status, 'failed');
  assert.equal(storedRunId, undefined);
  assert.deepEqual(failedPayload, {
    message: 'Trigger.dev unavailable',
    phase: 'triggerWorkflow'
  });
}

async function testTriggerFailureIsPreservedWhenFailureProjectionFails() {
  const store = createStore({
    createInstance: async () => createInstance(),
    setInstanceStatus: async () => {
      throw new Error('failure projection failed');
    }
  });
  const trigger = createTriggerClient({
    triggerWorkflow: async (): Promise<{ id: string }> => {
      throw new Error('Trigger.dev unavailable');
    }
  });
  const service = new RuntimeService(createDefinitionService(), store, trigger);

  await assert.rejects(
    () => service.startInstance(startInput(), actor),
    /Trigger\.dev unavailable/
  );
}

async function testTriggerSuccessStoresPersistentRunId() {
  const instance = createInstance();
  let storedRunId: string | undefined;
  const store = createStore({
    createInstance: async () => instance,
    setTriggerRun: async (_instanceId, runId) => {
      storedRunId = runId;
      instance.triggerRunId = runId;
    },
    getInstance: async () => createInstanceDetail(instance)
  });
  const service = new RuntimeService(
    createDefinitionService(),
    store,
    createTriggerClient({
      triggerWorkflow: async () => ({ id: 'trigger-run-1' })
    })
  );

  const started = await service.startInstance(startInput(), actor);

  assert.equal(storedRunId, 'trigger-run-1');
  assert.equal(started.triggerRunId, 'trigger-run-1');
  assert.equal(started.status, 'running');
}

async function testRunIsCanceledWhenRunIdProjectionFails() {
  const instance = createInstance();
  let canceledRunId: string | undefined;
  const store = createStore({
    createInstance: async () => instance,
    setTriggerRun: async () => {
      throw new Error('run projection failed');
    },
    setInstanceStatus: async () => {}
  });
  const trigger = createTriggerClient({
    triggerWorkflow: async () => ({ id: 'trigger-run-1' }),
    cancelRun: async (runId) => {
      canceledRunId = runId;
    }
  });
  const service = new RuntimeService(createDefinitionService(), store, trigger);

  await assert.rejects(
    () => service.startInstance(startInput(), actor),
    /run projection failed/
  );
  assert.equal(canceledRunId, 'trigger-run-1');
}

async function testAddSignDoesNotFallBackWhenWaitpointCreationFails() {
  const task = createTask();
  let addSignCalled = false;
  const store = createStore({
    getTask: async () => ({ ...task, candidates: [] }),
    addSignTask: async () => {
      addSignCalled = true;
      return { ...task, candidates: [] };
    }
  });
  const trigger = createTriggerClient({
    createWaitpoint: async (): Promise<{ id: string }> => {
      throw new Error('Trigger.dev waitpoint unavailable');
    }
  });
  const service = new RuntimeService(createDefinitionService(), store, trigger);

  await assert.rejects(
    () =>
      service.addSignTask(
        task.id,
        { targetUserId: '00000000-0000-0000-0000-000000000002' },
        actor
      ),
    /Trigger.dev waitpoint unavailable/
  );
  assert.equal(addSignCalled, false);
}

async function testApprovalRecordsWaitpointFailureWithoutContinuing() {
  const instance = createInstance();
  const task = createTask();
  const decision = {
    action: 'approve' as const,
    taskId: task.id,
    nodeId: task.nodeId,
    operatorId: actor.userId,
    comment: '',
    variables: {}
  };
  const prepared: PreparedTaskDecision = {
    task,
    instance,
    tokenId: task.waitpointTokenId!,
    decision,
    alreadyPrepared: false
  };
  let failure: { taskId: string; message: string } | undefined;
  let markedCompleted = false;
  let notificationTriggered = false;
  const store = createStore({
    prepareTaskDecision: async () => prepared,
    markWaitpointCompleted: async () => {
      markedCompleted = true;
    },
    recordWaitpointFailure: async (taskId, message) => {
      failure = { taskId, message };
    }
  });
  const trigger = createTriggerClient({
    completeWaitpoint: async () => {
      throw new Error('Trigger.dev waitpoint completion failed');
    },
    triggerTask: async () => {
      notificationTriggered = true;
      return { id: 'unexpected-notification-run' };
    }
  });
  const service = new RuntimeService(createDefinitionService(), store, trigger);

  await assert.rejects(
    () => service.completeTask(task.id, {}, actor),
    /Trigger.dev waitpoint completion failed/
  );

  assert.deepEqual(failure, {
    taskId: task.id,
    message: 'Trigger.dev waitpoint completion failed'
  });
  assert.equal(markedCompleted, false);
  assert.equal(notificationTriggered, false);
}

function createDefinitionService() {
  return {
    getDefinition: async () => ({
      id: 'definition-1',
      version: 1,
      status: 'active',
      schema: {
        schemaVersion: 1,
        nodes: [
          { id: 'start', type: 'start', name: 'Start' },
          { id: 'end', type: 'end', name: 'End' }
        ],
        edges: [{ id: 'edge-1', source: 'start', target: 'end' }]
      }
    })
  } as unknown as DefinitionService;
}

function createStore(overrides: Partial<WorkflowRuntimeStore> = {}) {
  const instance = createInstance();
  return {
    createInstance: async () => instance,
    setTriggerRun: async () => {},
    setInstanceStatus: async () => {},
    getInstance: async () => createInstanceDetail(instance),
    ...overrides
  } as WorkflowRuntimeStore;
}

function createTriggerClient(overrides: Partial<WorkflowTriggerClient> = {}) {
  return {
    triggerWorkflow: async () => ({ id: 'trigger-run-1' }),
    triggerTask: async () => ({ id: 'trigger-task-run-1' }),
    createWaitpoint: async () => ({ id: 'waitpoint-1' }),
    completeWaitpoint: async () => {},
    cancelRun: async () => {},
    ...overrides
  } satisfies WorkflowTriggerClient;
}

function startInput() {
  return {
    definitionId: 'definition-1',
    businessKey: 'document:1',
    documentType: 'document',
    documentId: '1',
    title: 'Approval document',
    variables: { amount: 100 }
  };
}

function createInstance(): ProcessInstanceRecord {
  return {
    id: 'instance-1',
    tenantId: actor.tenantId,
    definitionId: 'definition-1',
    definitionVersion: 1,
    businessKey: 'document:1',
    documentType: 'document',
    documentId: '1',
    title: 'Approval document',
    status: 'running',
    initiatorId: actor.userId,
    triggerTaskId: 'workflow.instance.run',
    startedAt: '2026-08-04T00:00:00.000Z'
  };
}

function createInstanceDetail(instance: ProcessInstanceRecord): ProcessInstanceDetail {
  return {
    ...instance,
    variables: [],
    comments: [],
    ccItems: [],
    nodeInstances: [],
    tasks: []
  };
}

function createTask(): WorkflowTaskRecord {
  return {
    id: 'task-1',
    tenantId: actor.tenantId,
    processInstanceId: 'instance-1',
    nodeInstanceId: 'node-instance-1',
    nodeId: 'approval-1',
    title: 'Approval task',
    status: 'pending',
    assigneeId: actor.userId,
    waitpointTokenId: 'waitpoint-1',
    createdAt: '2026-08-04T00:00:00.000Z'
  };
}

void main();
