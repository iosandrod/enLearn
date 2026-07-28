import {
  NOTIFICATION_DISPATCH_TASK_ID,
  getWorkflowEnv,
  runLocalNotificationDispatchTask
} from "../../../../chunk-AJUMQSBK.mjs";
import {
  WORKFLOW_INSTANCE_TASK_ID,
  createStandalonePostgresWorkflowRuntimeStore,
  executeWorkflowInstance,
  require_common
} from "../../../../chunk-T3LGADJF.mjs";
import "../../../../chunk-AFSLSNMY.mjs";
import {
  runs,
  tasks,
  wait
} from "../../../../chunk-3DEPBX4X.mjs";
import "../../../../chunk-WTTQMZKM.mjs";
import "../../../../chunk-G4QPBQHR.mjs";
import "../../../../chunk-RDD7ZUEQ.mjs";
import "../../../../chunk-5XNG6EAY.mjs";
import "../../../../chunk-6RPNXJU4.mjs";
import {
  __decorateClass,
  __name,
  __toESM,
  init_esm
} from "../../../../chunk-74TBADPG.mjs";

// src/trigger/trigger-dev.client.ts
init_esm();
var import_common = __toESM(require_common());
import { randomUUID } from "node:crypto";
var TriggerDevClient = class {
  constructor() {
    this.logger = new import_common.Logger(TriggerDevClient.name);
    this.tokenIdsByKey = /* @__PURE__ */ new Map();
    this.tokenWaiters = /* @__PURE__ */ new Map();
  }
  async triggerWorkflow(payload) {
    if (!this.useTriggerDev()) {
      this.assertLocalFallbackEnabled();
      return this.triggerLocalWorkflow(payload);
    }
    return tasks.trigger(
      WORKFLOW_INSTANCE_TASK_ID,
      payload,
      {
        idempotencyKey: `workflow-instance:${payload.instanceId}`,
        tags: [
          `tenant:${payload.tenantId}`,
          `workflow-instance:${payload.instanceId}`,
          `definition:${payload.definitionId}`
        ]
      }
    );
  }
  async triggerTask(taskId, payload, options = {}) {
    if (!this.useTriggerDev()) {
      this.assertLocalFallbackEnabled();
      return this.triggerLocalTask(taskId, payload);
    }
    return tasks.trigger(taskId, payload, options);
  }
  async createWaitpoint(options) {
    if (!this.useTriggerDev()) {
      this.assertLocalFallbackEnabled();
      return this.createToken(options);
    }
    return wait.createToken(options);
  }
  async createToken(options) {
    const existing = this.tokenIdsByKey.get(options.idempotencyKey);
    if (existing) return { id: existing };
    const id = `local-waitpoint-${randomUUID()}`;
    let resolve;
    const promise = new Promise((nextResolve) => {
      resolve = nextResolve;
    });
    this.tokenIdsByKey.set(options.idempotencyKey, id);
    this.tokenWaiters.set(id, { promise, resolve });
    return { id };
  }
  async waitForToken(tokenId) {
    const waiter = this.tokenWaiters.get(tokenId);
    if (!waiter) {
      throw new Error(`Local workflow waitpoint "${tokenId}" is not active.`);
    }
    return waiter.promise;
  }
  async waitFor(input) {
    await delay(Math.max(0, input.seconds) * 1e3);
  }
  async waitUntil(input) {
    await delay(Math.max(0, input.date.getTime() - Date.now()));
  }
  async completeWaitpoint(tokenId, decision) {
    if (!this.useTriggerDev()) {
      this.assertLocalFallbackEnabled();
      const waiter = this.tokenWaiters.get(tokenId);
      if (!waiter) {
        throw new Error(`Local workflow waitpoint "${tokenId}" is not active.`);
      }
      waiter.resolve(decision);
      return;
    }
    await wait.completeToken(tokenId, decision);
  }
  async cancelRun(runId) {
    if (!this.useTriggerDev()) {
      return;
    }
    await runs.cancel(runId);
  }
  useTriggerDev() {
    return Boolean(getWorkflowEnv().TRIGGER_SECRET_KEY?.trim());
  }
  assertLocalFallbackEnabled() {
    const enabled = getWorkflowEnv().WORKFLOW_TRIGGER_LOCAL_FALLBACK_ENABLED === "true";
    if (!enabled) {
      throw new Error(
        "Trigger.dev is required for workflow execution. Set TRIGGER_SECRET_KEY or explicitly enable WORKFLOW_TRIGGER_LOCAL_FALLBACK_ENABLED=true."
      );
    }
  }
  triggerLocalWorkflow(payload) {
    const runId = `local-workflow-${randomUUID()}`;
    const connectionString = getWorkflowEnv().DATABASE_URL ?? getWorkflowEnv().DIRECT_URL;
    if (!connectionString) {
      throw new Error("DIRECT_URL or DATABASE_URL is required by the local workflow runner.");
    }
    const runtime = createStandalonePostgresWorkflowRuntimeStore(connectionString);
    void executeWorkflowInstance(payload, runtime.store, this).catch(async (error) => {
      this.logger.error(
        `Local workflow run ${runId} failed: ${error instanceof Error ? error.message : String(error)}`
      );
      try {
        await runtime.store.setInstanceStatus(payload.instanceId, "failed", {
          message: error instanceof Error ? error.message : String(error),
          phase: "localWorkflow"
        });
      } catch (statusError) {
        this.logger.error(
          `Could not mark local workflow ${runId} as failed: ${statusError instanceof Error ? statusError.message : String(statusError)}`
        );
      }
    }).finally(() => {
      void runtime.close();
    });
    return { id: runId };
  }
  async triggerLocalTask(taskId, payload) {
    if (taskId === NOTIFICATION_DISPATCH_TASK_ID) {
      await runLocalNotificationDispatchTask(
        payload
      );
    } else {
      this.logger.warn(`Skipping unsupported local Trigger.dev task "${taskId}".`);
    }
    return { id: `local-task-${randomUUID()}` };
  }
};
__name(TriggerDevClient, "TriggerDevClient");
TriggerDevClient = __decorateClass([
  (0, import_common.Injectable)()
], TriggerDevClient);
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
__name(delay, "delay");
export {
  TriggerDevClient
};
//# sourceMappingURL=trigger-dev.client.mjs.map
