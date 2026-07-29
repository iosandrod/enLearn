import {
  NOTIFICATION_DISPATCH_TASK_ID,
  getWorkflowEnv,
  runLocalNotificationDispatchTask
} from "../../../../chunk-WTIETCDT.mjs";
import {
  WORKFLOW_INSTANCE_TASK_ID,
  createStandalonePostgresWorkflowRuntimeStore,
  executeWorkflowInstance,
  require_common
} from "../../../../chunk-AE6AYCXE.mjs";
import "../../../../chunk-WPHH574V.mjs";
import {
  runs,
  tasks,
  wait
} from "../../../../chunk-XZEMTCXJ.mjs";
import "../../../../chunk-GIEEPZH6.mjs";
import "../../../../chunk-ESM3ZAKX.mjs";
import "../../../../chunk-PCODUAPY.mjs";
import "../../../../chunk-DCZJKOR4.mjs";
import "../../../../chunk-OVVJCK53.mjs";
import {
  __decorateClass,
  __name,
  __toESM,
  init_esm
} from "../../../../chunk-65XIAWWW.mjs";

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
    try {
      return await tasks.trigger(
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
    } catch (error) {
      if (!this.canFallbackToLocalRunner(error)) throw error;
      this.logger.warn(
        `Trigger.dev workflow trigger failed, using local runner: ${errorMessage(error)}`
      );
      return this.triggerLocalWorkflow(payload);
    }
  }
  async triggerTask(taskId, payload, options = {}) {
    if (!this.useTriggerDev()) {
      this.assertLocalFallbackEnabled();
      return this.triggerLocalTask(taskId, payload);
    }
    try {
      return await tasks.trigger(taskId, payload, options);
    } catch (error) {
      if (!this.canFallbackToLocalRunner(error)) throw error;
      this.logger.warn(
        `Trigger.dev task "${taskId}" failed, using local task fallback: ${errorMessage(error)}`
      );
      return this.triggerLocalTask(taskId, payload);
    }
  }
  async createWaitpoint(options) {
    if (!this.useTriggerDev()) {
      this.assertLocalFallbackEnabled();
      return this.createToken(options);
    }
    try {
      return await wait.createToken(options);
    } catch (error) {
      if (!this.canFallbackToLocalRunner(error)) throw error;
      this.logger.warn(
        `Trigger.dev waitpoint creation failed, using local token: ${errorMessage(error)}`
      );
      return this.createToken(options);
    }
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
    if (!this.useTriggerDev() || this.isLocalWaitpointToken(tokenId)) {
      this.assertLocalFallbackEnabled();
      const waiter = this.tokenWaiters.get(tokenId);
      if (!waiter) {
        throw new Error(`Local workflow waitpoint "${tokenId}" is not active.`);
      }
      waiter.resolve(decision);
      return;
    }
    try {
      await this.completeTriggerWaitpoint(tokenId, decision);
    } catch (error) {
      if (!this.canFallbackToLocalRunner(error)) throw error;
      const waiter = this.tokenWaiters.get(tokenId);
      if (!waiter) throw error;
      this.logger.warn(
        `Trigger.dev waitpoint completion failed, using local token: ${errorMessage(error)}`
      );
      waiter.resolve(decision);
    }
  }
  async cancelRun(runId) {
    if (!this.useTriggerDev() || this.isLocalWorkflowRun(runId)) {
      return;
    }
    await runs.cancel(runId);
  }
  useTriggerDev() {
    return Boolean(getWorkflowEnv().TRIGGER_SECRET_KEY?.trim());
  }
  assertLocalFallbackEnabled() {
    const enabled = this.isLocalFallbackEnabled();
    if (!enabled) {
      throw new Error(
        "Trigger.dev is required for workflow execution. Set TRIGGER_SECRET_KEY or explicitly enable WORKFLOW_TRIGGER_LOCAL_FALLBACK_ENABLED=true."
      );
    }
  }
  canFallbackToLocalRunner(error) {
    return this.isLocalFallbackEnabled() && isTriggerConnectionError(error);
  }
  isLocalFallbackEnabled() {
    return getWorkflowEnv().WORKFLOW_TRIGGER_LOCAL_FALLBACK_ENABLED === "true";
  }
  isLocalWorkflowRun(runId) {
    return runId.startsWith("local-workflow-");
  }
  isLocalWaitpointToken(tokenId) {
    return tokenId.startsWith("local-waitpoint-");
  }
  triggerLocalWorkflow(payload) {
    const runId = `local-workflow-${randomUUID()}`;
    const connectionString = getWorkflowEnv().DIRECT_URL ?? getWorkflowEnv().DATABASE_URL;
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
  async completeTriggerWaitpoint(tokenId, decision) {
    try {
      const token = await wait.retrieveToken(tokenId);
      const response = await fetch(token.url, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(decision)
      });
      if (!response.ok) {
        throw new Error(`Trigger.dev waitpoint callback failed with HTTP ${response.status}.`);
      }
      return;
    } catch (error) {
      this.logger.warn(
        `Trigger.dev waitpoint callback failed, using completeToken: ${errorMessage(error)}`
      );
    }
    await wait.completeToken(tokenId, decision);
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
function isTriggerConnectionError(error) {
  const message = errorMessage(error).toLowerCase();
  return message.includes("connection error") || message.includes("fetch failed") || message.includes("econnrefused");
}
__name(isTriggerConnectionError, "isTriggerConnectionError");
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
__name(errorMessage, "errorMessage");
export {
  TriggerDevClient
};
//# sourceMappingURL=trigger-dev.client.mjs.map
