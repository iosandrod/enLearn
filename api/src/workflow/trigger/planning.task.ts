import { task } from '@trigger.dev/sdk';
import type { Pool } from 'pg';
import { createPlanningPool } from '../../planning-service/execution/planning-data-loader';
import { PlanningEngineResultValidationError } from '../../planning-service/execution/planning-engine-result';
import {
  isPlanningCanceled,
  PlanningCanceledError,
  PlanningPreflightError,
  PlanningResultValidationError
} from '../../planning-service/execution/planning-execution.types';
import {
  markPlanningRunFailed,
  PlanningOrchestrator
} from '../../planning-service/execution/planning-orchestrator';
import { PlanningRunRepository } from '../../planning-service/execution/planning-run.repository';

export const PLANNING_RUN_TASK_ID = 'planning.run';

export type PlanningTaskPayload = {
  accountId?: string;
  jobId?: string;
  jobType?: string;
  overrides?: Record<string, unknown>;
  planVersionId?: string;
  planningJobType?: string;
  planningScenarioId?: string;
  runId: string;
  scenarioId?: string;
  tenantId?: string;
};

export type NormalizedPlanningTaskPayload = {
  accountId: string;
  jobType: 'supply_plan';
  overrides?: Record<string, unknown>;
  planVersionId?: string;
  runId: string;
  scenarioId: string;
};

class PlanningTaskPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanningTaskPayloadError';
  }
}

export const planningRunTask = task({
  id: PLANNING_RUN_TASK_ID,
  queue: {
    name: 'planning-supply',
    concurrencyLimit: 2
  },
  maxDuration: 3_600,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
    randomize: true
  },
  run: async (payload: PlanningTaskPayload, { ctx, signal }) => {
    const input = normalizePlanningTaskPayload(payload);
    const pool = createPlanningPool();
    try {
      await updateWorkflowRun(pool, input, 'running', undefined, undefined, ctx.attempt.number);
      const output = await new PlanningOrchestrator(pool).run({
        ...input,
        attempt: ctx.attempt.number,
        signal,
        triggerRunId: ctx.run.id
      });
      await updateWorkflowRun(pool, input, 'succeeded', output);
      return output;
    } catch (error) {
      if (signal.aborted || isPlanningCanceled(error)) {
        await updateWorkflowRun(pool, input, 'canceled').catch(() => undefined);
        throw new PlanningCanceledError();
      }
      throw error;
    } finally {
      await pool.end();
    }
  },
  catchError: ({ error }) => {
    if (isNonRetryablePlanningError(error)) return { skipRetrying: true };
    return undefined;
  },
  onFailure: async ({ payload, error }) => {
    await withPayloadPool(payload, async (pool, input) => {
      await markPlanningRunFailed({
        accountId: input.accountId,
        error,
        planVersionId: input.planVersionId,
        pool,
        runId: input.runId
      });
      await updateWorkflowRun(pool, input, 'failed', undefined, error);
    });
  },
  onCancel: async ({ payload }) => {
    await withPayloadPool(payload, async (pool, input) => {
      await new PlanningRunRepository(pool).finishCanceled(
        input.accountId,
        input.runId,
        input.planVersionId
      );
      await updateWorkflowRun(pool, input, 'canceled');
    });
  }
});

export function normalizePlanningTaskPayload(
  payload: PlanningTaskPayload
): NormalizedPlanningTaskPayload {
  const accountId = requiredUuid(payload.accountId ?? payload.tenantId, 'accountId');
  const runId = requiredUuid(payload.runId, 'runId');
  const scenarioId = requiredUuid(
    payload.scenarioId ?? payload.planningScenarioId,
    'scenarioId'
  );
  const planVersionId = optionalUuid(payload.planVersionId, 'planVersionId');
  const jobType = String(payload.jobType ?? payload.planningJobType ?? 'supply_plan').trim();
  if (jobType !== 'supply_plan') {
    throw new PlanningTaskPayloadError(`Unsupported planning job type: ${jobType || '(empty)'}.`);
  }
  if (payload.overrides !== undefined && !isRecord(payload.overrides)) {
    throw new PlanningTaskPayloadError('overrides must be a JSON object.');
  }
  return {
    accountId,
    jobType,
    overrides: payload.overrides,
    planVersionId,
    runId,
    scenarioId
  };
}

async function withPayloadPool(
  payload: PlanningTaskPayload,
  operation: (pool: Pool, input: NormalizedPlanningTaskPayload) => Promise<void>
) {
  let input: NormalizedPlanningTaskPayload;
  try {
    input = normalizePlanningTaskPayload(payload);
  } catch {
    return;
  }
  const pool = createPlanningPool();
  try {
    await operation(pool, input);
  } finally {
    await pool.end();
  }
}

export async function updateWorkflowRun(
  pool: Pool,
  input: NormalizedPlanningTaskPayload,
  status: 'running' | 'succeeded' | 'failed' | 'canceled',
  output?: Record<string, unknown>,
  error?: unknown,
  attempt = 1
) {
  if (status === 'running') {
    await pool.query(
      `update public.wf_job_run
       set status = 'running', started_at = coalesce(started_at, timezone('utc', now())),
           attempt = greatest(attempt, $3)
       where account_id = $1 and id = $2 and status in ('queued', 'running')`,
      [input.accountId, input.runId, Math.max(1, Math.trunc(attempt))]
    );
    return;
  }
  await pool.query(
    `update public.wf_job_run
     set status = $3, output = coalesce($4::jsonb, output),
         error_message = $5, finished_at = timezone('utc', now())
     where account_id = $1 and id = $2 and status in ('queued', 'running')`,
    [
      input.accountId,
      input.runId,
      status,
      output ? JSON.stringify(output) : null,
      error instanceof Error ? error.message.slice(0, 4_000) : error ? String(error).slice(0, 4_000) : null
    ]
  );
}

export function isNonRetryablePlanningError(error: unknown) {
  return isPlanningCanceled(error) ||
    error instanceof PlanningTaskPayloadError ||
    error instanceof PlanningPreflightError ||
    error instanceof PlanningEngineResultValidationError ||
    error instanceof PlanningResultValidationError;
}

function requiredUuid(value: unknown, field: string) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    throw new PlanningTaskPayloadError(`${field} must be a UUID.`);
  }
  return value.trim();
}

function optionalUuid(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredUuid(value, field);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
