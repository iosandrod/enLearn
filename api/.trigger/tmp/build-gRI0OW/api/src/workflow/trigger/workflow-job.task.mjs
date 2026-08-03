import {
  Pool
} from "../../../../chunk-OV5RCJTK.mjs";
import {
  runs,
  schedules_exports,
  task,
  tasks
} from "../../../../chunk-ELK4KT3A.mjs";
import "../../../../chunk-JAUVKWWZ.mjs";
import "../../../../chunk-RD3PYEXF.mjs";
import "../../../../chunk-3YJ5QEIB.mjs";
import "../../../../chunk-LL72OHMD.mjs";
import "../../../../chunk-4N4XZL7H.mjs";
import {
  __name,
  init_esm
} from "../../../../chunk-VDUEJNM7.mjs";

// src/workflow/trigger/workflow-job.task.ts
init_esm();
var workflowGenericJobTask = task({
  id: "workflow.job.run",
  run: /* @__PURE__ */ __name(async (payload) => {
    const runId = typeof payload.runId === "string" ? payload.runId : void 0;
    const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
    if (!runId) {
      throw new Error("runId is required by workflow.job.run.");
    }
    if (!connectionString) {
      throw new Error("DIRECT_URL or DATABASE_URL is required by workflow.job.run.");
    }
    const pool = new Pool({ connectionString });
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
        handledBy: "workflow.job.run",
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
  }, "run")
});
var workflowSupabaseUsersLogTask = task({
  id: "workflow.supabase.users.log",
  run: /* @__PURE__ */ __name(async (payload) => {
    const runId = typeof payload.runId === "string" ? payload.runId : void 0;
    const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
    if (!runId) {
      throw new Error("runId is required by workflow.supabase.users.log.");
    }
    if (!connectionString) {
      throw new Error("DIRECT_URL or DATABASE_URL is required by workflow.supabase.users.log.");
    }
    const pool = new Pool({ connectionString });
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
      const result = await pool.query("select * from public.users limit $1", [limit]);
      const users = result.rows.map(sanitizeUserRow);
      const output = {
        handledBy: "workflow.supabase.users.log",
        runId,
        userCount: users.length,
        users,
        loggedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      console.log("[workflow-worker][supabase-users-log]", JSON.stringify(output, null, 2));
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
  }, "run")
});
var workflowScheduledJobTask = schedules_exports.task({
  id: "workflow.job.scheduled",
  run: /* @__PURE__ */ __name(async (payload) => {
    const jobId = payload.externalId;
    const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
    if (!jobId) {
      throw new Error("Schedule externalId is required by workflow.job.scheduled.");
    }
    if (!connectionString) {
      throw new Error("DIRECT_URL or DATABASE_URL is required by workflow.job.scheduled.");
    }
    const pool = new Pool({ connectionString });
    try {
      const jobResult = await pool.query(
        `select id, tenant_id, trigger_task_id, payload
        from public.wf_job
        where id = $1 and status = 'enabled'`,
        [jobId]
      );
      const job = jobResult.rows[0];
      if (!job) {
        return { skipped: true, jobId, reason: "Job is missing or disabled." };
      }
      const runResult = await pool.query(
        `insert into public.wf_job_run (tenant_id, job_id, status, attempt, input)
        values ($1, $2, 'queued', 1, $3::jsonb)
        returning id`,
        [
          job.tenant_id,
          job.id,
          JSON.stringify({
            ...job.payload ?? {},
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
        ...job.payload ?? {},
        jobId: job.id,
        tenantId: job.tenant_id,
        runId,
        scheduled: true,
        scheduleId: payload.scheduleId,
        scheduledAt: payload.timestamp.toISOString()
      };
      let handle;
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
  }, "run")
});
var workflowLegacyTimerTask = task({
  id: "workflow.timer.fire",
  run: /* @__PURE__ */ __name(async (payload) => ({
    handledBy: "workflow.timer.fire",
    deprecated: true,
    message: "Workflow timer nodes are now executed inside workflow.instance.run with Trigger.dev wait APIs.",
    payload
  }), "run")
});
function readPositiveInteger(value, fallback) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}
__name(readPositiveInteger, "readPositiveInteger");
function sanitizeUserRow(row) {
  const blockedKeys = /* @__PURE__ */ new Set([
    "billing_address",
    "payment_method",
    "stripe_customer_id",
    "encrypted_password",
    "confirmation_token",
    "recovery_token"
  ]);
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !blockedKeys.has(key)).map(([key, value]) => [key, key === "phone" ? maskPhone(value) : value])
  );
}
__name(sanitizeUserRow, "sanitizeUserRow");
function maskPhone(value) {
  if (typeof value !== "string" || value.length < 7) return value;
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}
__name(maskPhone, "maskPhone");
async function markJobRunFailedBestEffort(pool, runId, error) {
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
__name(markJobRunFailedBestEffort, "markJobRunFailedBestEffort");
async function cancelRunAfterProjectionFailure(runId) {
  try {
    await runs.cancel(runId);
  } catch {
    return;
  }
}
__name(cancelRunAfterProjectionFailure, "cancelRunAfterProjectionFailure");
export {
  workflowGenericJobTask,
  workflowLegacyTimerTask,
  workflowScheduledJobTask,
  workflowSupabaseUsersLogTask
};
//# sourceMappingURL=workflow-job.task.mjs.map
