import {
  WORKFLOW_INSTANCE_TASK_ID,
  createStandalonePostgresWorkflowRuntimeStore,
  executeWorkflowInstance
} from "../../../../chunk-AE6AYCXE.mjs";
import "../../../../chunk-WPHH574V.mjs";
import {
  task,
  tasks,
  wait
} from "../../../../chunk-GHOZPYU7.mjs";
import "../../../../chunk-GIEEPZH6.mjs";
import "../../../../chunk-KQB4ZEQA.mjs";
import "../../../../chunk-FZVUONJ4.mjs";
import "../../../../chunk-DCZJKOR4.mjs";
import "../../../../chunk-OVVJCK53.mjs";
import {
  __name,
  init_esm
} from "../../../../chunk-65XIAWWW.mjs";

// src/trigger/workflow-instance.task.ts
init_esm();
var workflowInstanceTask = task({
  id: WORKFLOW_INSTANCE_TASK_ID,
  run: /* @__PURE__ */ __name(async (payload) => {
    const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DIRECT_URL or DATABASE_URL is required by the Trigger.dev workflow task.");
    }
    const runtime = createStandalonePostgresWorkflowRuntimeStore(connectionString);
    const waits = {
      createToken: /* @__PURE__ */ __name(async (options) => wait.createToken(options), "createToken"),
      waitForToken: /* @__PURE__ */ __name(async (tokenId) => {
        const result = await wait.forToken(tokenId);
        if (!result.ok) throw result.error;
        return result.output;
      }, "waitForToken"),
      waitFor: /* @__PURE__ */ __name(async ({ seconds, idempotencyKey }) => {
        await wait.for({ seconds, idempotencyKey });
      }, "waitFor"),
      waitUntil: /* @__PURE__ */ __name(async ({ date, idempotencyKey }) => {
        await wait.until({ date, idempotencyKey });
      }, "waitUntil"),
      triggerTask: /* @__PURE__ */ __name(async (taskId, taskPayload, options) => {
        await tasks.trigger(taskId, taskPayload, options);
      }, "triggerTask")
    };
    try {
      return await executeWorkflowInstance(payload, runtime.store, waits);
    } finally {
      await runtime.close();
    }
  }, "run")
});
export {
  workflowInstanceTask
};
//# sourceMappingURL=workflow-instance.task.mjs.map
