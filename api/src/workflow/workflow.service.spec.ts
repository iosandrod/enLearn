import assert from 'node:assert/strict';
import type { ResourceConfigMap } from '../common/base.service';
import { WorkflowService } from './workflow.service';

type TestWorkflowService = {
  execute(
    method: string,
    postData: Record<string, unknown>,
    context: { accountId: string; userId: string }
  ): Promise<unknown>;
  resources(): ResourceConfigMap;
  normalizeCrudPostData(postData: Record<string, unknown>): Record<string, unknown>;
  hooks(): Record<string, Record<string, unknown>>;
  listItemHandlers(): Record<string, (
    postData: Record<string, unknown>,
    context: { accountId: string; userId: string }
  ) => Promise<unknown>>;
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

class WorkflowCrudProbe extends WorkflowService {
  public calls: Array<{ method: string; postData: Record<string, unknown> }> = [];
  public existing: Record<string, unknown> | undefined;

  protected override async listItems(postData: Record<string, unknown>) {
    this.calls.push({ method: 'listItems', postData });
    return this.existing ? [this.existing] : [];
  }

  protected override async createItem(postData: Record<string, unknown>) {
    this.calls.push({ method: 'createItem', postData });
    return { created: postData };
  }

  protected override async updateItem(postData: Record<string, unknown>) {
    this.calls.push({ method: 'updateItem', postData });
    return { updated: postData };
  }
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

class WorkflowJobRunProbe extends WorkflowService {
  protected override async listItems(postData: Record<string, unknown>) {
    if (postData.resource === 'wf_job_run') {
      return [{
        id: 'run-1',
        job_id: 'job-1',
        trigger_run_id: 'trigger-1',
        status: 'succeeded',
        attempt: 1,
        error_message: null,
        started_at: '2026-08-08T00:00:00.000Z',
        finished_at: '2026-08-08T00:00:01.250Z',
        created_at: '2026-08-08T00:00:00.000Z'
      }];
    }
    if (postData.resource === 'wf_job') {
      return [{ id: 'job-1', code: 'daily-plan', name: '每日计划同步' }];
    }
    return [];
  }
}

async function testJobRunReadModel() {
  const probe = new WorkflowJobRunProbe(
    delegate('definitionJobRunProbe', []) as never,
    delegate('runtimeJobRunProbe', []) as never,
    delegate('approvalJobRunProbe', []) as never,
    delegate('jobJobRunProbe', []) as never,
    delegate('runtimeStatusJobRunProbe', []) as never
  ) as unknown as TestWorkflowService;
  const rows = await probe.listItemHandlers().jobRuns({}, serviceContext) as Array<Record<string, unknown>>;
  assert.deepEqual(rows[0], {
    id: 'run-1',
    job_id: 'job-1',
    trigger_run_id: 'trigger-1',
    status: 'succeeded',
    attempt: 1,
    error_message: null,
    started_at: '2026-08-08T00:00:00.000Z',
    finished_at: '2026-08-08T00:00:01.250Z',
    created_at: '2026-08-08T00:00:00.000Z',
    job_name: '每日计划同步',
    job_code: 'daily-plan',
    status_label: '成功',
    duration_ms: 1250
  });
}

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
    documentType: 'expense',
    draftSchema: { code: 'expense', name: 'Expense' },
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
assert.deepEqual(
  resources.wf_model.databaseHookInputFields,
  ['code', 'name', 'document_type', 'documentType', 'draft_schema', 'draftSchema', 'schema']
);
assert.ok(resources.wf_job.databaseHookInputFields?.includes('intervalSeconds'));

async function testDirectDelegation() {
  const crudProbe = new WorkflowCrudProbe(
    delegate('definitionProbe', []) as never,
    delegate('runtimeProbe', []) as never,
    delegate('approvalProbe', []) as never,
    delegate('jobProbe', []) as never,
    delegate('runtimeStatusProbe', []) as never
  );
  crudProbe.existing = { id: 'model-1' };
  await crudProbe.execute('getModel', { modelId: 'model-1' }, serviceContext);
  assert.deepEqual(crudProbe.calls.map((call) => call.method), ['listItems', 'listItems']);
  assert.equal(crudProbe.calls[0].postData.resource, 'wf_model');
  assert.deepEqual(crudProbe.calls[0].postData.filters, { id: 'model-1' });
  assert.equal(crudProbe.calls[1].postData.resource, 'wf_model_version');
  assert.deepEqual(crudProbe.calls[1].postData.filters, { model_id: 'model-1' });

  crudProbe.calls = [];
  crudProbe.existing = undefined;
  await crudProbe.execute('saveModel', {
    code: 'expense',
    name: 'Expense approval',
    documentType: 'expense',
    schema: modelData.schema
  }, serviceContext);
  assert.deepEqual(crudProbe.calls.map((call) => call.method), ['listItems', 'createItem']);
  assert.equal(crudProbe.calls[0].postData.resource, 'wf_model');
  assert.deepEqual(crudProbe.calls[0].postData.filters, { code: 'expense' });
  assert.equal(crudProbe.calls[1].postData.resource, 'wf_model');

  crudProbe.calls = [];
  crudProbe.existing = { id: 'model-1' };
  await crudProbe.execute('saveModel', {
    code: 'expense',
    name: 'Expense approval',
    schema: modelData.schema
  }, serviceContext);
  assert.deepEqual(crudProbe.calls.map((call) => call.method), ['listItems', 'updateItem']);
  assert.equal(crudProbe.calls[1].postData.id, 'model-1');

  crudProbe.calls = [];
  await crudProbe.execute('updateModel', {
    id: 'model-2',
    code: 'expense',
    name: 'Expense approval',
    schema: modelData.schema
  }, serviceContext);
  assert.deepEqual(crudProbe.calls.map((call) => call.method), ['updateItem']);
  assert.equal(crudProbe.calls[0].postData.id, 'model-2');

  crudProbe.calls = [];
  await crudProbe.execute('createJob', {
    code: 'job-1',
    name: 'Job 1',
    type: 'manual'
  }, serviceContext);
  assert.deepEqual(crudProbe.calls.map((call) => call.method), ['createItem']);
  assert.equal(crudProbe.calls[0].postData.resource, 'wf_job');

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

  await service.execute('approveTask', {
    taskId: 'task-1',
    comment: 'Approved'
  }, serviceContext);
  assert.deepEqual(delegatedCalls.pop()?.args.slice(0, 2), [
    'task-1',
    { comment: 'Approved' }
  ]);
}

void Promise.all([testDirectDelegation(), testJobRunReadModel()]).then(() => {
  console.log('workflow service tests passed');
});
