import {
  task,
  wait
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

// src/trigger/waitpoint-diagnostic.task.ts
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
