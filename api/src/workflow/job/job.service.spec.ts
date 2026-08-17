import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkflowSupabaseService } from '../common/workflow-supabase.service';
import type { TriggerDevClient } from '../trigger/trigger-dev.client';
import { JobService } from './job.service';
import type { WorkflowJobRecord } from './job.types';
import { getTriggerWorkflowExecutionPlanSignature } from '../trigger/trigger-workflow-policy';

const actor = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-0000-0000-000000000001'
};

async function main() {
  await testCreateRejectsUnsupportedIntervalBeforeWriting();
  await testUpsertPersistsTheCurrentTypedWorkflowDefinition();
  await testUpsertRejectsUnregisteredWorkflowTask();
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
  await testDeleteJobDeletesScheduleBeforeRecord();
  await testDeleteJobAllowsMissingSchedule();
  await testDeleteJobDoesNotDeleteRecordWhenScheduleCleanupFails();
  await testCreateScheduleIsDeletedWhenRpcUpdateFails();
  await testExistingScheduleIsDeactivatedWhenRpcUpdateFails();
  await testTypedRunKeepsPersistedPlanAndTrustedActor();
  await testSyncRunReturnsFinalWorkflowOutput();
  await testTriggerFailureIsPreservedWhenFailureProjectionFails();
  await testTriggeredRunIsCanceledWhenRunIdProjectionFails();
  console.log('workflow-api Trigger.dev job Supabase RPC tests passed');
}

async function testUpsertRejectsUnregisteredWorkflowTask() {
  let rpcCalled = false;
  const service = createService(
    async () => {
      rpcCalled = true;
      return { data: null, error: null };
    },
    createTriggerClient()
  );

  const triggerWorkflow = createTypedWorkflowDefinition({
    modelId: 'model-untrusted',
    modelCode: 'untrusted-workflow-task',
    operations: [{
      id: 'op_task',
      nodeId: 'task',
      type: 'task.trigger',
      next: [],
      adapter: {
        type: 'registeredTask',
        executorTaskId: 'not.registered'
      }
    }]
  });

  await assert.rejects(
    () => service.upsertJob({
      code: 'untrusted-workflow-task',
      name: 'Untrusted workflow task',
      type: 'manual',
      triggerTaskId: 'workflow.trigger-workflow.run',
      payload: { triggerWorkflow }
    }, actor),
    /not registered for workflow-node execution/
  );
  assert.equal(rpcCalled, false);
}

async function testUpsertPersistsTheCurrentTypedWorkflowDefinition() {
  let command: { action: string; payload: Record<string, unknown> } | undefined;
  const job = createJob({
    type: 'manual',
    code: 'typed-workflow',
    triggerTaskId: 'workflow.trigger-workflow.run'
  });
  const service = createService(
    async (action, payload) => {
      command = { action, payload };
      return { data: toRow(job), error: null };
    },
    createTriggerClient()
  );

  const triggerWorkflow = createTypedWorkflowDefinition({
    modelId: 'model-1',
    modelCode: 'typed-workflow',
    operations: [{
      id: 'op_task',
      nodeId: 'task',
      type: 'task.trigger',
      next: [],
      adapter: {
        type: 'frontendCommand',
        executorTaskId: 'workflow.adapter.frontend-command',
        functionSource: "async () => ({ code: 'message.show', params: { message: 'ok' } })"
      }
    }]
  });

  await service.upsertJob({
    code: job.code,
    name: job.name,
    type: 'manual',
    triggerTaskId: job.triggerTaskId,
    payload: { triggerWorkflow }
  }, actor);

  assert.equal(command?.action, 'upsert_job');
  assert.equal(command?.payload.trigger_task_id, 'workflow.trigger-workflow.run');
  assert.equal(command?.payload.model_id, 'model-1');
  assert.deepEqual(command?.payload.payload, { triggerWorkflow });
}

async function testCreateRejectsUnsupportedIntervalBeforeWriting() {
  let rpcCalled = false;
  const service = createService(
    async () => {
      rpcCalled = true;
      return { data: null, error: null };
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
  assert.equal(rpcCalled, false);
}

async function testEnableCreatesScheduleAndPersistsItsId() {
  const calls: string[] = [];
  const job = createJob();
  const service = createService(
    sequenceRpc(job, { ...job, status: 'enabled', scheduleId: 'schedule-1' }),
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
    sequenceRpc(job, { ...job, status: 'enabled', scheduleId: 'schedule-existing' }),
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
    sequenceRpc(job, { ...job, status: 'enabled' }),
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
    sequenceRpc(job, { ...job, scheduleId: 'schedule-1' }),
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
    sequenceRpc(job, { ...job, status: 'enabled', scheduleId: 'schedule-existing' }),
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
    async () => ({ data: toRow(job), error: null }),
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
    async () => ({ data: toRow(job), error: null }),
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
    sequenceRpc(job, { ...job, status: 'disabled' }),
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
    sequenceRpc(job, { ...job, status: 'archived', scheduleId: undefined }),
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
    sequenceRpc(job, { ...job, status: 'archived', scheduleId: undefined }),
    createTriggerClient({
      deleteSchedule: async () => {
        throw Object.assign(new Error('Schedule not found'), { status: 404 });
      }
    })
  );

  const archived = await service.updateJobStatus(job.id, 'archived', actor);

  assert.equal(archived.scheduleId, undefined);
}

async function testDeleteJobDeletesScheduleBeforeRecord() {
  const calls: string[] = [];
  const job = createJob({ scheduleId: 'schedule-1' });
  const service = createService(
    async (action, payload) => {
      calls.push(`rpc:${action}`);
      if (action === 'get_job') return { data: toRow(job), error: null };
      assert.equal(action, 'delete_job');
      assert.equal(payload.account_id, actor.tenantId);
      assert.equal(payload.job_id, job.id);
      return { data: toRow(job), error: null };
    },
    createTriggerClient({
      deleteSchedule: async (scheduleId: string) => {
        calls.push(`schedule:delete:${scheduleId}`);
        return { id: scheduleId };
      }
    })
  );

  const deleted = await service.deleteJob(job.id, actor);

  assert.equal(deleted.id, job.id);
  assert.deepEqual(calls, [
    'rpc:get_job',
    'schedule:delete:schedule-1',
    'rpc:delete_job'
  ]);
}

async function testDeleteJobAllowsMissingSchedule() {
  const job = createJob({ scheduleId: 'missing-schedule' });
  let deleted = false;
  const service = createService(
    async (action) => {
      if (action === 'get_job') return { data: toRow(job), error: null };
      deleted = true;
      return { data: toRow(job), error: null };
    },
    createTriggerClient({
      deleteSchedule: async () => {
        throw Object.assign(new Error('Schedule not found'), { status: 404 });
      }
    })
  );

  await service.deleteJob(job.id, actor);

  assert.equal(deleted, true);
}

async function testDeleteJobDoesNotDeleteRecordWhenScheduleCleanupFails() {
  const job = createJob({ scheduleId: 'schedule-1' });
  let deleteRpcCalled = false;
  const service = createService(
    async (action) => {
      if (action === 'get_job') return { data: toRow(job), error: null };
      deleteRpcCalled = true;
      return { data: toRow(job), error: null };
    },
    createTriggerClient({
      deleteSchedule: async () => {
        throw new Error('Trigger.dev unavailable');
      }
    })
  );

  await assert.rejects(
    () => service.deleteJob(job.id, actor),
    /Trigger\.dev unavailable/
  );
  assert.equal(deleteRpcCalled, false);
}

async function testCreateScheduleIsDeletedWhenRpcUpdateFails() {
  const calls: string[] = [];
  const job = createJob();
  const service = createService(
    sequenceRpc(job, new Error('RPC update failed')),
    createTriggerClient({
      createSchedule: async () => ({ id: 'schedule-1' }),
      deleteSchedule: async (scheduleId: string) => {
        calls.push(`delete:${scheduleId}`);
        return { id: scheduleId };
      }
    })
  );

  await assert.rejects(() => service.updateJobStatus(job.id, 'enabled', actor), /RPC update failed/);
  assert.deepEqual(calls, ['delete:schedule-1']);
}

async function testExistingScheduleIsDeactivatedWhenRpcUpdateFails() {
  const calls: string[] = [];
  const job = createJob({ status: 'disabled', scheduleId: 'schedule-1' });
  const service = createService(
    sequenceRpc(job, new Error('RPC update failed')),
    createTriggerClient({
      updateSchedule: async (scheduleId: string) => ({ id: scheduleId }),
      activateSchedule: async (scheduleId: string) => ({ id: scheduleId }),
      deactivateSchedule: async (scheduleId: string) => {
        calls.push(`deactivate:${scheduleId}`);
        return { id: scheduleId };
      }
    })
  );

  await assert.rejects(() => service.updateJobStatus(job.id, 'enabled', actor), /RPC update failed/);
  assert.deepEqual(calls, ['deactivate:schedule-1']);
}

async function testTypedRunKeepsPersistedPlanAndTrustedActor() {
  const storedDefinition = createTypedWorkflowDefinition({
    modelId: 'model-trusted',
    modelCode: 'trusted-workflow',
    operations: [{
      id: 'op_task',
      nodeId: 'task',
      type: 'task.trigger',
      next: [],
      adapter: {
        type: 'frontendCommand',
        executorTaskId: 'workflow.adapter.frontend-command',
        functionSource: "async () => ({ code: 'message.show', params: { message: 'ok' } })"
      }
    }]
  });
  const job = createJob({
    type: 'manual',
    triggerTaskId: 'workflow.trigger-workflow.run',
    payload: { triggerWorkflow: storedDefinition, configuredValue: 'stored' }
  });
  const run = createRun();
  let commandCount = 0;
  let createdInput: Record<string, unknown> | undefined;
  let triggeredPayload: Record<string, unknown> | undefined;
  const service = createService(
    async (action, payload) => {
      commandCount += 1;
      if (action === 'get_job') return { data: toRow(job), error: null };
      if (action === 'create_run') {
        createdInput = payload.input as Record<string, unknown>;
        return { data: toRunRow({ ...run, input: createdInput }), error: null };
      }
      assert.equal(action, 'project_trigger_run');
      return {
        data: toRunRow({ ...run, input: createdInput ?? {}, triggerRunId: 'trigger-run-1' }),
        error: null
      };
    },
    createTriggerClient({
      triggerTask: async (_taskId: string, payload: Record<string, unknown>) => {
        triggeredPayload = payload;
        return { id: 'trigger-run-1' };
      }
    })
  );
  const suppliedDefinition = structuredClone(storedDefinition);
  suppliedDefinition.modelCode = 'caller-controlled';

  await service.runJob(job.id, {
    payload: {
      triggerWorkflow: suppliedDefinition,
      userId: 'caller-controlled-user',
      runId: 'caller-controlled-run',
      configuredValue: 'request',
      runtimeValue: 'request-only'
    }
  }, actor);

  assert.equal(commandCount, 3);
  assert.deepEqual(createdInput?.triggerWorkflow, storedDefinition);
  assert.equal(createdInput?.userId, actor.userId);
  assert.equal(createdInput?.runId, undefined);
  assert.equal(createdInput?.configuredValue, 'request');
  assert.equal(createdInput?.runtimeValue, 'request-only');
  assert.deepEqual(triggeredPayload?.triggerWorkflow, storedDefinition);
  assert.equal(triggeredPayload?.userId, actor.userId);
  assert.equal(triggeredPayload?.runId, run.id);
}

async function testSyncRunReturnsFinalWorkflowOutput() {
  const job = createJob({
    type: 'manual',
    triggerTaskId: 'workflow.job.run',
    payload: {}
  });
  const run = createRun();
  const completedRunRow = {
    ...toRunRow(run),
    trigger_run_id: 'trigger-run-1',
    status: 'succeeded',
    output: {
      variables: {
        taskOutputs: {
          inventory: [{ id: 'row-1' }]
        }
      },
      operationOutputs: {
        task: [{ id: 'row-1' }]
      }
    },
    finished_at: '2026-08-04T00:00:01.000Z'
  };
  let commandCount = 0;
  const service = createService(
    async (action, payload) => {
      commandCount += 1;
      if (action === 'get_job') return { data: toRow(job), error: null };
      if (action === 'create_run') return { data: toRunRow(run), error: null };
      assert.equal(action, 'project_trigger_run');
      assert.equal(payload.run_id, run.id);
      return {
        data: {
          ...toRunRow(run),
          trigger_run_id: 'trigger-run-1'
        },
        error: null
      };
    },
    createTriggerClient({
      triggerTask: async () => ({ id: 'trigger-run-1' })
    }),
    [
      toRunRow(run),
      completedRunRow
    ]
  );

  const output = await service.runJobAndWait(job.id, {}, actor);

  assert.deepEqual(output, completedRunRow.output);
  assert.equal(commandCount, 3);
}

async function testTriggerFailureIsPreservedWhenFailureProjectionFails() {
  const job = createJob({ type: 'manual' });
  const run = createRun();
  let call = 0;
  const service = createService(
    async () => {
      call += 1;
      if (call === 1) return { data: toRow(job), error: null };
      if (call === 2) return { data: toRunRow(run), error: null };
      return { data: null, error: { message: 'failure projection failed' } };
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
      if (call === 1) return { data: toRow(job), error: null };
      if (call === 2) return { data: toRunRow(run), error: null };
      return { data: null, error: { message: 'run projection failed' } };
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

type RpcResult = Promise<{ data: unknown; error: { message: string } | null }>;

function createService(
  rpc: (action: string, payload: Record<string, unknown>) => RpcResult,
  triggerClient: TriggerDevClient,
  runRows: Array<Record<string, unknown>> = []
) {
  let runReadIndex = 0;
  const client = {
    rpc: async (
      functionName: string,
      args: {
        p_action?: string;
        p_payload?: Record<string, unknown>;
        p_account_id?: string;
        p_job_id?: string;
      }
    ) => {
      if (functionName === 'workflow_delete_job') {
        return rpc('delete_job', {
          account_id: args.p_account_id,
          job_id: args.p_job_id
        });
      }
      assert.equal(functionName, 'workflow_job_command');
      return rpc(args.p_action!, args.p_payload!);
    },
    from: (tableName: string) => {
      assert.equal(tableName, 'wf_job_run');
      const query: any = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: runRows[Math.min(runReadIndex++, Math.max(runRows.length - 1, 0))] ?? null,
          error: null
        })
      };
      return query;
    }
  } as unknown as SupabaseClient;
  const persistence = { isConfigured: true, client } as WorkflowSupabaseService;
  return new JobService(persistence, triggerClient);
}

function sequenceRpc(current: WorkflowJobRecord, next: WorkflowJobRecord | Error) {
  let call = 0;
  return async (action: string, payload: Record<string, unknown>) => {
    call += 1;
    if (call === 1) {
      assert.equal(action, 'get_job');
      return { data: toRow(current), error: null };
    }
    assert.equal(action, 'update_job_status');
    if (next instanceof Error) return { data: null, error: { message: next.message } };
    assert.equal(payload.job_id, current.id);
    assert.equal(payload.account_id, actor.tenantId);
    assert.equal(payload.status, next.status);
    assert.equal(payload.schedule_id, next.scheduleId ?? null);
    return { data: toRow(next), error: null };
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

function createTypedWorkflowDefinition(input: {
  modelId: string;
  modelCode: string;
  operations: Array<Record<string, unknown>>;
}) {
  const executionPlan = {
    workflowId: input.modelId,
    workflowCode: input.modelCode,
    entryNodeId: String(input.operations[0]?.nodeId ?? ''),
    operations: input.operations
  };
  return {
    version: 1,
    modelId: input.modelId,
    modelCode: input.modelCode,
    planSignature: getTriggerWorkflowExecutionPlanSignature(executionPlan),
    executionPlan
  };
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
    created_at: job.createdAt,
    updated_at: job.updatedAt
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

function toRunRow(run: ReturnType<typeof createRun> & { triggerRunId?: string }) {
  return {
    id: run.id,
    account_id: run.tenantId,
    job_id: run.jobId,
    trigger_run_id: run.triggerRunId ?? null,
    status: run.status,
    attempt: run.attempt,
    input: run.input,
    output: null,
    error_message: null,
    started_at: null,
    finished_at: null,
    created_at: run.createdAt
  };
}

void main();
