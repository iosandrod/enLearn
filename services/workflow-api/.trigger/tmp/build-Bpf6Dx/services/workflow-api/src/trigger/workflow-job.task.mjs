import {
  Pool
} from "../../../../chunk-WPHH574V.mjs";
import {
  task
} from "../../../../chunk-XZEMTCXJ.mjs";
import "../../../../chunk-GIEEPZH6.mjs";
import "../../../../chunk-ESM3ZAKX.mjs";
import "../../../../chunk-PCODUAPY.mjs";
import "../../../../chunk-DCZJKOR4.mjs";
import "../../../../chunk-OVVJCK53.mjs";
import {
  __name,
  init_esm
} from "../../../../chunk-65XIAWWW.mjs";

// src/trigger/workflow-job.task.ts
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
