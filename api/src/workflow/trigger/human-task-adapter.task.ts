import { task, wait } from '@trigger.dev/sdk';
import { createStandaloneSupabaseWorkflowRuntimeStore } from '../runtime/runtime.supabase-store';
import { executeHumanTaskAdapter } from '../runtime/human-task.adapter';
import {
  TRIGGER_WORKFLOW_ADAPTER_TASK_IDS,
  type TriggerWorkflowAdapterPayload
} from './trigger-workflow.types';
import { readRequiredString, isRecord } from './trigger-workflow.helpers';

export type HumanTaskAdapterTaskPayload = TriggerWorkflowAdapterPayload & {
  processInstanceId: string;
  nodeInstanceId: string;
  humanTask: {
    title: string;
    completionStrategy?: 'any' | 'all' | 'ratio';
    passRatio?: number;
    candidates: Array<{ type: 'user' | 'role' | 'department'; id: string; snapshot?: Record<string, unknown> }>;
    timeoutSeconds?: number;
    onTimeout?: 'fail' | 'autoApprove' | 'autoReject' | 'continue';
  };
};

export const triggerWorkflowHumanTaskAdapterTask = task({
  id: TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.humanTask,
  maxDuration: 86400,
  run: async (payload: HumanTaskAdapterTaskPayload) => executeHumanTaskAdapterTask(payload)
});

export async function executeHumanTaskAdapterTask(
  payload: HumanTaskAdapterTaskPayload,
  dependencies: { store?: ReturnType<typeof createStandaloneSupabaseWorkflowRuntimeStore> } = {}
) {
  const store = dependencies.store ?? createStandaloneSupabaseWorkflowRuntimeStore();
  const existingTasks = await store.listNodeTasks(readRequiredString(payload.nodeInstanceId, 'nodeInstanceId'));
  if (!existingTasks.length) {
    await store.createNodeInstance({
      id: readRequiredString(payload.nodeInstanceId, 'nodeInstanceId'),
      processInstanceId: readRequiredString(payload.processInstanceId, 'processInstanceId'),
      executionKey: `trigger:${payload.runId}:${payload.nodeId}`,
      nodeId: readRequiredString(payload.nodeId, 'nodeId'),
      nodeType: 'humanTask',
      name: readRequiredString(payload.humanTask?.title, 'humanTask.title'),
      status: 'running'
    });
  }
  const result = await executeHumanTaskAdapter({
    tenantId: readRequiredString(payload.tenantId, 'tenantId'),
    processInstanceId: readRequiredString(payload.processInstanceId, 'processInstanceId'),
    nodeInstanceId: readRequiredString(payload.nodeInstanceId, 'nodeInstanceId'),
    nodeId: readRequiredString(payload.nodeId, 'nodeId'),
    title: readRequiredString(payload.humanTask?.title, 'humanTask.title'),
    completionStrategy: payload.humanTask?.completionStrategy ?? 'any',
    passRatio: payload.humanTask?.passRatio,
    timeoutSeconds: payload.humanTask?.timeoutSeconds,
    onTimeout: payload.humanTask?.onTimeout,
    candidates: Array.isArray(payload.humanTask?.candidates)
      ? payload.humanTask.candidates.filter((candidate) => isRecord(candidate) && typeof candidate.id === 'string')
      : []
  }, store, {
    createToken: async (options) => wait.createToken(options),
    waitForToken: async <T>(tokenId: string) => {
      const result = await wait.forToken<T>(tokenId);
      if (!result.ok) throw result.error;
      return result.output;
    },
    waitFor: async ({ seconds, idempotencyKey }) => {
      await wait.for({ seconds, idempotencyKey });
    },
    supportsParallelWait: false,
    triggerTask: async (taskId, taskPayload, options) => {
      const { tasks } = await import('@trigger.dev/sdk');
      await tasks.trigger(taskId, taskPayload, options);
    }
  });
  if (result.status === 'continued') {
    await store.completeNodeInstance(readRequiredString(payload.nodeInstanceId, 'nodeInstanceId'));
  }
  return {
    handledBy: TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.humanTask,
    ...result
  };
}
