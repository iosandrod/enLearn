import { runs, schedules, task, tasks } from '@trigger.dev/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../../common/utils/env';

const WORKFLOW_JOB_RPC = 'workflow_job_command';
type JsonRecord = Record<string, unknown>;

export const workflowGenericJobTask = task({
  id: 'workflow.job.run',
  run: async (payload: Record<string, unknown>) => {
    const runId = typeof payload.runId === 'string' ? payload.runId : undefined;
    if (!runId) {
      throw new Error('runId is required by workflow.job.run.');
    }

    const supabase = createWorkerSupabaseClient('workflow.job.run');
    let started = false;
    try {
      const running = await command(supabase, 'mark_run_running', { run_id: runId });
      if (!running) throw new Error('Workflow job run not found.');
      started = true;
      const output = {
        handledBy: 'workflow.job.run',
        payload
      };
      await command(supabase, 'finish_run', {
        run_id: runId,
        status: 'succeeded',
        output
      });
      return output;
    } catch (error) {
      if (started) await markJobRunFailedBestEffort(supabase, runId, error);
      throw error;
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

    const supabase = createWorkerSupabaseClient('workflow.supabase.users.log');
    let started = false;
    try {
      const running = await command(supabase, 'mark_run_running', { run_id: runId });
      if (!running) throw new Error('Workflow job run not found.');
      started = true;

      const limit = readPositiveInteger(payload.limit, 20);
      const result = await command(supabase, 'list_users', { limit });
      const users = readRecordArray(result).map(sanitizeUserRow);
      const output = {
        handledBy: 'workflow.supabase.users.log',
        runId,
        userCount: users.length,
        users,
        loggedAt: new Date().toISOString()
      };
      console.log('[workflow-worker][supabase-users-log]', JSON.stringify(output, null, 2));

      await command(supabase, 'finish_run', {
        run_id: runId,
        status: 'succeeded',
        output
      });
      return output;
    } catch (error) {
      if (started) await markJobRunFailedBestEffort(supabase, runId, error);
      throw error;
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

    const supabase = createWorkerSupabaseClient('workflow.job.scheduled');
    const scheduledAt = payload.timestamp.toISOString();
    const occurrenceKey = [jobId, payload.scheduleId, scheduledAt].join(':');
    const preparation = assertRecord(
      await command(supabase, 'prepare_scheduled_run', {
        job_id: jobId,
        schedule_id: payload.scheduleId,
        scheduled_at: scheduledAt,
        occurrence_key: occurrenceKey
      }),
      'Workflow scheduled-run RPC returned an invalid result.'
    );

    if (preparation.skipped === true) {
      return {
        skipped: true,
        jobId,
        reason: typeof preparation.reason === 'string'
          ? preparation.reason
          : 'Job is missing or disabled.'
      };
    }

    const job = assertRecord(preparation.job, 'Workflow scheduled-run RPC omitted the job.');
    const run = assertRecord(preparation.run, 'Workflow scheduled-run RPC omitted the run.');
    const runId = readRequiredString(run.id, 'run.id');
    const triggerRunId = typeof run.trigger_run_id === 'string' && run.trigger_run_id.trim()
      ? run.trigger_run_id.trim()
      : undefined;
    if (triggerRunId) {
      return { jobId, runId, triggerRunId, reused: true };
    }

    const triggerTaskId = readRequiredString(job.trigger_task_id, 'job.trigger_task_id');
    const accountId = readRequiredString(job.account_id, 'job.account_id');
    const triggerPayload = {
      ...assertRecord(
        preparation.triggerPayload,
        'Workflow scheduled-run RPC omitted the trigger payload.'
      ),
      runId
    };

    let handle: { id: string };
    try {
      handle = await tasks.trigger(triggerTaskId, triggerPayload, {
        idempotencyKey: `workflow-job-run:${runId}`,
        tags: [
          `tenant:${accountId}`,
          `workflow-job:${jobId}`,
          `workflow-job-run:${runId}`
        ]
      });
    } catch (error) {
      await markJobRunFailedBestEffort(supabase, runId, error);
      throw error;
    }

    try {
      const projected = await command(supabase, 'project_trigger_run', {
        account_id: accountId,
        run_id: runId,
        trigger_run_id: handle.id
      });
      if (!projected) throw new Error('Workflow job run not found while projecting Trigger run.');
    } catch (error) {
      await cancelRunAfterProjectionFailure(handle.id);
      await markJobRunFailedBestEffort(supabase, runId, error);
      throw error;
    }
    return { jobId, runId, triggerRunId: handle.id };
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

async function command(client: SupabaseClient, action: string, payload: JsonRecord) {
  const { data, error } = await client.rpc(WORKFLOW_JOB_RPC, {
    p_action: action,
    p_payload: payload
  });
  if (error) throw new Error(error.message);
  return data;
}

function readPositiveInteger(value: unknown, fallback: number) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, message: string) {
  if (!isRecord(value)) throw new Error(message);
  return value;
}

function readRecordArray(value: unknown) {
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error('Workflow users RPC returned an invalid list.');
  }
  return value;
}

function readRequiredString(value: unknown, name: string) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`Workflow job RPC response is missing ${name}.`);
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

function createWorkerSupabaseClient(taskName: string) {
  const env = getEnv();
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_PROJECT_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !serviceRoleKey?.trim()) {
    throw new Error(`SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required by ${taskName}.`);
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function markJobRunFailedBestEffort(
  client: SupabaseClient,
  runId: string,
  error: unknown
) {
  try {
    await command(client, 'finish_run', {
      run_id: runId,
      status: 'failed',
      output: {},
      error_message: error instanceof Error ? error.message : String(error)
    });
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
