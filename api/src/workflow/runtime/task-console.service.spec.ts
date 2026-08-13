import assert from 'node:assert/strict';
import type { WorkflowJobRecord, WorkflowJobRunRecord } from '../job/job.types';
import type { TriggerRuntimeStatus } from '../trigger/trigger-runtime-status.service';
import { TaskConsoleService } from './task-console.service';

async function main() {
  await testAggregatesJobsSystemTasksAndRuntimeState();
  await testDetailUsesDatabaseRunsWhenTriggerRunsAreUnavailable();
  await testRefreshDetailReloadsSnapshot();
  console.log('workflow task console service tests passed');
}

async function testAggregatesJobsSystemTasksAndRuntimeState() {
  const calls: Array<{ tenantId: string; scope: Record<string, unknown> }> = [];
  const service = new TaskConsoleService(
    createJobService(),
    {
      getStatus: async (tenantId: string, scope: Record<string, unknown>) => {
        calls.push({ tenantId, scope });
        return runtimeStatus();
      }
    } as never
  );

  const result = await service.getConsole('tenant-1');
  const job = result.rows.find((row) => row.id === 'job-1');
  const systemTask = result.rows.find((row) => row.id === 'system:notification.dispatch');
  const discoveredTask = result.rows.find((row) => row.id === 'system:future.background.task');

  assert.ok(job);
  assert.equal(job.source, 'job');
  assert.equal(job.lastRun?.status, 'failed');
  assert.equal(job.lastRun?.durationMs, 2_000);
  assert.equal(job.scheduleActive, true);
  assert.equal(job.nextRunAt, '2026-08-14T00:00:00.000Z');
  assert.equal(job.runCounts.failed, 1);
  assert.equal(job.queuedCount, 2);
  assert.ok(systemTask);
  assert.equal(systemTask.lastRun?.status, 'COMPLETED');
  assert.equal(systemTask.queuedCount, 1);
  assert.ok(discoveredTask);
  assert.equal(discoveredTask.description, '从 Trigger.dev 运行状态自动发现的后台任务。');
  assert.equal(result.summary.jobCount, 1);
  assert.equal(result.summary.failedRuns, 1);
  assert.equal(result.partial, true);
  assert.match(result.errors.runs ?? '', /unavailable/);
  assert.equal(calls[0].tenantId, 'tenant-1');
  assert.deepEqual(
    (calls[0].scope.taskIdentifiers as string[]).includes('custom.task'),
    true
  );
  assert.deepEqual(calls[0].scope.scheduleExternalIds, ['job-1']);
  await service.getDetail('tenant-1', 'job-1');
  assert.equal(calls.length, 1);
}

async function testDetailUsesDatabaseRunsWhenTriggerRunsAreUnavailable() {
  const service = new TaskConsoleService(
    createJobService(),
    { getStatus: async () => runtimeStatus() } as never
  );

  const detail = await service.getDetail('tenant-1', 'job-1');

  assert.equal(detail.task.id, 'job-1');
  assert.equal(detail.job?.triggerTaskId, 'custom.task');
  assert.equal(detail.runs.length, 1);
  assert.equal(detail.runs[0].source, 'database');
  assert.equal(detail.runs[0].errorMessage, 'test failure');
  assert.equal(detail.partial, true);
}

async function testRefreshDetailReloadsSnapshot() {
  let statusCalls = 0;
  const service = new TaskConsoleService(
    createJobService(),
    {
      getStatus: async () => {
        statusCalls += 1;
        return runtimeStatus();
      }
    } as never
  );

  await service.getConsole('tenant-1');
  await service.refreshDetail('tenant-1', 'job-1');

  assert.equal(statusCalls, 2);
}

function createJobService() {
  return {
    listJobs: async () => [job()],
    listRuns: async (query: { jobId?: string }) => query.jobId && query.jobId !== 'job-1'
      ? []
      : [jobRun()]
  } as never;
}

function job(): WorkflowJobRecord {
  return {
    id: 'job-1',
    tenantId: 'tenant-1',
    code: 'custom-job',
    name: '自定义定时任务',
    type: 'cron',
    status: 'enabled',
    triggerTaskId: 'custom.task',
    scheduleId: 'schedule-1',
    cronExpr: '0 8 * * *',
    timezone: 'Asia/Shanghai',
    payload: {},
    retryPolicy: { maxAttempts: 3 },
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z'
  };
}

function jobRun(): WorkflowJobRunRecord {
  return {
    id: 'job-run-1',
    tenantId: 'tenant-1',
    jobId: 'job-1',
    triggerRunId: 'trigger-job-run-1',
    status: 'failed',
    attempt: 2,
    input: {},
    errorMessage: 'test failure',
    createdAt: '2026-08-13T00:00:00.000Z',
    startedAt: '2026-08-13T00:00:01.000Z',
    finishedAt: '2026-08-13T00:00:03.000Z'
  };
}

function runtimeStatus(): TriggerRuntimeStatus {
  return {
    generatedAt: '2026-08-13T01:00:00.000Z',
    partial: true,
    errors: { runs: 'Trigger.dev runs unavailable' },
    engine: {
      configured: true,
      apiUrl: 'http://localhost:3030',
      projectRef: 'project-1',
      environment: 'dev',
      environmentId: 'env-1',
      workerConnected: true,
      activeWorkerCount: 0,
      environmentConcurrencyLimit: null
    },
    summary: {
      queueCount: 4,
      scheduleCount: 1,
      activeScheduleCount: 1,
      queuedRuns: 2,
      runningRuns: 1,
      waitingRuns: 0,
      waitingWaitpoints: 0,
      runningWorkflowInstances: 0
    },
    queues: [
      {
        id: 'queue-custom',
        name: 'custom.task',
        type: 'task',
        running: 1,
        queued: 2,
        paused: false,
        concurrencyLimit: 3
      },
      {
        id: 'queue-notification',
        name: 'notificationdispatch',
        type: 'task',
        running: 0,
        queued: 1,
        paused: false,
        concurrencyLimit: 10
      },
      {
        id: 'queue-future-task',
        name: 'future.background.task',
        type: 'task',
        running: 0,
        queued: 0,
        paused: false,
        concurrencyLimit: 10
      },
      {
        id: 'queue-custom-shared',
        name: 'unrelated-shared-queue',
        type: 'custom',
        running: 0,
        queued: 0,
        paused: false,
        concurrencyLimit: 10
      }
    ],
    runs: [{
      id: 'trigger-system-run-1',
      status: 'COMPLETED',
      taskIdentifier: 'notification.dispatch',
      tags: ['tenant:tenant-1'],
      isQueued: false,
      isExecuting: false,
      isWaiting: false,
      createdAt: '2026-08-13T00:30:00.000Z',
      updatedAt: '2026-08-13T00:30:01.000Z',
      startedAt: '2026-08-13T00:30:00.000Z',
      finishedAt: '2026-08-13T00:30:01.000Z'
    }],
    schedules: [{
      id: 'schedule-1',
      type: 'IMPERATIVE',
      task: 'workflow.job.scheduled',
      active: true,
      cron: '0 8 * * *',
      description: 'At 08:00',
      timezone: 'Asia/Shanghai',
      nextRunAt: '2026-08-14T00:00:00.000Z',
      externalId: 'job-1',
      deduplicationKey: 'workflow-job:job-1'
    }],
    waitpoints: [],
    workers: [],
    workflows: []
  };
}

void main();
