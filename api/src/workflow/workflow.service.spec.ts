import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';

import type { HookContext, ResourceConfigMap } from '../common/base.service';
import { WorkflowService } from './workflow.service';
import type { WorkflowRequest } from './workflow.transport';

type TestWorkflowService = {
  resources(): ResourceConfigMap;
  normalizeCrudPostData(postData: Record<string, unknown>): Record<string, unknown>;
  normalizeModelPayload(ctx: HookContext): void;
  normalizeJobPayload(ctx: HookContext): void;
  hooks(): Record<string, Record<string, unknown>>;
  compatibilityHandlers: Record<string, unknown>;
  actionHandlers: Record<string, unknown>;
};

const service = new WorkflowService({} as never) as unknown as TestWorkflowService;
const resources = service.resources();

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
assert.ok(resources.wf_job);
assert.ok(resources.wf_job_run);
assert.equal(typeof service.hooks().wf_model.afterAction, 'function');

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

const expectedActionMethods = [
  'publishModel',
  'getDefinitionCapabilities',
  'getInstance',
  'getInstanceTimeline',
  'startInstance',
  'withdrawInstance',
  'terminateInstance',
  'updateJobStatus',
  'runJob',
  'getTask',
  'claimTask',
  'approveTask',
  'rejectTask',
  'transferTask',
  'addSignTask',
  'getHistoryTimeline',
  'runApprovalFlowTest'
];
const actionMethods = Object.keys(service.actionHandlers);
assert.deepEqual(actionMethods.sort(), expectedActionMethods.sort());
assert.equal(actionMethods.includes('getModel'), false);
assert.equal(actionMethods.includes('saveModel'), false);
assert.equal(actionMethods.includes('updateModel'), false);
assert.equal(actionMethods.includes('createJob'), false);
assert.deepEqual(
  Object.keys(service.compatibilityHandlers).sort(),
  ['createJob', 'disableDefinition', 'getJob', 'getModel', 'saveModel', 'updateModel'].sort()
);

const requestTypeCheck: WorkflowRequest = { method: 'GET', path: '/health' };
assert.equal(requestTypeCheck.method, 'GET');

console.log('workflow service tests passed');
