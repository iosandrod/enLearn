import { task } from '@trigger.dev/sdk';
import { Pool } from 'pg';

export const workflowGenericJobTask = task({
  id: 'workflow.job.run',
  run: async (payload: Record<string, unknown>) => {
    const runId = typeof payload.runId === 'string' ? payload.runId : undefined;
    const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
    if (!runId || !connectionString) {
      return {
        handledBy: 'workflow.job.run',
        payload
      };
    }

    const pool = new Pool({ connectionString });
    try {
      await pool.query(
        `update public.wf_job_run
        set status = 'running', started_at = coalesce(started_at, timezone('utc'::text, now()))
        where id = $1`,
        [runId]
      );
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
      await pool.query(
        `update public.wf_job_run
        set status = 'failed',
            error_message = $2,
            finished_at = timezone('utc'::text, now())
        where id = $1`,
        [runId, error instanceof Error ? error.message : String(error)]
      );
      throw error;
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
