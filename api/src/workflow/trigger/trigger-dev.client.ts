import { Inject, Injectable } from '@nestjs/common';
import { runs, schedules, tasks, wait } from '@trigger.dev/sdk';
import type {
  WorkflowInstanceTaskPayload,
  WorkflowTaskDecision,
  WorkflowTriggerClient
} from '../runtime/runtime.engine.types';
import {
  WORKFLOW_INSTANCE_TASK_ID
} from '../runtime/runtime.engine.types';
import type { workflowInstanceTask } from './workflow-instance.task';
import { TriggerCredentialsService } from './trigger-credentials.service';

@Injectable()
export class TriggerDevClient implements WorkflowTriggerClient {
  constructor(
    @Inject(TriggerCredentialsService)
    private readonly credentials: TriggerCredentialsService
  ) {}

  async triggerWorkflow(payload: WorkflowInstanceTaskPayload) {
    return this.withTriggerCredentials(() =>
      tasks.trigger<typeof workflowInstanceTask>(WORKFLOW_INSTANCE_TASK_ID, payload, {
        idempotencyKey: `workflow-instance:${payload.instanceId}`,
        tags: [
          `tenant:${payload.tenantId}`,
          `workflow-instance:${payload.instanceId}`,
          `definition:${payload.definitionId}`
        ]
      })
    );
  }

  async triggerTask(
    taskId: string,
    payload: Record<string, unknown>,
    options: Record<string, unknown> = {}
  ) {
    return this.withTriggerCredentials(() => tasks.trigger(taskId, payload, options));
  }

  async createWaitpoint(options: { idempotencyKey: string; tags: string[] }) {
    return this.withTriggerCredentials(() => wait.createToken(options));
  }

  async completeWaitpoint(tokenId: string, decision: WorkflowTaskDecision) {
    await this.withTriggerCredentials(() => this.completeTriggerWaitpoint(tokenId, decision));
  }

  async cancelRun(runId: string) {
    await this.withTriggerCredentials(() => runs.cancel(runId));
  }

  async createSchedule(options: {
    task: string;
    cron: string;
    timezone?: string;
    externalId?: string;
    deduplicationKey: string;
  }) {
    return this.withTriggerCredentials(() => schedules.create(options));
  }

  async updateSchedule(
    scheduleId: string,
    options: { task: string; cron: string; timezone?: string; externalId?: string }
  ) {
    return this.withTriggerCredentials(() => schedules.update(scheduleId, options));
  }

  async findScheduleByDeduplicationKey(deduplicationKey: string) {
    return this.withTriggerCredentials(async () => {
      for await (const schedule of schedules.list()) {
        if (schedule.deduplicationKey === deduplicationKey) return schedule;
      }
      throw new Error(`Trigger.dev schedule not found for deduplication key ${deduplicationKey}.`);
    });
  }

  async activateSchedule(scheduleId: string) {
    return this.withTriggerCredentials(() => schedules.activate(scheduleId));
  }

  async deactivateSchedule(scheduleId: string) {
    return this.withTriggerCredentials(() => schedules.deactivate(scheduleId));
  }

  async deleteSchedule(scheduleId: string) {
    return this.withTriggerCredentials(() => schedules.del(scheduleId));
  }

  private async completeTriggerWaitpoint(tokenId: string, decision: WorkflowTaskDecision) {
    try {
      const token = await wait.retrieveToken<WorkflowTaskDecision>(tokenId);
      const response = await fetch(token.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
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

  private async withTriggerCredentials<T>(operation: () => Promise<T>): Promise<T> {
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
}

function isTriggerAuthenticationError(error: unknown) {
  if (typeof error !== 'object' || error === null) return false;
  const typedError = error as {
    response?: { status?: unknown };
    status?: unknown;
    statusCode?: unknown;
  };
  const status = typedError.status ?? typedError.statusCode ?? typedError.response?.status;
  return status === 401 || status === 403;
}
