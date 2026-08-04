import { runs, schedules, task, tasks } from '@trigger.dev/sdk';
import { type Pool } from 'pg';
import {
  createWorkflowPostgresPool,
  resolveWorkflowDatabaseUrl
} from '../common/postgres-pool';

export const workflowGenericJobTask = task({
  id: 'workflow.job.run',
  run: async (payload: Record<string, unknown>) => {
    const runId = typeof payload.runId === 'string' ? payload.runId : undefined;
    if (!runId) {
      throw new Error('runId is required by workflow.job.run.');
    }

    const pool = createJobPool('workflow.job.run');
    let started = false;
    try {
      await pool.query(
        `update public.wf_job_run
        set status = 'running', started_at = coalesce(started_at, timezone('utc'::text, now()))
        where id = $1`,
        [runId]
      );
      started = true;
      const output = {
        handledBy: 'workflow.job.run',
        payload
      };
      await pool.query(
        `update public.wf_job_run
        set status = 'succeeded',
            output = $2::jsonb,
            finished_at = timezone('utc'::text, now())
        where id = $1`,
        [runId, JSON.stringify(output)]
      );
      return output;
    } catch (error) {
      if (started) await markJobRunFailedBestEffort(pool, runId, error);
      throw error;
    } finally {
      await pool.end();
    }
  }
});

export const workflowSupabaseUsersLogTask = task({
  id: 'workflow.supabase.users.log',
  run: async (payload: Record<string, unknown>) => {
    const runId = typeof payload.runId === 'string' ? payload.runId : undefined;
    if (!runId) {
      throw new Error('runId is required by workflow.supabase.users.log.');
    }

    const pool = createJobPool('workflow.supabase.users.log');
    let started = false;
    try {
      await pool.query(
        `update public.wf_job_run
        set status = 'running', started_at = coalesce(started_at, timezone('utc'::text, now()))
        where id = $1`,
        [runId]
      );
      started = true;

      const limit = readPositiveInteger(payload.limit, 20);
      const result = await pool.query('select * from public.users limit $1', [limit]);
      const users = result.rows.map(sanitizeUserRow);
      const output = {
        handledBy: 'workflow.supabase.users.log',
        runId,
        userCount: users.length,
        users,
        loggedAt: new Date().toISOString()
      };
      console.log('[workflow-worker][supabase-users-log]', JSON.stringify(output, null, 2));

      await pool.query(
        `update public.wf_job_run
        set status = 'succeeded',
            output = $2::jsonb,
            finished_at = timezone('utc'::text, now())
        where id = $1`,
        [runId, JSON.stringify(output)]
      );
      return output;
    } catch (error) {
      if (started) await markJobRunFailedBestEffort(pool, runId, error);
      throw error;
    } finally {
      await pool.end();
    }
  }
});

export const workflowScheduledJobTask = schedules.task({
  id: 'workflow.job.scheduled',
  run: async (payload) => {
    const jobId = payload.externalId;
    if (!jobId) {
      throw new Error('Schedule externalId is required by workflow.job.scheduled.');
    }

    const pool = createJobPool('workflow.job.scheduled');
    try {
      const jobResult = await pool.query<{
        id: string;
        tenant_id: string;
        trigger_task_id: string;
        payload: Record<string, unknown>;
      }>(
        `select id, tenant_id, trigger_task_id, payload
        from public.wf_job
        where id = $1 and status = 'enabled'`,
        [jobId]
      );
      const job = jobResult.rows[0];
      if (!job) {
        return { skipped: true, jobId, reason: 'Job is missing or disabled.' };
      }

      const runResult = await pool.query<{ id: string }>(
        `insert into public.wf_job_run (tenant_id, job_id, status, attempt, input)
        values ($1, $2, 'queued', 1, $3::jsonb)
        returning id`,
        [
          job.tenant_id,
          job.id,
          JSON.stringify({
            ...(job.payload ?? {}),
            jobId: job.id,
            tenantId: job.tenant_id,
            scheduled: true,
            scheduleId: payload.scheduleId,
            scheduledAt: payload.timestamp.toISOString()
          })
        ]
      );
      const runId = runResult.rows[0].id;
      const triggerPayload = {
        ...(job.payload ?? {}),
        jobId: job.id,
        tenantId: job.tenant_id,
        runId,
        scheduled: true,
        scheduleId: payload.scheduleId,
        scheduledAt: payload.timestamp.toISOString()
      };
      let handle: { id: string };
      try {
        handle = await tasks.trigger(job.trigger_task_id, triggerPayload, {
          idempotencyKey: `workflow-job-run:${runId}`,
          tags: [
            `tenant:${job.tenant_id}`,
            `workflow-job:${job.id}`,
            `workflow-job-run:${runId}`
          ]
        });
      } catch (error) {
        await markJobRunFailedBestEffort(pool, runId, error);
        throw error;
      }

      try {
        await pool.query(
          `update public.wf_job_run set trigger_run_id = $2 where id = $1`,
          [runId, handle.id]
        );
      } catch (error) {
        await cancelRunAfterProjectionFailure(handle.id);
        await markJobRunFailedBestEffort(pool, runId, error);
        throw error;
      }
      return { jobId: job.id, runId, triggerRunId: handle.id };
    } finally {
      await pool.end();
    }
  }
});

export const workflowLegacyTimerTask = task({
  id: 'workflow.timer.fire',
  run: async (payload: Record<string, unknown>) => ({
    handledBy: 'workflow.timer.fire',
    deprecated: true,
    message: 'Workflow timer nodes are now executed inside workflow.instance.run with Trigger.dev wait APIs.',
    payload
  })
});

function readPositiveInteger(value: unknown, fallback: number) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function sanitizeUserRow(row: Record<string, unknown>) {
  const blockedKeys = new Set([
    'billing_address',
    'payment_method',
    'stripe_customer_id',
    'encrypted_password',
    'confirmation_token',
    'recovery_token'
  ]);

  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => !blockedKeys.has(key))
      .map(([key, value]) => [key, key === 'phone' ? maskPhone(value) : value])
  );
}

function maskPhone(value: unknown) {
  if (typeof value !== 'string' || value.length < 7) return value;
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

function createJobPool(taskName: string) {
  const connectionString = resolveWorkflowDatabaseUrl(process.env);
  if (!connectionString) {
    throw new Error(`DATABASE_URL or DIRECT_URL is required by ${taskName}.`);
  }
  return createWorkflowPostgresPool(connectionString, {
    max: 2,
    name: taskName
  });
}

async function markJobRunFailedBestEffort(pool: Pool, runId: string, error: unknown) {
  try {
    await pool.query(
      `update public.wf_job_run
      set status = 'failed',
          error_message = $2,
          finished_at = timezone('utc'::text, now())
      where id = $1`,
      [runId, error instanceof Error ? error.message : String(error)]
    );
  } catch {
    return;
  }
}

async function cancelRunAfterProjectionFailure(runId: string) {
  try {
    await runs.cancel(runId);
  } catch {
    return;
  }
}
