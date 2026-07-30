import { task, tasks, wait } from '@trigger.dev/sdk';
import {
  WORKFLOW_INSTANCE_TASK_ID,
  type WorkflowInstanceTaskPayload
} from '../runtime/runtime.engine.types';
import { createStandalonePostgresWorkflowRuntimeStore } from '../runtime/runtime.postgres-store';
import { executeWorkflowInstance, type WorkflowWaitDriver } from '../runtime/workflow.executor';

export const workflowInstanceTask = task({
  id: WORKFLOW_INSTANCE_TASK_ID,
  run: async (payload: WorkflowInstanceTaskPayload) => {
    const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DIRECT_URL or DATABASE_URL is required by the Trigger.dev workflow task.');
    }

    const runtime = createStandalonePostgresWorkflowRuntimeStore(connectionString);
    const waits: WorkflowWaitDriver = {
      createToken: async (options) => wait.createToken(options),
      waitForToken: async <T>(tokenId: string) => {
        const result = await wait.forToken<T>(tokenId);
        if (!result.ok) throw result.error;
        return result.output;
      },
      waitFor: async ({ seconds, idempotencyKey }) => {
        await wait.for({ seconds, idempotencyKey });
      },
      waitUntil: async ({ date, idempotencyKey }) => {
        await wait.until({ date, idempotencyKey });
      },
      triggerTask: async (taskId, taskPayload, options) => {
        await tasks.trigger(taskId, taskPayload, options);
      }
    };

    try {
      return await executeWorkflowInstance(payload, runtime.store, waits);
    } finally {
      await runtime.close();
    }
  }
});
