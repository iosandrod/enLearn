import {
  Pool
} from "../../../../chunk-OV5RCJTK.mjs";
import {
  task
} from "../../../../chunk-MOVKRYJB.mjs";
import "../../../../chunk-JAUVKWWZ.mjs";
import "../../../../chunk-7MUO7GIY.mjs";
import "../../../../chunk-AXZGSJVN.mjs";
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
    if (!runId || !connectionString) {
      return {
        handledBy: "workflow.job.run",
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
export {
  workflowGenericJobTask,
  workflowLegacyTimerTask
};
//# sourceMappingURL=workflow-job.task.mjs.map
