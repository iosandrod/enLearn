import {
  WORKFLOW_INSTANCE_TASK_ID
} from "../../../../chunk-CE3CATGV.mjs";
import {
  TriggerCredentialsService
} from "../../../../chunk-72MJWDI7.mjs";
import {
  require_common
} from "../../../../chunk-GYQGVJTL.mjs";
import "../../../../chunk-OV5RCJTK.mjs";
import {
  runs,
  schedules_exports,
  tasks,
  wait
} from "../../../../chunk-ELK4KT3A.mjs";
import "../../../../chunk-JAUVKWWZ.mjs";
import "../../../../chunk-RD3PYEXF.mjs";
import "../../../../chunk-3YJ5QEIB.mjs";
import "../../../../chunk-LL72OHMD.mjs";
import "../../../../chunk-4N4XZL7H.mjs";
import "../../../../chunk-TDNREOVY.mjs";
import {
  __decorateClass,
  __decorateParam,
  __name,
  __toESM,
  init_esm
} from "../../../../chunk-VDUEJNM7.mjs";

// src/workflow/trigger/trigger-dev.client.ts
init_esm();
var import_common = __toESM(require_common());
var TriggerDevClient = class {
  constructor(credentials) {
    this.credentials = credentials;
  }
  async triggerWorkflow(payload) {
    return this.withTriggerCredentials(
      () => tasks.trigger(WORKFLOW_INSTANCE_TASK_ID, payload, {
        idempotencyKey: `workflow-instance:${payload.instanceId}`,
        tags: [
          `tenant:${payload.tenantId}`,
          `workflow-instance:${payload.instanceId}`,
          `definition:${payload.definitionId}`
        ]
      })
    );
  }
  async triggerTask(taskId, payload, options = {}) {
    return this.withTriggerCredentials(() => tasks.trigger(taskId, payload, options));
  }
  async createWaitpoint(options) {
    return this.withTriggerCredentials(() => wait.createToken(options));
  }
  async completeWaitpoint(tokenId, decision) {
    await this.withTriggerCredentials(() => this.completeTriggerWaitpoint(tokenId, decision));
  }
  async cancelRun(runId) {
    await this.withTriggerCredentials(() => runs.cancel(runId));
  }
  async createSchedule(options) {
    return this.withTriggerCredentials(() => schedules_exports.create(options));
  }
  async updateSchedule(scheduleId, options) {
    return this.withTriggerCredentials(() => schedules_exports.update(scheduleId, options));
  }
  async findScheduleByDeduplicationKey(deduplicationKey) {
    return this.withTriggerCredentials(async () => {
      for await (const schedule of schedules_exports.list()) {
        if (schedule.deduplicationKey === deduplicationKey) return schedule;
      }
      throw new Error(`Trigger.dev schedule not found for deduplication key ${deduplicationKey}.`);
    });
  }
  async activateSchedule(scheduleId) {
    return this.withTriggerCredentials(() => schedules_exports.activate(scheduleId));
  }
  async deactivateSchedule(scheduleId) {
    return this.withTriggerCredentials(() => schedules_exports.deactivate(scheduleId));
  }
  async deleteSchedule(scheduleId) {
    return this.withTriggerCredentials(() => schedules_exports.del(scheduleId));
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
    } catch {
      await wait.completeToken(tokenId, decision);
    }
  }
  async withTriggerCredentials(operation) {
    await this.credentials.configureSdk();
    try {
      return await operation();
    } catch (error) {
      if (!isTriggerAuthenticationError(error)) throw error;
      this.credentials.invalidate();
      await this.credentials.configureSdk(true);
      return operation();
    }
  }
};
__name(TriggerDevClient, "TriggerDevClient");
TriggerDevClient = __decorateClass([
  (0, import_common.Injectable)(),
  __decorateParam(0, (0, import_common.Inject)(TriggerCredentialsService))
], TriggerDevClient);
function isTriggerAuthenticationError(error) {
  if (typeof error !== "object" || error === null) return false;
  const typedError = error;
  const status = typedError.status ?? typedError.statusCode ?? typedError.response?.status;
  return status === 401 || status === 403;
}
__name(isTriggerAuthenticationError, "isTriggerAuthenticationError");
export {
  TriggerDevClient
};
//# sourceMappingURL=trigger-dev.client.mjs.map
