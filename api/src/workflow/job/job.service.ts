import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { type CreateJobDto, type JobQueryDto, type JobRunQueryDto, type RunJobDto } from './job.dto';
import {
  type WorkflowJobActor,
  type WorkflowJobRecord,
  type WorkflowJobRunRecord,
  type WorkflowJobRunStatus
} from './job.types';
import { TriggerDevClient } from '../trigger/trigger-dev.client';

const WORKFLOW_SCHEDULED_JOB_TASK_ID = 'workflow.job.scheduled';

function isMissingWorkflowJobTableError(error: unknown) {
  const databaseError = error as { code?: string; message?: string };
  return (
    databaseError.code === '42P01' &&
    typeof databaseError.message === 'string' &&
    (databaseError.message.includes('wf_job') || databaseError.message.includes('wf_job_run'))
  );
}

@Injectable()
export class JobService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
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
    const result = await this.database.query<WorkflowJobRow>(
      `insert into public.wf_job (
        tenant_id, code, name, type, status, trigger_task_id, cron_expr, timezone,
        payload, retry_policy, timeout_seconds, concurrency_key, created_by
      ) values ($1, $2, $3, $4, 'draft', $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12)
      returning *`,
      [
        actor.tenantId,
        code,
        name,
        dto.type,
        dto.triggerTaskId?.trim() || defaultTriggerTaskId(dto.type),
        dto.cronExpr?.trim() || null,
        dto.timezone?.trim() || 'Asia/Shanghai',
        JSON.stringify(payload),
        JSON.stringify(dto.retryPolicy ?? { maxAttempts: 3 }),
        dto.timeoutSeconds ?? null,
        dto.concurrencyKey?.trim() || null,
        actor.userId ?? null
      ]
    );

    return mapJob(result.rows[0]);
  }

  async listJobs(query: JobQueryDto, actor: WorkflowJobActor) {
    const tenantId = actor.tenantId;
    const values: unknown[] = [tenantId];
    const conditions = ['tenant_id = $1'];

    if (query.type) {
      values.push(query.type);
      conditions.push(`type = $${values.length}`);
    }

    if (query.status) {
      values.push(query.status);
      conditions.push(`status = $${values.length}`);
    }

    try {
      const result = await this.database.query<WorkflowJobRow>(
        `select * from public.wf_job where ${conditions.join(' and ')} order by updated_at desc limit 200`,
        values
      );
      return result.rows.map(mapJob);
    } catch (error) {
      if (isMissingWorkflowJobTableError(error)) return [];
      throw error;
    }
  }

  async getJob(jobId: string, actor: WorkflowJobActor) {
    const result = await this.database.query<WorkflowJobRow>(
      'select * from public.wf_job where id = $1 and tenant_id = $2',
      [jobId, actor.tenantId]
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Workflow job not found.');
    return mapJob(row);
  }

  async updateJobStatus(jobId: string, status: WorkflowJobRecord['status'], actor: WorkflowJobActor) {
    const current = await this.getJob(jobId, actor);
    if (!isScheduledJob(current) && current.status === status) return current;

    let scheduleId = current.scheduleId;
    let compensation: (() => Promise<void>) | undefined;
    if (status === 'enabled' && isScheduledJob(current)) {
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

    let result;
    try {
      result = await this.database.query<WorkflowJobRow>(
        `update public.wf_job
        set status = $3, schedule_id = $4, updated_at = timezone('utc'::text, now())
        where id = $1 and tenant_id = $2
        returning *`,
        [jobId, actor.tenantId, status, scheduleId ?? null]
      );
    } catch (error) {
      await runCompensation(compensation);
      throw error;
    }
    const row = result.rows[0];
    if (!row) {
      await runCompensation(compensation);
      throw new NotFoundException('Workflow job not found.');
    }
    return mapJob(row);
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
      const updated = await this.database.query<WorkflowJobRunRow>(
        `update public.wf_job_run
        set trigger_run_id = $2
        where id = $1
        returning *`,
        [run.id, handle.id]
      );
      return mapRun(updated.rows[0]);
    } catch (error) {
      await this.cancelRunAfterProjectionFailure(handle.id);
      throw error;
    }
  }

  async listRuns(query: JobRunQueryDto, actor: WorkflowJobActor) {
    const tenantId = actor.tenantId;
    const values: unknown[] = [tenantId];
    const conditions = ['tenant_id = $1'];
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 200);

    if (query.jobId) {
      values.push(query.jobId);
      conditions.push(`job_id = $${values.length}`);
    }

    if (query.status) {
      values.push(query.status);
      conditions.push(`status = $${values.length}`);
    }

    try {
      const result = await this.database.query<WorkflowJobRunRow>(
        `select * from public.wf_job_run where ${conditions.join(' and ')} order by created_at desc limit $${values.length + 1}`,
        [...values, limit]
      );
      return result.rows.map(mapRun);
    } catch (error) {
      if (isMissingWorkflowJobTableError(error)) return [];
      throw error;
    }
  }

  async markRunRunning(runId: string) {
    const result = await this.database.query<WorkflowJobRunRow>(
      `update public.wf_job_run
      set status = 'running', started_at = coalesce(started_at, timezone('utc'::text, now()))
      where id = $1
      returning *`,
      [runId]
    );
    return result.rows[0] ? mapRun(result.rows[0]) : undefined;
  }

  async finishRun(
    runId: string,
    status: WorkflowJobRunStatus,
    output: Record<string, unknown>,
    errorMessage?: string
  ) {
    const result = await this.database.query<WorkflowJobRunRow>(
      `update public.wf_job_run
      set status = $2, output = $3::jsonb, error_message = $4, finished_at = timezone('utc'::text, now())
      where id = $1
      returning *`,
      [runId, status, JSON.stringify(output), errorMessage ?? null]
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Workflow job run not found.');
    return mapRun(row);
  }

  private async createRun(input: {
    tenantId: string;
    jobId?: string;
    triggerRunId?: string;
    status: WorkflowJobRunStatus;
    input: Record<string, unknown>;
  }) {
    const result = await this.database.query<WorkflowJobRunRow>(
      `insert into public.wf_job_run (tenant_id, job_id, trigger_run_id, status, attempt, input)
      values ($1, $2, $3, $4, 1, $5::jsonb)
      returning *`,
      [
        input.tenantId,
        input.jobId ?? null,
        input.triggerRunId ?? null,
        input.status,
        JSON.stringify(input.input)
      ]
    );
    return mapRun(result.rows[0]);
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

type WorkflowJobRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  type: WorkflowJobRecord['type'];
  status: WorkflowJobRecord['status'];
  trigger_task_id: string;
  schedule_id: string | null;
  cron_expr: string | null;
  timezone: string;
  payload: Record<string, unknown>;
  retry_policy: Record<string, unknown>;
  timeout_seconds: number | null;
  concurrency_key: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

type WorkflowJobRunRow = {
  id: string;
  tenant_id: string;
  job_id: string | null;
  trigger_run_id: string | null;
  status: WorkflowJobRunRecord['status'];
  attempt: number;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error_message: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
};

function mapJob(row: WorkflowJobRow): WorkflowJobRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    code: row.code,
    name: row.name,
    type: row.type,
    status: row.status,
    triggerTaskId: row.trigger_task_id,
    ...(row.schedule_id ? { scheduleId: row.schedule_id } : {}),
    ...(row.cron_expr ? { cronExpr: row.cron_expr } : {}),
    timezone: row.timezone,
    payload: row.payload ?? {},
    ...(readIntervalSeconds(row.payload) ? { intervalSeconds: readIntervalSeconds(row.payload) } : {}),
    retryPolicy: row.retry_policy ?? {},
    ...(row.timeout_seconds ? { timeoutSeconds: row.timeout_seconds } : {}),
    ...(row.concurrency_key ? { concurrencyKey: row.concurrency_key } : {}),
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function mapRun(row: WorkflowJobRunRow): WorkflowJobRunRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    ...(row.job_id ? { jobId: row.job_id } : {}),
    ...(row.trigger_run_id ? { triggerRunId: row.trigger_run_id } : {}),
    status: row.status,
    attempt: row.attempt,
    input: row.input ?? {},
    ...(row.output ? { output: row.output } : {}),
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    ...(row.started_at ? { startedAt: row.started_at.toISOString() } : {}),
    ...(row.finished_at ? { finishedAt: row.finished_at.toISOString() } : {}),
    createdAt: row.created_at.toISOString()
  };
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
