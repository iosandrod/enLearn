import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import type { DatabaseService } from '../common/database.service';
import type { TriggerDevClient } from '../trigger/trigger-dev.client';
import { JobService } from './job.service';
import type { WorkflowJobRecord } from './job.types';

const actor = {
  tenantId: 'default',
  userId: '00000000-0000-0000-0000-000000000001'
};

async function main() {
  await testCreateRejectsUnsupportedIntervalBeforeWriting();
  await testEnableCreatesScheduleAndPersistsItsId();
  await testCreateConflictRecoversExistingSchedule();
  await testAlreadyEnabledJobWithoutScheduleIsReconciled();
  await testEnableReusesExistingSchedule();
  await testMissingStoredScheduleRecoversDeduplicatedSchedule();
  await testCreatedScheduleIsDeletedWhenActivationFails();
  await testExistingScheduleIsDeactivatedWhenActivationFails();
  await testDisableDeactivatesSchedule();
  await testArchiveDeletesSchedule();
  await testArchiveClearsMissingSchedule();
  await testCreateScheduleIsDeletedWhenDatabaseUpdateFails();
  await testExistingScheduleIsDeactivatedWhenDatabaseUpdateFails();
  await testTriggerFailureIsPreservedWhenFailureProjectionFails();
  await testTriggeredRunIsCanceledWhenRunIdProjectionFails();
  console.log('workflow-api Trigger.dev job schedule tests passed');
}

async function testCreateRejectsUnsupportedIntervalBeforeWriting() {
  let queryCalled = false;
  const service = createService(
    async () => {
      queryCalled = true;
      return { rows: [] };
    },
    createTriggerClient()
  );

  await assert.rejects(
    () =>
      service.createJob(
        {
          code: 'every_20_seconds',
          name: 'Every 20 seconds',
          type: 'interval',
          intervalSeconds: 20
        },
        actor
      ),
    BadRequestException
  );
  assert.equal(queryCalled, false);
}

async function testEnableCreatesScheduleAndPersistsItsId() {
  const calls: string[] = [];
  const job = createJob();
  const service = createService(
    sequenceDatabase(job, { ...job, status: 'enabled', scheduleId: 'schedule-1' }),
    createTriggerClient({
      createSchedule: async (options: Parameters<TriggerDevClient['createSchedule']>[0]) => {
        calls.push(`create:${options.cron}:${options.externalId}:${options.deduplicationKey}`);
        return { id: 'schedule-1' };
      }
    })
  );

  const enabled = await service.updateJobStatus(job.id, 'enabled', actor);

  assert.equal(enabled.scheduleId, 'schedule-1');
  assert.deepEqual(calls, ['create:*/1 * * * *:job-1:workflow-job:job-1']);
}

async function testCreateConflictRecoversExistingSchedule() {
  const calls: string[] = [];
  const job = createJob();
  const service = createService(
    sequenceDatabase(job, { ...job, status: 'enabled', scheduleId: 'schedule-existing' }),
    createTriggerClient({
      createSchedule: async () => {
        throw Object.assign(new Error('Schedule already exists'), { status: 409 });
      },
      findScheduleByDeduplicationKey: async (key: string) => {
        calls.push(`find:${key}`);
        return { id: 'schedule-existing' };
      },
      activateSchedule: async (scheduleId: string) => {
        calls.push(`activate:${scheduleId}`);
        return { id: scheduleId };
      }
    })
  );

  const enabled = await service.updateJobStatus(job.id, 'enabled', actor);

  assert.equal(enabled.scheduleId, 'schedule-existing');
  assert.deepEqual(calls, ['find:workflow-job:job-1', 'activate:schedule-existing']);
}

async function testEnableReusesExistingSchedule() {
  const calls: string[] = [];
  const job = createJob({ status: 'disabled', scheduleId: 'schedule-1' });
  const service = createService(
    sequenceDatabase(job, { ...job, status: 'enabled' }),
    createTriggerClient({
      updateSchedule: async (
        scheduleId: string,
        options: Parameters<TriggerDevClient['updateSchedule']>[1]
      ) => {
        calls.push(`update:${scheduleId}:${options.cron}`);
        return { id: scheduleId };
      },
      activateSchedule: async (scheduleId: string) => {
        calls.push(`activate:${scheduleId}`);
        return { id: scheduleId };
      }
    })
  );

  await service.updateJobStatus(job.id, 'enabled', actor);

  assert.deepEqual(calls, ['update:schedule-1:*/1 * * * *', 'activate:schedule-1']);
}

async function testAlreadyEnabledJobWithoutScheduleIsReconciled() {
  const calls: string[] = [];
  const job = createJob({ status: 'enabled' });
  const service = createService(
    sequenceDatabase(job, { ...job, scheduleId: 'schedule-1' }),
    createTriggerClient({
      createSchedule: async () => {
        calls.push('create:schedule-1');
        return { id: 'schedule-1' };
      }
    })
  );

  const enabled = await service.updateJobStatus(job.id, 'enabled', actor);

  assert.equal(enabled.scheduleId, 'schedule-1');
  assert.deepEqual(calls, ['create:schedule-1']);
}

async function testMissingStoredScheduleRecoversDeduplicatedSchedule() {
  const calls: string[] = [];
  const job = createJob({ status: 'disabled', scheduleId: 'missing-schedule' });
  const service = createService(
    sequenceDatabase(job, { ...job, status: 'enabled', scheduleId: 'schedule-existing' }),
    createTriggerClient({
      updateSchedule: async () => {
        throw Object.assign(new Error('Schedule not found'), { status: 404 });
      },
      createSchedule: async () => {
        throw Object.assign(new Error('Schedule already exists'), { status: 409 });
      },
      findScheduleByDeduplicationKey: async (key: string) => {
        calls.push(`find:${key}`);
        return { id: 'schedule-existing' };
      },
      activateSchedule: async (scheduleId: string) => {
        calls.push(`activate:${scheduleId}`);
        return { id: scheduleId };
      }
    })
  );

  const enabled = await service.updateJobStatus(job.id, 'enabled', actor);

  assert.equal(enabled.scheduleId, 'schedule-existing');
  assert.deepEqual(calls, ['find:workflow-job:job-1', 'activate:schedule-existing']);
}

async function testCreatedScheduleIsDeletedWhenActivationFails() {
  const calls: string[] = [];
  const job = createJob();
  const service = createService(
    async () => ({ rows: [toRow(job)] }),
    createTriggerClient({
      createSchedule: async () => ({ id: 'schedule-1' }),
      activateSchedule: async () => {
        throw new Error('activation failed');
      },
      deleteSchedule: async (scheduleId: string) => {
        calls.push(`delete:${scheduleId}`);
        return { id: scheduleId };
      }
    })
  );

  await assert.rejects(() => service.updateJobStatus(job.id, 'enabled', actor), /activation failed/);
  assert.deepEqual(calls, ['delete:schedule-1']);
}

async function testExistingScheduleIsDeactivatedWhenActivationFails() {
  const calls: string[] = [];
  const job = createJob({ status: 'disabled', scheduleId: 'schedule-1' });
  const service = createService(
    async () => ({ rows: [toRow(job)] }),
    createTriggerClient({
      updateSchedule: async (scheduleId: string) => ({ id: scheduleId }),
      activateSchedule: async () => {
        throw new Error('activation failed');
      },
      deactivateSchedule: async (scheduleId: string) => {
        calls.push(`deactivate:${scheduleId}`);
        return { id: scheduleId };
      }
    })
  );

  await assert.rejects(() => service.updateJobStatus(job.id, 'enabled', actor), /activation failed/);
  assert.deepEqual(calls, ['deactivate:schedule-1']);
}

async function testDisableDeactivatesSchedule() {
  const calls: string[] = [];
  const job = createJob({ status: 'enabled', scheduleId: 'schedule-1' });
  const service = createService(
    sequenceDatabase(job, { ...job, status: 'disabled' }),
    createTriggerClient({
      deactivateSchedule: async (scheduleId: string) => {
        calls.push(`deactivate:${scheduleId}`);
        return { id: scheduleId };
      }
    })
  );

  await service.updateJobStatus(job.id, 'disabled', actor);

  assert.deepEqual(calls, ['deactivate:schedule-1']);
}

async function testArchiveDeletesSchedule() {
  const calls: string[] = [];
  const job = createJob({ status: 'enabled', scheduleId: 'schedule-1' });
  const service = createService(
    sequenceDatabase(job, { ...job, status: 'archived', scheduleId: undefined }),
    createTriggerClient({
      deleteSchedule: async (scheduleId: string) => {
        calls.push(`delete:${scheduleId}`);
        return { id: scheduleId };
      }
    })
  );

  const archived = await service.updateJobStatus(job.id, 'archived', actor);

  assert.equal(archived.scheduleId, undefined);
  assert.deepEqual(calls, ['delete:schedule-1']);
}

async function testArchiveClearsMissingSchedule() {
  const job = createJob({ status: 'enabled', scheduleId: 'missing-schedule' });
  const service = createService(
    sequenceDatabase(job, { ...job, status: 'archived', scheduleId: undefined }),
    createTriggerClient({
      deleteSchedule: async () => {
        throw Object.assign(new Error('Schedule not found'), { status: 404 });
      }
    })
  );

  const archived = await service.updateJobStatus(job.id, 'archived', actor);

  assert.equal(archived.scheduleId, undefined);
}

async function testCreateScheduleIsDeletedWhenDatabaseUpdateFails() {
  const calls: string[] = [];
  const job = createJob();
  const service = createService(
    sequenceDatabase(job, new Error('database update failed')),
    createTriggerClient({
      createSchedule: async () => ({ id: 'schedule-1' }),
      deleteSchedule: async (scheduleId: string) => {
        calls.push(`delete:${scheduleId}`);
        return { id: scheduleId };
      }
    })
  );

  await assert.rejects(() => service.updateJobStatus(job.id, 'enabled', actor), /database update failed/);
  assert.deepEqual(calls, ['delete:schedule-1']);
}

async function testExistingScheduleIsDeactivatedWhenDatabaseUpdateFails() {
  const calls: string[] = [];
  const job = createJob({ status: 'disabled', scheduleId: 'schedule-1' });
  const service = createService(
    sequenceDatabase(job, new Error('database update failed')),
    createTriggerClient({
      updateSchedule: async (scheduleId: string) => ({ id: scheduleId }),
      activateSchedule: async (scheduleId: string) => ({ id: scheduleId }),
      deactivateSchedule: async (scheduleId: string) => {
        calls.push(`deactivate:${scheduleId}`);
        return { id: scheduleId };
      }
    })
  );

  await assert.rejects(() => service.updateJobStatus(job.id, 'enabled', actor), /database update failed/);
  assert.deepEqual(calls, ['deactivate:schedule-1']);
}

async function testTriggerFailureIsPreservedWhenFailureProjectionFails() {
  const job = createJob({ type: 'manual' });
  const run = createRun();
  let call = 0;
  const service = createService(
    async () => {
      call += 1;
      if (call === 1) return { rows: [toRow(job)] };
      if (call === 2) return { rows: [toRunRow(run)] };
      throw new Error('failure projection failed');
    },
    createTriggerClient({
      triggerTask: async () => {
        throw new Error('Trigger.dev unavailable');
      }
    })
  );

  await assert.rejects(() => service.runJob(job.id, {}, actor), /Trigger\.dev unavailable/);
}

async function testTriggeredRunIsCanceledWhenRunIdProjectionFails() {
  const job = createJob({ type: 'manual' });
  const run = createRun();
  let call = 0;
  let canceledRunId: string | undefined;
  const service = createService(
    async () => {
      call += 1;
      if (call === 1) return { rows: [toRow(job)] };
      if (call === 2) return { rows: [toRunRow(run)] };
      throw new Error('run projection failed');
    },
    createTriggerClient({
      triggerTask: async () => ({ id: 'trigger-run-1' }),
      cancelRun: async (runId: string) => {
        canceledRunId = runId;
      }
    })
  );

  await assert.rejects(() => service.runJob(job.id, {}, actor), /run projection failed/);
  assert.equal(canceledRunId, 'trigger-run-1');
}

function createService(
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>,
  triggerClient: TriggerDevClient
) {
  const database = { query } as unknown as DatabaseService;
  return new JobService(database, triggerClient);
}

function sequenceDatabase(current: WorkflowJobRecord, next: WorkflowJobRecord | Error) {
  let call = 0;
  return async (_text: string, values: unknown[] = []) => {
    call += 1;
    if (call === 1) return { rows: [toRow(current)] };
    if (next instanceof Error) throw next;
    assert.deepEqual(values.slice(0, 3), [current.id, actor.tenantId, next.status]);
    assert.equal(values[3], next.scheduleId ?? null);
    return { rows: [toRow(next)] };
  };
}

function createTriggerClient(overrides: Record<string, unknown> = {}) {
  return {
    createSchedule: async () => ({ id: 'schedule-1' }),
    findScheduleByDeduplicationKey: async () => ({ id: 'schedule-1' }),
    updateSchedule: async (scheduleId: string) => ({ id: scheduleId }),
    activateSchedule: async (scheduleId: string) => ({ id: scheduleId }),
    deactivateSchedule: async (scheduleId: string) => ({ id: scheduleId }),
    deleteSchedule: async (scheduleId: string) => ({ id: scheduleId }),
    triggerTask: async () => ({ id: 'run-1' }),
    cancelRun: async () => {},
    ...overrides
  } as unknown as TriggerDevClient;
}

function createJob(overrides: Partial<WorkflowJobRecord> = {}): WorkflowJobRecord {
  return {
    id: 'job-1',
    tenantId: actor.tenantId,
    code: 'every_minute',
    name: 'Every minute',
    type: 'interval',
    status: 'draft',
    triggerTaskId: 'workflow.job.run',
    timezone: 'Asia/Shanghai',
    intervalSeconds: 60,
    payload: { intervalSeconds: 60 },
    retryPolicy: { maxAttempts: 3 },
    createdBy: actor.userId,
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
    ...overrides
  };
}

function toRow(job: WorkflowJobRecord) {
  return {
    id: job.id,
    account_id: job.tenantId,
    code: job.code,
    name: job.name,
    type: job.type,
    status: job.status,
    trigger_task_id: job.triggerTaskId,
    schedule_id: job.scheduleId ?? null,
    cron_expr: job.cronExpr ?? null,
    timezone: job.timezone,
    payload: job.payload,
    retry_policy: job.retryPolicy,
    timeout_seconds: job.timeoutSeconds ?? null,
    concurrency_key: job.concurrencyKey ?? null,
    created_by: job.createdBy ?? null,
    created_at: new Date(job.createdAt),
    updated_at: new Date(job.updatedAt)
  };
}

function createRun() {
  return {
    id: 'job-run-1',
    tenantId: actor.tenantId,
    jobId: 'job-1',
    status: 'queued' as const,
    attempt: 1,
    input: {},
    createdAt: '2026-08-04T00:00:00.000Z'
  };
}

function toRunRow(run: ReturnType<typeof createRun>) {
  return {
    id: run.id,
    account_id: run.tenantId,
    job_id: run.jobId,
    trigger_run_id: null,
    status: run.status,
    attempt: run.attempt,
    input: run.input,
    output: null,
    error_message: null,
    started_at: null,
    finished_at: null,
    created_at: new Date(run.createdAt)
  };
}

void main();
