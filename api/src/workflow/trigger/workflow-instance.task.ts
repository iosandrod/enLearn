import { task, tasks, wait } from '@trigger.dev/sdk';
import {
  WORKFLOW_INSTANCE_TASK_ID,
  type WorkflowInstanceTaskPayload
} from '../runtime/runtime.engine.types';
import { createStandaloneSupabaseWorkflowRuntimeStore } from '../runtime/runtime.supabase-store';
import { executeWorkflowInstance, type WorkflowWaitDriver } from '../runtime/workflow.executor';

export const workflowInstanceTask = task({
  id: WORKFLOW_INSTANCE_TASK_ID,
  run: async (payload: WorkflowInstanceTaskPayload) => {
    const store = createStandaloneSupabaseWorkflowRuntimeStore();
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

    return executeWorkflowInstance(payload, store, waits);
  }
});
