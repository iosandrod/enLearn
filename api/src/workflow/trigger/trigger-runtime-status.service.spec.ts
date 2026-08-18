import assert from 'node:assert/strict';
import type { RuntimeService } from '../runtime/runtime.service';
import type { ProcessInstanceRecord } from '../runtime/runtime.types';
import {
  TriggerRuntimeStatusService,
  type TriggerRuntimeStatusOperations
} from './trigger-runtime-status.service';

async function main() {
  await testStatusAggregationAndTenantFiltering();
  await testPartialStatusWhenTriggerSectionFails();
  await testCredentialFailureKeepsWorkflowStatusAvailable();
  console.log('workflow-api Trigger.dev runtime status tests passed');
}

async function testStatusAggregationAndTenantFiltering() {
  const service = new TriggerRuntimeStatusService(
    createCredentials(),
    createRuntimeService(),
    createOperations()
  );

  const status = await service.getStatus('tenant-1');

  assert.equal(status.partial, false);
  assert.equal(status.summary.queueCount, 2);
  assert.equal(status.summary.scheduleCount, 0);
  assert.equal(status.summary.queuedRuns, 3);
  assert.equal(status.summary.runningRuns, 1);
  assert.equal(status.summary.runningWorkflowInstances, 1);
  assert.equal(status.summary.waitingWaitpoints, 1);
  assert.equal(status.runs.length, 2);
  assert.equal(status.waitpoints.length, 1);
  assert.equal(status.engine.activeWorkerCount, 1);
  assert.equal(status.engine.workerConnected, true);
  assert.equal(status.engine.environmentConcurrencyLimit, 5);
}

async function testPartialStatusWhenTriggerSectionFails() {
  const operations = createOperations();
  const credentials = createCredentials();
  credentials.listRecentRuns = async () => {
    throw new Error('runs unavailable');
  };
  const service = new TriggerRuntimeStatusService(
    credentials,
    createRuntimeService(),
    operations
  );

  const status = await service.getStatus('tenant-1');

  assert.equal(status.partial, true);
  assert.match(status.errors.runs ?? '', /runs unavailable/);
  assert.equal(status.runs.length, 0);
  assert.equal(status.workflows.length, 1);
  assert.equal(status.queues.length, 2);
}

async function testCredentialFailureKeepsWorkflowStatusAvailable() {
  const credentials = createCredentials();
  credentials.getCredentials = async () => {
    throw new Error('credentials unavailable');
  };
  const service = new TriggerRuntimeStatusService(
    credentials,
    createRuntimeService(),
    createOperations()
  );

  const status = await service.getStatus('tenant-1');

  assert.equal(status.partial, true);
  assert.equal(status.engine.configured, false);
  assert.match(status.errors.credentials ?? '', /credentials unavailable/);
  assert.equal(status.workflows.length, 1);
}

function createCredentials() {
  const credential = {
    accessToken: 'tr_pat_test',
    adminEmail: 'admin@example.test',
    apiUrl: 'http://localhost:3030',
    environment: 'dev' as const,
    environmentId: 'env-1',
    loadedAt: new Date(0).toISOString(),
    projectName: 'enlearn-workflow-local',
    projectRef: 'proj-1',
    secretKey: 'tr_dev_test',
    selection: 'configured' as const,
    source: 'environment' as const
  };
  return {
    getCredentials: async () => credential,
    configureSdk: async () => credential,
    getWorkerStatus: async () => ({
      activeWorkerCount: 1,
      environmentConcurrencyLimit: 5,
      workers: [{
        id: 'worker-1',
        name: 'worker-1',
        resourceIdentifier: 'worker-1',
        lastHeartbeatAt: new Date(0).toISOString()
      }]
    }),
    listRecentRuns: async () => [
      run('run-1', ['tenant:tenant-1', 'workflow-instance:instance-1']),
      run('run-2', ['tenant:tenant-1']),
      run('run-3', ['tenant:tenant-2'])
    ],
    getStatus: async () => ({
      configured: true,
      apiUrl: 'http://localhost:3030',
      projectRef: 'proj-1',
      projectName: 'enlearn-workflow-local',
      environment: 'dev' as const,
      credentialSource: 'environment' as const,
      secretKeyConfigured: true,
      accessTokenConfigured: true,
      cached: true,
      cacheExpiresAt: null,
      selection: 'configured' as const,
      missing: []
    })
  };
}

function createRuntimeService() {
  return {
    listInstances: async () => [workflowInstance()]
  } as unknown as Pick<RuntimeService, 'listInstances'>;
}

function createOperations(): TriggerRuntimeStatusOperations {
  return {
    listQueues: async () => [
      { id: 'queue-1', name: 'workflow.instance.run', type: 'task', running: 1, queued: 2, paused: false, concurrencyLimit: 5 },
      { id: 'queue-2', name: 'notification.dispatch', type: 'task', running: 0, queued: 1, paused: false, concurrencyLimit: 5 }
    ],
    listSchedules: async () => [],
    listWaitpoints: async () => [
      waitpoint('wait-1', ['tenant:tenant-1', 'workflow-instance:instance-1']),
      waitpoint('wait-2', ['tenant:tenant-2'])
    ],
    getDevPresence: async () => true
  };
}

function workflowInstance(): ProcessInstanceRecord {
  return {
    id: 'instance-1',
    tenantId: 'tenant-1',
    definitionId: 'definition-1',
    definitionVersion: 1,
    businessKey: 'business-1',
    title: 'Approval flow',
    status: 'running',
    triggerRunId: 'run-1',
    startedAt: new Date(0).toISOString()
  };
}

function run(id: string, tags: string[]) {
  return {
    id,
    status: 'WAITING',
    taskIdentifier: 'workflow.instance.run',
    tags,
    isQueued: false,
    isExecuting: false,
    isWaiting: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  };
}

function waitpoint(id: string, tags: string[]) {
  return {
    id,
    status: 'WAITING',
    tags,
    createdAt: new Date(0).toISOString()
  };
}

void main();
