import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { runs, tasks, wait } from '@trigger.dev/sdk';
import { getWorkflowEnv } from '../common/env';
import { createStandalonePostgresWorkflowRuntimeStore } from '../runtime/runtime.postgres-store';
import type {
  WorkflowInstanceTaskPayload,
  WorkflowTaskDecision,
  WorkflowTriggerClient
} from '../runtime/runtime.engine.types';
import {
  WORKFLOW_INSTANCE_TASK_ID
} from '../runtime/runtime.engine.types';
import { executeWorkflowInstance, type WorkflowWaitDriver } from '../runtime/workflow.executor';
import {
  NOTIFICATION_DISPATCH_TASK_ID,
  runLocalNotificationDispatchTask
} from './notification.task';
import type { workflowInstanceTask } from './workflow-instance.task';

@Injectable()
export class TriggerDevClient implements WorkflowTriggerClient, WorkflowWaitDriver {
  private readonly logger = new Logger(TriggerDevClient.name);
  private readonly tokenIdsByKey = new Map<string, string>();
  private readonly tokenWaiters = new Map<
    string,
    {
      promise: Promise<WorkflowTaskDecision>;
      resolve: (decision: WorkflowTaskDecision) => void;
    }
  >();

  async triggerWorkflow(payload: WorkflowInstanceTaskPayload) {
    if (!this.useTriggerDev()) {
      this.assertLocalFallbackEnabled();
      return this.triggerLocalWorkflow(payload);
    }

    return tasks.trigger<typeof workflowInstanceTask>(
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

  async triggerTask(
    taskId: string,
    payload: Record<string, unknown>,
    options: Record<string, unknown> = {}
  ) {
    if (!this.useTriggerDev()) {
      this.assertLocalFallbackEnabled();
      return this.triggerLocalTask(taskId, payload);
    }

    return tasks.trigger(taskId, payload, options);
  }

  async createWaitpoint(options: { idempotencyKey: string; tags: string[] }) {
    if (!this.useTriggerDev()) {
      this.assertLocalFallbackEnabled();
      return this.createToken(options);
    }

    return wait.createToken(options);
  }

  async createToken(options: { idempotencyKey: string; tags: string[] }) {
    const existing = this.tokenIdsByKey.get(options.idempotencyKey);
    if (existing) return { id: existing };

    const id = `local-waitpoint-${randomUUID()}`;
    let resolve!: (decision: WorkflowTaskDecision) => void;
    const promise = new Promise<WorkflowTaskDecision>((nextResolve) => {
      resolve = nextResolve;
    });

    this.tokenIdsByKey.set(options.idempotencyKey, id);
    this.tokenWaiters.set(id, { promise, resolve });
    return { id };
  }

  async waitForToken<T>(tokenId: string) {
    const waiter = this.tokenWaiters.get(tokenId);
    if (!waiter) {
      throw new Error(`Local workflow waitpoint "${tokenId}" is not active.`);
    }
    return waiter.promise as Promise<T>;
  }

  async waitFor(input: { seconds: number; idempotencyKey: string }) {
    await delay(Math.max(0, input.seconds) * 1000);
  }

  async waitUntil(input: { date: Date; idempotencyKey: string }) {
    await delay(Math.max(0, input.date.getTime() - Date.now()));
  }

  async completeWaitpoint(tokenId: string, decision: WorkflowTaskDecision) {
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

  async cancelRun(runId: string) {
    if (!this.useTriggerDev()) {
      return;
    }

    await runs.cancel(runId);
  }

  private useTriggerDev() {
    return Boolean(getWorkflowEnv().TRIGGER_SECRET_KEY?.trim());
  }

  private assertLocalFallbackEnabled() {
    const enabled = getWorkflowEnv().WORKFLOW_TRIGGER_LOCAL_FALLBACK_ENABLED === 'true';
    if (!enabled) {
      throw new Error(
        'Trigger.dev is required for workflow execution. Set TRIGGER_SECRET_KEY or explicitly enable WORKFLOW_TRIGGER_LOCAL_FALLBACK_ENABLED=true.'
      );
    }
  }

  private triggerLocalWorkflow(payload: WorkflowInstanceTaskPayload) {
    const runId = `local-workflow-${randomUUID()}`;
    const connectionString = getWorkflowEnv().DATABASE_URL ?? getWorkflowEnv().DIRECT_URL;
    if (!connectionString) {
      throw new Error('DIRECT_URL or DATABASE_URL is required by the local workflow runner.');
    }

    const runtime = createStandalonePostgresWorkflowRuntimeStore(connectionString);
    void executeWorkflowInstance(payload, runtime.store, this)
      .catch(async (error) => {
        this.logger.error(
          `Local workflow run ${runId} failed: ${error instanceof Error ? error.message : String(error)}`
        );
        try {
          await runtime.store.setInstanceStatus(payload.instanceId, 'failed', {
            message: error instanceof Error ? error.message : String(error),
            phase: 'localWorkflow'
          });
        } catch (statusError) {
          this.logger.error(
            `Could not mark local workflow ${runId} as failed: ${
              statusError instanceof Error ? statusError.message : String(statusError)
            }`
          );
        }
      })
      .finally(() => {
        void runtime.close();
      });

    return { id: runId };
  }

  private async triggerLocalTask(taskId: string, payload: Record<string, unknown>) {
    if (taskId === NOTIFICATION_DISPATCH_TASK_ID) {
      await runLocalNotificationDispatchTask(
        payload as Parameters<typeof runLocalNotificationDispatchTask>[0]
      );
    } else {
      this.logger.warn(`Skipping unsupported local Trigger.dev task "${taskId}".`);
    }

    return { id: `local-task-${randomUUID()}` };
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
