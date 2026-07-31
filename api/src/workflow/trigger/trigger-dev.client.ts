import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { runs, tasks, wait } from '@trigger.dev/sdk';
import type {
  WorkflowInstanceTaskPayload,
  WorkflowRuntimeStore,
  WorkflowTaskDecision,
  WorkflowTriggerClient
} from '../runtime/runtime.engine.types';
import {
  WORKFLOW_INSTANCE_TASK_ID
} from '../runtime/runtime.engine.types';
import type { workflowInstanceTask } from './workflow-instance.task';
import { assertTriggerEngineConfigured } from './trigger-engine.config';
import {
  NOTIFICATION_DISPATCH_TASK_ID,
  runLocalNotificationDispatchTask
} from './notification.task';
import { executeWorkflowInstance, type WorkflowWaitDriver } from '../runtime/workflow.executor';

@Injectable()
export class TriggerDevClient implements WorkflowTriggerClient {
  private readonly localWaiters = new Map<
    string,
    {
      promise: Promise<WorkflowTaskDecision>;
      resolve: (decision: WorkflowTaskDecision) => void;
      reject: (error: Error) => void;
    }
  >();

  async triggerWorkflow(payload: WorkflowInstanceTaskPayload) {
    this.assertTriggerDevConfigured();
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
    try {
      this.assertTriggerDevConfigured();
      return await tasks.trigger(taskId, payload, options);
    } catch (error) {
      if (taskId === NOTIFICATION_DISPATCH_TASK_ID) {
        await runLocalNotificationDispatchTask(
          payload as Parameters<typeof runLocalNotificationDispatchTask>[0]
        );
        return {
          id: `local-notification:${Date.now().toString(36)}`
        };
      }

      throw error;
    }
  }

  async createWaitpoint(options: { idempotencyKey: string; tags: string[] }) {
    try {
      this.assertTriggerDevConfigured();
      return await wait.createToken(options);
    } catch {
      return this.createLocalToken(options);
    }
  }

  async completeWaitpoint(tokenId: string, decision: WorkflowTaskDecision) {
    if (this.localWaiters.has(tokenId)) {
      this.completeLocalToken(tokenId, decision);
      return;
    }

    this.assertTriggerDevConfigured();
    try {
      await this.completeTriggerWaitpoint(tokenId, decision);
    } catch (error) {
      if (this.localWaiters.has(tokenId)) {
        this.completeLocalToken(tokenId, decision);
        return;
      }

      throw error;
    }
  }

  async cancelRun(runId: string) {
    this.assertTriggerDevConfigured();
    await runs.cancel(runId);
  }

  private assertTriggerDevConfigured() {
    assertTriggerEngineConfigured();
  }

  startLocalWorkflowExecution(
    payload: WorkflowInstanceTaskPayload,
    store: WorkflowRuntimeStore,
    originalError: unknown
  ) {
    const runId = `local-workflow:${payload.instanceId}`;
    const waits: WorkflowWaitDriver = {
      createToken: (options) => this.createLocalToken(options),
      waitForToken: (tokenId) => this.waitForLocalToken(tokenId),
      waitFor: ({ seconds }) =>
        new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, seconds) * 1000)),
      waitUntil: ({ date }) =>
        new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, date.getTime() - Date.now()))),
      triggerTask: (taskId, taskPayload, options) => this.triggerTask(taskId, taskPayload, options)
    };

    void executeWorkflowInstance(payload, store, waits).catch((error) =>
      store.recordHistory(
        payload.tenantId,
        payload.instanceId,
        'LOCAL_WORKFLOW_EXECUTION_FAILED',
        payload.initiatorId,
        {
          message: error instanceof Error ? error.message : String(error),
          triggerError: originalError instanceof Error ? originalError.message : String(originalError)
        },
        `workflow:${payload.instanceId}:local-execution-failed`
      )
    );

    return { id: runId };
  }

  private createLocalToken(options: { idempotencyKey: string; tags: string[] }) {
    const id = `local-waitpoint:${randomUUID()}`;
    let resolve!: (decision: WorkflowTaskDecision) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<WorkflowTaskDecision>((nextResolve, nextReject) => {
      resolve = nextResolve;
      reject = nextReject;
    });
    this.localWaiters.set(id, { promise, resolve, reject });
    return Promise.resolve({ id });
  }

  private async waitForLocalToken<T>(tokenId: string) {
    const waiter = this.localWaiters.get(tokenId);
    if (!waiter) {
      throw new Error(`Unknown local workflow waitpoint: ${tokenId}`);
    }
    return waiter.promise as Promise<T>;
  }

  private completeLocalToken(tokenId: string, decision: WorkflowTaskDecision) {
    const waiter = this.localWaiters.get(tokenId);
    if (!waiter) {
      throw new Error(`Unknown local workflow waitpoint: ${tokenId}`);
    }

    waiter.resolve(decision);
    this.localWaiters.delete(tokenId);
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
}
