import assert from 'node:assert/strict';
import type { ResourceConfigMap } from '../common/base.service';
import { readServiceResourceMetadata } from '../common/service-resource-metadata.spec-helper';
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
  tryResolveResource(postData: Record<string, unknown>): { name: string } | undefined;
};

type PublicWorkflowService = {
  execute(
    method: string,
    postData: Record<string, unknown>,
    context: { accountId: string; userId: string }
  ): Promise<unknown>;
};

const workflowTestResources = readServiceResourceMetadata('workflow');

class WorkflowServiceProbe extends WorkflowService {
  protected override resources() {
    return workflowTestResources;
  }
}

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
const service = new WorkflowServiceProbe(
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
  delegate('job', ['createJob', 'upsertJob', 'getJob', 'deleteJob', 'updateJobStatus', 'runJob']) as never,
  delegate('runtimeStatus', ['getStatus']) as never,
  delegate('taskConsole', ['getConsole', 'getDetail', 'invalidate']) as never
) as unknown as TestWorkflowService;
const resources = service.resources();
const serviceContext = {
  accountId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002'
};

class WorkflowCrudProbe extends WorkflowServiceProbe {
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
assert.equal(service.tryResolveResource({ tableName: 'wf_job', itemType: 'jobs' })?.name, 'wf_job');
assert.equal(service.tryResolveResource({ tableName: 'wf_job_run', itemType: 'jobRuns' })?.name, 'wf_job_run');
for (const resource of Object.values(resources)) {
  assert.equal(resource.permissions, undefined);
}
assert.equal(typeof service.hooks().wf_model.afterAction, 'function');
assert.equal(typeof service.hooks().wf_node_instance.afterAction, 'function');
assert.equal(typeof service.hooks().wf_task.afterAction, 'function');
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
assert.deepEqual(resources.wf_job.internalActions, ['create', 'update', 'delete']);

async function testDirectDelegation() {
  const crudProbe = new WorkflowCrudProbe(
    delegate('definitionProbe', []) as never,
    delegate('runtimeProbe', []) as never,
    delegate('approvalProbe', []) as never,
    delegate('jobProbe', ['createJob']) as never,
    delegate('runtimeStatusProbe', []) as never,
    delegate('taskConsoleProbe', ['invalidate']) as never
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
  assert.deepEqual(crudProbe.calls, []);
  assert.deepEqual(delegatedCalls.splice(-2), [
    {
      service: 'jobProbe',
      method: 'createJob',
      args: [
        {
          code: 'job-1',
          name: 'Job 1',
          type: 'manual'
        },
        { tenantId: serviceContext.accountId, userId: serviceContext.userId }
      ]
    },
    {
      service: 'taskConsoleProbe',
      method: 'invalidate',
      args: [serviceContext.accountId]
    }
  ]);

  await service.execute('getInstance', {
    instanceId: 'instance-1',
    tenantId: 'caller-controlled-tenant'
  }, serviceContext);
  assert.deepEqual(delegatedCalls.pop(), {
    service: 'runtime',
    method: 'getInstance',
    args: ['instance-1', serviceContext.accountId]
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

async function testDirectTypedJobCrudIsBlocked() {
  await assert.rejects(
    () => (service as unknown as PublicWorkflowService).execute('createItem', {
      resource: 'wf_job',
      data: {
        code: 'bypass',
        name: 'Bypass',
        type: 'manual',
        trigger_task_id: 'workflow.trigger-workflow.run'
      }
    }, serviceContext),
    /only available through its service method/
  );
  await assert.rejects(
    () => (service as unknown as PublicWorkflowService).execute('updateItem', {
      resource: 'wf_job',
      id: 'job-1',
      data: { trigger_task_id: 'not.allowed' }
    }, serviceContext),
    /only available through its service method/
  );
  await assert.rejects(
    () => (service as unknown as PublicWorkflowService).execute('deleteItem', {
      resource: 'wf_job',
      id: 'job-1'
    }, serviceContext),
    /only available through its service method/
  );
}

async function testWebhookTriggerRequiresMatchingEnabledJob() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const job = {
    id: 'job-webhook',
    status: 'enabled',
    triggerTaskId: 'workflow.trigger-workflow.run',
    payload: {
      triggerWorkflow: {
        executionPlan: {
          operations: [{
            type: 'webhook',
            options: {
              body: {
                serviceName: 'lowcode',
                serviceMethod: 'rebuildIndex'
              }
            }
          }]
        }
      }
    }
  };
  const probe = new WorkflowServiceProbe(
    delegate('webhookDefinitionProbe', []) as never,
    delegate('webhookRuntimeProbe', []) as never,
    delegate('webhookApprovalProbe', []) as never,
    {
      getJob: async (...args: unknown[]) => {
        calls.push({ method: 'getJob', args });
        return job;
      },
      runJob: async (...args: unknown[]) => {
        calls.push({ method: 'runJob', args });
        return { status: 'queued' };
      },
      runJobAndWait: async (...args: unknown[]) => {
        calls.push({ method: 'runJobAndWait', args });
        return { variables: { taskOutputs: { inventory: ['row-1'] } } };
      }
    } as never,
    delegate('webhookRuntimeStatusProbe', []) as never,
    {
      invalidate: async (...args: unknown[]) => {
        calls.push({ method: 'invalidate', args });
      }
    } as never
  ) as unknown as PublicWorkflowService;

  const result = await probe.execute('triggerWebhook', {
    jobId: job.id,
    serviceName: 'lowcode',
    serviceMethod: 'rebuildIndex',
    postData: { resource: 'inventory' }
  }, serviceContext);

  assert.deepEqual(result, { status: 'queued' });
  assert.deepEqual(calls, [
    {
      method: 'getJob',
      args: [job.id, { tenantId: serviceContext.accountId, userId: serviceContext.userId }]
    },
    {
      method: 'runJob',
      args: [
        job.id,
        {
          payload: {
            serviceName: 'lowcode',
            serviceMethod: 'rebuildIndex',
            postData: { resource: 'inventory' }
          }
        },
        { tenantId: serviceContext.accountId, userId: serviceContext.userId }
      ]
    },
    {
      method: 'invalidate',
      args: [serviceContext.accountId]
    }
  ]);

  await assert.rejects(
    () => probe.execute('triggerWebhook', {
      jobId: job.id,
      serviceName: 'lowcode',
      serviceMethod: 'notConfigured',
      postData: {}
    }, serviceContext),
    /Enabled Webhook workflow not found/
  );
}

void Promise.all([
  testDirectDelegation(),
  testDirectTypedJobCrudIsBlocked(),
  testWebhookTriggerRequiresMatchingEnabledJob()
]).then(() => {
  console.log('workflow service tests passed');
});
