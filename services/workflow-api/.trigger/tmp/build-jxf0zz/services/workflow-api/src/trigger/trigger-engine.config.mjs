import {
  getWorkflowEnv
} from "../../../../chunk-M6THF6GN.mjs";
import {
  __name,
  init_esm
} from "../../../../chunk-65XIAWWW.mjs";

// src/trigger/trigger-engine.config.ts
init_esm();
function getTriggerEngineStatus() {
  const env = getWorkflowEnv();
  const apiUrl = normalizedValue(env.TRIGGER_API_URL);
  const projectRef = normalizedValue(env.TRIGGER_PROJECT_REF);
  const secretKey = normalizedValue(env.TRIGGER_SECRET_KEY);
  const missing = [
    apiUrl ? void 0 : "TRIGGER_API_URL",
    projectRef ? void 0 : "TRIGGER_PROJECT_REF",
    secretKey ? void 0 : "TRIGGER_SECRET_KEY"
  ].filter((value) => Boolean(value));
  return {
    configured: missing.length === 0,
    apiUrl,
    projectRef,
    secretKeyConfigured: Boolean(secretKey),
    missing
  };
}
__name(getTriggerEngineStatus, "getTriggerEngineStatus");
function assertTriggerEngineConfigured() {
  const status = getTriggerEngineStatus();
  if (status.configured) {
    return;
  }
  throw new Error(
    `Trigger.dev engine is not configured. Missing ${status.missing.join(
      ", "
    )}. Run "pnpm triggerdev:bootstrap" from the enLearn repo.`
  );
}
__name(assertTriggerEngineConfigured, "assertTriggerEngineConfigured");
function normalizedValue(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
__name(normalizedValue, "normalizedValue");
export {
  assertTriggerEngineConfigured,
  getTriggerEngineStatus
};
//# sourceMappingURL=trigger-engine.config.mjs.map
