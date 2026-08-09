import type { Pool, PoolClient } from 'pg';
import {
  PlanningCanceledError,
  type PlanningProgressUpdate,
  type PlanningRunOutput
} from './planning-execution.types';

const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

export type PlanningRunState = {
  output?: PlanningRunOutput;
  planVersionId: string;
  runStatus: string;
  versionStatus: string;
};

export class PlanningRunRepository {
  constructor(private readonly pool: Pool) {}

  async start(options: {
    accountId: string;
    attempt?: number;
    planVersionId?: string;
    runId: string;
    triggerRunId?: string;
  }): Promise<PlanningRunState> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const state = await lockPlanningRunState(
        client,
        options.accountId,
        options.runId,
        options.planVersionId
      );
      if (state.runStatus === 'canceled' || state.versionStatus === 'canceled') {
        throw new PlanningCanceledError();
      }
      if (TERMINAL_RUN_STATUSES.has(state.runStatus)) {
        await client.query('commit');
        return state;
      }
      await client.query(
        `update public.planning_run
         set status = 'running', started = coalesce(started, timezone('utc', now())),
             trigger_run_id = coalesce($3, trigger_run_id), attempt = greatest(attempt, $4),
             message = '正在装载计划输入', progress = greatest(progress, 5),
             updated_at = timezone('utc', now())
         where account_id = $1 and id = $2 and status in ('queued', 'running')`,
        [options.accountId, options.runId, options.triggerRunId ?? null, options.attempt ?? 1]
      );
      await client.query(`select set_config('planning.system_version_write', 'on', true)`);
      await client.query(
        `update public.planning_plan_version
         set status = 'running', started_at = coalesce(started_at, timezone('utc', now())),
             updated_at = timezone('utc', now())
         where account_id = $1 and id = $2 and status = 'draft'`,
        [options.accountId, state.planVersionId]
      );
      await client.query('commit');
      return { ...state, runStatus: 'running', versionStatus: 'running' };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async progress(accountId: string, runId: string, update: PlanningProgressUpdate) {
    const result = await this.pool.query<{ status: string }>(
      `update public.planning_run
       set progress = greatest(progress, $3), message = $4,
           processid = coalesce($5, processid), logfile = coalesce($6, logfile),
           updated_at = timezone('utc', now())
       where account_id = $1 and id = $2 and status in ('queued', 'running')
       returning status`,
      [
        accountId,
        runId,
        Math.max(0, Math.min(99, Math.trunc(update.progress))),
        update.message,
        update.processId ?? null,
        update.logfile ?? null
      ]
    );
    if (!result.rows.length) await this.assertNotCanceled(accountId, runId);
  }

  async assertNotCanceled(accountId: string, runId: string) {
    const result = await this.pool.query<{ status: string }>(
      `select status from public.planning_run where account_id = $1 and id = $2`,
      [accountId, runId]
    );
    const status = result.rows[0]?.status;
    if (!status) throw new Error('Planning run not found.');
    if (status === 'canceled') throw new PlanningCanceledError();
    return status;
  }

  async finishCanceled(accountId: string, runId: string, planVersionId?: string) {
    await this.finishTerminal(accountId, runId, planVersionId, 'canceled', '排产已取消');
  }

  async finishFailed(
    accountId: string,
    runId: string,
    planVersionId: string | undefined,
    message: string
  ) {
    await this.finishTerminal(accountId, runId, planVersionId, 'failed', message);
  }

  private async finishTerminal(
    accountId: string,
    runId: string,
    planVersionId: string | undefined,
    status: 'failed' | 'canceled',
    message: string
  ) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const state = await lockPlanningRunState(client, accountId, runId, planVersionId);
      if (TERMINAL_RUN_STATUSES.has(state.runStatus)) {
        await client.query('commit');
        return;
      }
      await client.query(
        `update public.planning_run
         set status = $3, progress = 100, message = $4, processid = null,
             finished = timezone('utc', now()), updated_at = timezone('utc', now())
         where account_id = $1 and id = $2 and status in ('queued', 'running')`,
        [accountId, runId, status, message.slice(0, 4_000)]
      );
      await client.query(`select set_config('planning.system_version_write', 'on', true)`);
      await client.query(
        `update public.planning_plan_version
         set status = $3, completed_at = timezone('utc', now()),
             updated_at = timezone('utc', now())
         where account_id = $1 and id = $2 and status in ('draft', 'running')`,
        [accountId, state.planVersionId, status]
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export async function lockPlanningRunState(
  client: PoolClient,
  accountId: string,
  runId: string,
  requestedPlanVersionId?: string
): Promise<PlanningRunState> {
  const run = await client.query<{ output: PlanningRunOutput | null; status: string }>(
    `select status, output from public.planning_run
     where account_id = $1 and id = $2 for update`,
    [accountId, runId]
  );
  if (!run.rows[0]) throw new Error('Planning run not found.');
  const version = await client.query<{ id: string; status: string }>(
    `select id, status from public.planning_plan_version
     where account_id = $1 and run_id = $2
       and ($3::uuid is null or id = $3::uuid)
     order by created_at desc limit 1 for update`,
    [accountId, runId, requestedPlanVersionId ?? null]
  );
  if (!version.rows[0]) throw new Error('Plan version not found for planning run.');
  return {
    output: run.rows[0].output ?? undefined,
    planVersionId: version.rows[0].id,
    runStatus: run.rows[0].status,
    versionStatus: version.rows[0].status
  };
}
