import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';

import type { HookContext, ResourceConfigMap } from '../common/base.service';
import { WorkflowService } from './workflow.service';

type TestWorkflowService = {
  execute(
    method: string,
    postData: Record<string, unknown>,
    context: { accountId: string; userId: string }
  ): Promise<unknown>;
  resources(): ResourceConfigMap;
  normalizeCrudPostData(postData: Record<string, unknown>): Record<string, unknown>;
  normalizeModelPayload(ctx: HookContext): void;
  normalizeJobPayload(ctx: HookContext): void;
  hooks(): Record<string, Record<string, unknown>>;
  listItemHandlers(): Record<string, unknown>;
};

const delegatedCalls: Array<{ service: string; method: string; args: unknown[] }> = [];
const delegate = (service: string, methods: string[]) => Object.fromEntries(
  methods.map((method) => [
    method,
    async (...args: unknown[]) => {
      delegatedCalls.push({ service, method, args });
      return `${service}.${method}`;
    }
  ])
);
const service = new WorkflowService(
  delegate('definition', [
    'getModel',
    'saveModel',
    'disableDefinition',
    'publishModel',
    'getCapabilities'
  ]) as never,
  delegate('runtime', [
    'listTodoTasks',
    'getInstance',
    'getTimeline',
    'startInstance',
    'withdrawInstance',
    'terminateInstance',
    'getTask',
    'claimTask',
    'completeTask',
    'rejectTask',
    'transferTask',
    'addSignTask'
  ]) as never,
  delegate('approvalConsole', ['listInstances', 'getInstanceDetail']) as never,
  delegate('job', ['createJob', 'getJob', 'updateJobStatus', 'runJob']) as never,
  delegate('runtimeStatus', ['getStatus']) as never
) as unknown as TestWorkflowService;
const resources = service.resources();
const serviceContext = {
  accountId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002'
};

function context(resourceName: string, action: HookContext['action'], data: Record<string, unknown>) {
  return {
    action,
    serviceName: 'Workflow',
    resourceName,
    resource: resources[resourceName],
    input: data,
    data,
    filters: undefined,
    context: {},
    client: {} as never,
    ids: [],
    meta: {}
  } satisfies HookContext;
}

assert.ok(resources.wf_model);
assert.ok(resources.wf_process_definition);
assert.ok(resources.wf_process_instance);
assert.ok(resources.wf_node_instance);
assert.ok(resources.wf_task);
assert.ok(resources.wf_job);
assert.ok(resources.wf_job_run);
assert.equal(typeof service.hooks().wf_model.afterAction, 'function');
assert.equal(typeof service.hooks().wf_node_instance.afterAction, 'function');
assert.equal(typeof service.hooks().wf_task.afterAction, 'function');
assert.equal(typeof service.listItemHandlers().nodeInstances, 'function');
assert.equal(typeof service.listItemHandlers().tasks, 'function');

assert.deepEqual(
  service.normalizeCrudPostData({
    resource: 'wf_model',
    id: 'model-1',
    data: {
      documentType: 'expense',
      draftSchema: { code: 'expense', name: 'Expense' }
    }
  }),
  {
    resource: 'wf_model',
    id: 'model-1',
    data: {
      document_type: 'expense',
      draft_schema: { code: 'expense', name: 'Expense' }
    }
  }
);

const modelData: Record<string, unknown> = {
  code: 'expense',
  name: 'Expense approval',
  documentType: 'expense',
  schema: {
    schemaVersion: 1,
    code: 'expense',
    name: 'Expense approval',
    nodes: [{ id: 'start', type: 'start' }, { id: 'end', type: 'end' }],
    edges: [{ id: 'edge', source: 'start', target: 'end' }]
  }
};
service.normalizeModelPayload(context('wf_model', 'create', modelData));
assert.equal(modelData.document_type, 'expense');
assert.equal(modelData.documentType, undefined);
assert.equal(modelData.schema, undefined);
assert.equal((modelData.draft_schema as Record<string, unknown>).code, 'expense');

const jobData: Record<string, unknown> = {
  code: 'minute-job',
  name: 'Minute job',
  type: 'interval',
  intervalSeconds: 60,
  triggerTaskId: 'workflow.demo',
  retryPolicy: { maxAttempts: 1 }
};
service.normalizeJobPayload(context('wf_job', 'create', jobData));
assert.equal(jobData.trigger_task_id, 'workflow.demo');
assert.equal(jobData.intervalSeconds, undefined);
assert.equal((jobData.payload as Record<string, unknown>).intervalSeconds, 60);
assert.deepEqual(jobData.retry_policy, { maxAttempts: 1 });

assert.throws(
  () => service.normalizeJobPayload(context('wf_job', 'create', {
    code: 'seconds-job',
    name: 'Seconds job',
    type: 'interval',
    intervalSeconds: 20
  })),
  BadRequestException
);

async function testDirectDelegation() {
  await service.execute('getModel', { modelId: 'model-1' }, serviceContext);
  assert.deepEqual(delegatedCalls.pop(), {
    service: 'definition',
    method: 'getModel',
    args: ['model-1', serviceContext.accountId]
  });

  await service.execute('saveModel', {
    code: 'expense',
    name: 'Expense approval',
    schema: modelData.draft_schema
  }, serviceContext);
  const saveCall = delegatedCalls.pop();
  assert.equal(saveCall?.service, 'definition');
  assert.equal(saveCall?.method, 'saveModel');
  assert.deepEqual(saveCall?.args[1], {
    tenantId: serviceContext.accountId,
    userId: serviceContext.userId
  });

  await service.execute('getInstance', {
    instanceId: 'instance-1',
    tenantId: 'caller-controlled-tenant'
  }, serviceContext);
  assert.deepEqual(delegatedCalls.pop(), {
    service: 'runtime',
    method: 'getInstance',
    args: ['instance-1', serviceContext.accountId]
  });

  const todoHandler = service.listItemHandlers().todoTasks as (
    postData: Record<string, unknown>,
    context: typeof serviceContext
  ) => Promise<unknown>;
  await todoHandler({
    limit: 200,
    tenantId: 'caller-controlled-tenant'
  }, serviceContext);
  assert.deepEqual(delegatedCalls.pop(), {
    service: 'runtime',
    method: 'listTodoTasks',
    args: [
      { tenantId: serviceContext.accountId, userId: serviceContext.userId },
      { limit: 200 }
    ]
  });

  await service.execute('startInstance', {
    definitionId: 'definition-1',
    businessKey: 'order-1',
    title: 'Order approval'
  }, serviceContext);
  assert.equal(delegatedCalls.pop()?.method, 'startInstance');

  await service.execute('createJob', {
    code: 'job-1',
    name: 'Job 1',
    type: 'manual'
  }, serviceContext);
  assert.equal(delegatedCalls.pop()?.method, 'createJob');

  await service.execute('approveTask', {
    taskId: 'task-1',
    comment: 'Approved'
  }, serviceContext);
  assert.deepEqual(delegatedCalls.pop()?.args.slice(0, 2), [
    'task-1',
    { comment: 'Approved' }
  ]);
}

void testDirectDelegation().then(() => {
  console.log('workflow service tests passed');
});
