import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { WorkflowSupabaseService } from '../common/workflow-supabase.service';
import { type CreateJobDto, type JobQueryDto, type JobRunQueryDto, type RunJobDto } from './job.dto';
import {
  type WorkflowJobActor,
  type WorkflowJobRecord,
  type WorkflowJobRunRecord,
  type WorkflowJobRunStatus
} from './job.types';
import { TriggerDevClient } from '../trigger/trigger-dev.client';

const WORKFLOW_SCHEDULED_JOB_TASK_ID = 'workflow.job.scheduled';
const WORKFLOW_JOB_RPC = 'workflow_job_command';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class JobService {
  constructor(
    @Inject(WorkflowSupabaseService)
    private readonly persistence: WorkflowSupabaseService,
    @Inject(TriggerDevClient) private readonly triggerClient: TriggerDevClient
  ) {}

  async createJob(dto: CreateJobDto, actor: WorkflowJobActor) {
    const code = dto.code.trim();
    const name = dto.name.trim();
    if (!code || !name) {
      throw new BadRequestException('Job code and name are required.');
    }

    if (dto.type === 'cron' && !dto.cronExpr?.trim()) {
      throw new BadRequestException('Cron job requires cronExpr.');
    }

    const payload = normalizeJobPayload(dto);
    if (dto.type === 'interval') {
      intervalCron(readIntervalSeconds(payload) ?? 60);
    }

    const row = await this.command('create_job', {
      account_id: actor.tenantId,
      code,
      name,
      type: dto.type,
      trigger_task_id: dto.triggerTaskId?.trim() || defaultTriggerTaskId(dto.type),
      cron_expr: dto.cronExpr?.trim() || null,
      timezone: dto.timezone?.trim() || 'Asia/Shanghai',
      payload,
      retry_policy: dto.retryPolicy ?? { maxAttempts: 3 },
      timeout_seconds: dto.timeoutSeconds ?? null,
      concurrency_key: dto.concurrencyKey?.trim() || null,
      created_by: actor.userId ?? null
    });

    return mapJob(assertRecord(row, 'Workflow job RPC returned an invalid job.'));
  }

  async upsertJob(dto: CreateJobDto, actor: WorkflowJobActor) {
    const code = dto.code.trim();
    const name = dto.name.trim();
    if (!code || !name) {
      throw new BadRequestException('Job code and name are required.');
    }
    if (dto.type === 'cron' && !dto.cronExpr?.trim()) {
      throw new BadRequestException('Cron job requires cronExpr.');
    }

    const payload = normalizeJobPayload(dto);
    if (dto.type === 'interval') {
      intervalCron(readIntervalSeconds(payload) ?? 60);
    }

    const row = await this.command('upsert_job', {
      account_id: actor.tenantId,
      model_id: readTriggerWorkflowModelId(payload) ?? null,
      code,
      name,
      type: dto.type,
      trigger_task_id: dto.triggerTaskId?.trim() || defaultTriggerTaskId(dto.type),
      cron_expr: dto.cronExpr?.trim() || null,
      timezone: dto.timezone?.trim() || 'Asia/Shanghai',
      payload,
      retry_policy: dto.retryPolicy ?? { maxAttempts: 3 },
      timeout_seconds: dto.timeoutSeconds ?? null,
      concurrency_key: dto.concurrencyKey?.trim() || null,
      created_by: actor.userId ?? null
    });

    const job = mapJob(assertRecord(row, 'Workflow job RPC returned an invalid job.'));
    if ((!isScheduledJob(job) && job.scheduleId) || (isScheduledJob(job) && job.status === 'enabled')) {
      return this.updateJobStatus(job.id, job.status, actor);
    }
    return job;
  }

  async listJobs(query: JobQueryDto, actor: WorkflowJobActor) {
    const rows = await this.command('list_jobs', {
      account_id: actor.tenantId,
      type: query.type ?? null,
      status: query.status ?? null
    });
    return assertRecordArray(rows, 'Workflow job RPC returned an invalid job list.').map(mapJob);
  }

  async getJob(jobId: string, actor: WorkflowJobActor) {
    const row = await this.command('get_job', {
      account_id: actor.tenantId,
      job_id: jobId
    });
    if (!row) throw new NotFoundException('Workflow job not found.');
    return mapJob(assertRecord(row, 'Workflow job RPC returned an invalid job.'));
  }

  async updateJobStatus(jobId: string, status: WorkflowJobRecord['status'], actor: WorkflowJobActor) {
    const current = await this.getJob(jobId, actor);
    if (!isScheduledJob(current) && current.status === status && !current.scheduleId) return current;

    let scheduleId = current.scheduleId;
    let compensation: (() => Promise<void>) | undefined;
    if (!isScheduledJob(current) && scheduleId) {
      try {
        await this.triggerClient.deleteSchedule(scheduleId);
      } catch (error) {
        if (!isTriggerNotFoundError(error)) throw error;
      }
      scheduleId = undefined;
    } else if (status === 'enabled' && isScheduledJob(current)) {
      let compensationMode: 'delete' | 'deactivate' | undefined;
      let schedule: { id: string };
      try {
        if (scheduleId) {
          schedule = await this.triggerClient.updateSchedule(scheduleId, scheduleOptions(current));
        } else {
          schedule = await this.createSchedule(current);
          compensationMode = 'delete';
        }
      } catch (error) {
        if (scheduleId && isTriggerNotFoundError(error)) {
          try {
            schedule = await this.createSchedule(current);
            compensationMode = 'delete';
          } catch (createError) {
            if (!isTriggerScheduleConflict(createError)) throw createError;
            schedule = await this.findSchedule(current);
            compensationMode = 'deactivate';
          }
        } else if (isTriggerScheduleConflict(error)) {
          schedule = await this.findSchedule(current);
          compensationMode = 'deactivate';
        } else {
          throw error;
        }
      }
      try {
        await this.triggerClient.activateSchedule(schedule.id);
      } catch (error) {
        await runCompensation(
          compensationMode === 'delete'
            ? () => this.triggerClient.deleteSchedule(schedule.id).then(() => undefined)
            : () => this.triggerClient.deactivateSchedule(schedule.id).then(() => undefined)
        );
        throw error;
      }
      scheduleId = schedule.id;
      if (current.status !== 'enabled') {
        compensation = compensationMode === 'delete'
          ? () => this.triggerClient.deleteSchedule(schedule.id).then(() => undefined)
          : () => this.triggerClient.deactivateSchedule(schedule.id).then(() => undefined);
      }
    } else if (scheduleId && status !== 'enabled') {
      try {
        if (status === 'archived') {
          await this.triggerClient.deleteSchedule(scheduleId);
          scheduleId = undefined;
        } else {
          await this.triggerClient.deactivateSchedule(scheduleId);
        }
      } catch (error) {
        if (!isTriggerNotFoundError(error)) throw error;
        scheduleId = undefined;
      }
    }

    if (current.status === status && current.scheduleId === scheduleId) return current;

    let row: unknown;
    try {
      row = await this.command('update_job_status', {
        account_id: actor.tenantId,
        job_id: jobId,
        status,
        schedule_id: scheduleId ?? null
      });
    } catch (error) {
      await runCompensation(compensation);
      throw error;
    }
    if (!row) {
      await runCompensation(compensation);
      throw new NotFoundException('Workflow job not found.');
    }
    return mapJob(assertRecord(row, 'Workflow job RPC returned an invalid job.'));
  }

  async runJob(jobId: string, dto: RunJobDto, actor: WorkflowJobActor) {
    const job = await this.getJob(jobId, actor);
    if (job.status === 'archived') {
      throw new BadRequestException('Archived job cannot be run.');
    }

    const input = {
      ...(job.payload ?? {}),
      ...(dto.payload ?? {}),
      jobId: job.id,
      tenantId: job.tenantId
    };
    const run = await this.createRun({
      tenantId: job.tenantId,
      jobId: job.id,
      status: 'queued',
      input
    });

    const triggerInput = {
      ...input,
      runId: run.id
    };

    let handle: { id: string };
    try {
      handle = await this.triggerClient.triggerTask(job.triggerTaskId, triggerInput, {
        idempotencyKey: `workflow-job-run:${run.id}`,
        tags: [`tenant:${job.tenantId}`, `workflow-job:${job.id}`, `workflow-job-run:${run.id}`]
      });
    } catch (error) {
      try {
        await this.finishRun(
          run.id,
          'failed',
          { handledBy: job.triggerTaskId, payload: triggerInput },
          error instanceof Error ? error.message : String(error)
        );
      } catch {
        // Preserve the Trigger.dev failure returned to the caller.
      }
      throw error;
    }

    try {
      const row = await this.command('project_trigger_run', {
        account_id: actor.tenantId,
        run_id: run.id,
        trigger_run_id: handle.id
      });
      if (!row) throw new NotFoundException('Workflow job run not found.');
      return mapRun(assertRecord(row, 'Workflow job RPC returned an invalid run.'));
    } catch (error) {
      await this.cancelRunAfterProjectionFailure(handle.id);
      throw error;
    }
  }

  async listRuns(query: JobRunQueryDto, actor: WorkflowJobActor) {
    const rows = await this.command('list_runs', {
      account_id: actor.tenantId,
      job_id: query.jobId ?? null,
      status: query.status ?? null,
      limit: Math.min(Math.max(query.limit ?? 20, 1), 200)
    });
    return assertRecordArray(rows, 'Workflow job RPC returned an invalid run list.').map(mapRun);
  }

  async markRunRunning(runId: string) {
    const row = await this.command('mark_run_running', { run_id: runId });
    return row
      ? mapRun(assertRecord(row, 'Workflow job RPC returned an invalid run.'))
      : undefined;
  }

  async finishRun(
    runId: string,
    status: WorkflowJobRunStatus,
    output: Record<string, unknown>,
    errorMessage?: string
  ) {
    const row = await this.command('finish_run', {
      run_id: runId,
      status,
      output,
      error_message: errorMessage ?? null
    });
    if (!row) throw new NotFoundException('Workflow job run not found.');
    return mapRun(assertRecord(row, 'Workflow job RPC returned an invalid run.'));
  }

  private async createRun(input: {
    tenantId: string;
    jobId?: string;
    triggerRunId?: string;
    status: WorkflowJobRunStatus;
    input: Record<string, unknown>;
  }) {
    const row = await this.command('create_run', {
      account_id: input.tenantId,
      job_id: input.jobId ?? null,
      trigger_run_id: input.triggerRunId ?? null,
      status: input.status,
      attempt: 1,
      input: input.input
    });
    return mapRun(assertRecord(row, 'Workflow job RPC returned an invalid run.'));
  }

  private async command(action: string, payload: JsonRecord) {
    if (!this.persistence.isConfigured) {
      throw new BadRequestException(
        'Supabase service-role configuration is required for workflow job persistence.'
      );
    }
    const { data, error } = await this.persistence.client.rpc(WORKFLOW_JOB_RPC, {
      p_action: action,
      p_payload: payload
    });
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  private async cancelRunAfterProjectionFailure(runId: string) {
    try {
      await this.triggerClient.cancelRun(runId);
    } catch {
      return;
    }
  }

  private createSchedule(job: WorkflowJobRecord) {
    return this.triggerClient.createSchedule({
      ...scheduleOptions(job),
      deduplicationKey: scheduleDeduplicationKey(job)
    });
  }

  private findSchedule(job: WorkflowJobRecord) {
    return this.triggerClient.findScheduleByDeduplicationKey(scheduleDeduplicationKey(job));
  }
}

function mapJob(row: JsonRecord): WorkflowJobRecord {
  const payload = readRecord(row.payload);
  return {
    id: readRequiredString(row.id, 'id'),
    tenantId: readRequiredString(row.account_id, 'account_id'),
    code: readRequiredString(row.code, 'code'),
    name: readRequiredString(row.name, 'name'),
    type: row.type as WorkflowJobRecord['type'],
    status: row.status as WorkflowJobRecord['status'],
    triggerTaskId: readRequiredString(row.trigger_task_id, 'trigger_task_id'),
    ...(readOptionalString(row.schedule_id) ? { scheduleId: readOptionalString(row.schedule_id) } : {}),
    ...(readOptionalString(row.cron_expr) ? { cronExpr: readOptionalString(row.cron_expr) } : {}),
    timezone: readRequiredString(row.timezone, 'timezone'),
    payload,
    ...(readIntervalSeconds(payload) ? { intervalSeconds: readIntervalSeconds(payload) } : {}),
    retryPolicy: readRecord(row.retry_policy),
    ...(readPositiveNumber(row.timeout_seconds) ? { timeoutSeconds: readPositiveNumber(row.timeout_seconds) } : {}),
    ...(readOptionalString(row.concurrency_key) ? { concurrencyKey: readOptionalString(row.concurrency_key) } : {}),
    ...(readOptionalString(row.created_by) ? { createdBy: readOptionalString(row.created_by) } : {}),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapRun(row: JsonRecord): WorkflowJobRunRecord {
  return {
    id: readRequiredString(row.id, 'id'),
    tenantId: readRequiredString(row.account_id, 'account_id'),
    ...(readOptionalString(row.job_id) ? { jobId: readOptionalString(row.job_id) } : {}),
    ...(readOptionalString(row.trigger_run_id) ? { triggerRunId: readOptionalString(row.trigger_run_id) } : {}),
    status: row.status as WorkflowJobRunRecord['status'],
    attempt: readPositiveNumber(row.attempt) ?? 1,
    input: readRecord(row.input),
    ...(isRecord(row.output) ? { output: row.output } : {}),
    ...(readOptionalString(row.error_message) ? { errorMessage: readOptionalString(row.error_message) } : {}),
    ...(row.started_at ? { startedAt: toIso(row.started_at) } : {}),
    ...(row.finished_at ? { finishedAt: toIso(row.finished_at) } : {}),
    createdAt: toIso(row.created_at)
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, message: string) {
  if (!isRecord(value)) throw new BadRequestException(message);
  return value;
}

function assertRecordArray(value: unknown, message: string) {
  if (!Array.isArray(value) || !value.every(isRecord)) throw new BadRequestException(message);
  return value;
}

function readRecord(value: unknown) {
  return isRecord(value) ? value : {};
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readRequiredString(value: unknown, field: string) {
  const result = readOptionalString(value);
  if (!result) throw new BadRequestException(`Workflow job RPC response is missing ${field}.`);
  return result;
}

function readPositiveNumber(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function toIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new BadRequestException('Workflow job RPC returned an invalid timestamp.');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Workflow job RPC returned an invalid timestamp.');
  }
  return date.toISOString();
}

function defaultTriggerTaskId(type: WorkflowJobRecord['type']) {
  if (type === 'service_task') return 'workflow.service.execute';
  return 'workflow.job.run';
}

function normalizeJobPayload(dto: CreateJobDto) {
  const payload = { ...(dto.payload ?? {}) };
  if (dto.type === 'interval') {
    payload.intervalSeconds = dto.intervalSeconds ?? readIntervalSeconds(payload) ?? 60;
  }
  return payload;
}

function readTriggerWorkflowModelId(payload: Record<string, unknown>) {
  const definition = isRecord(payload.triggerWorkflow) ? payload.triggerWorkflow : undefined;
  return readOptionalString(definition?.modelId);
}

function readIntervalSeconds(payload: Record<string, unknown> | null | undefined) {
  const value = payload?.intervalSeconds;
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function isScheduledJob(job: WorkflowJobRecord) {
  return job.type === 'cron' || job.type === 'interval';
}

function scheduleOptions(job: WorkflowJobRecord) {
  return {
    task: WORKFLOW_SCHEDULED_JOB_TASK_ID,
    cron: job.type === 'cron' ? job.cronExpr! : intervalCron(job.intervalSeconds ?? 60),
    timezone: job.timezone,
    externalId: job.id
  };
}

function intervalCron(intervalSeconds: number) {
  if (intervalSeconds % 60 === 0 && intervalSeconds / 60 <= 59) {
    return `*/${intervalSeconds / 60} * * * *`;
  }
  throw new BadRequestException(
    'Trigger.dev interval jobs must use a whole number of minutes from 1 to 59.'
  );
}

async function runCompensation(compensation: (() => Promise<void>) | undefined) {
  if (!compensation) return;
  try {
    await compensation();
  } catch {
    return;
  }
}

function scheduleDeduplicationKey(job: WorkflowJobRecord) {
  return `workflow-job:${job.id}`;
}

function isTriggerNotFoundError(error: unknown) {
  return triggerErrorStatus(error) === 404;
}

function isTriggerScheduleConflict(error: unknown) {
  return triggerErrorStatus(error) === 409;
}

function triggerErrorStatus(error: unknown) {
  if (typeof error !== 'object' || error === null) return undefined;
  const typedError = error as {
    response?: { status?: unknown };
    status?: unknown;
    statusCode?: unknown;
  };
  return typedError.status ?? typedError.statusCode ?? typedError.response?.status;
}
