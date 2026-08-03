import {
  task,
  wait
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

// src/workflow/trigger/waitpoint-diagnostic.task.ts
init_esm();
var TRIGGER_WAITPOINT_DIAGNOSTIC_TASK_ID = "trigger-waitpoint-diagnostic";
var waitpointDiagnosticTask = task({
  id: TRIGGER_WAITPOINT_DIAGNOSTIC_TASK_ID,
  run: /* @__PURE__ */ __name(async (payload) => {
    const result = await wait.forToken(payload.tokenId);
    if (!result.ok) throw result.error;
    return {
      testId: payload.testId,
      tokenId: payload.tokenId,
      data: result.output
    };
  }, "run")
});
export {
  TRIGGER_WAITPOINT_DIAGNOSTIC_TASK_ID,
  waitpointDiagnosticTask
};
//# sourceMappingURL=waitpoint-diagnostic.task.mjs.map
