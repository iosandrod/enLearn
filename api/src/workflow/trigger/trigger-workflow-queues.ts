import { queue } from '@trigger.dev/sdk';

export const TRIGGER_WORKFLOW_REGISTERED_QUEUES = [
  {
    name: 'trigger-workflow-jobs',
    concurrencyLimit: 10
  }
] as const;

export const triggerWorkflowJobsQueue = queue(TRIGGER_WORKFLOW_REGISTERED_QUEUES[0]);

export function resolveTriggerWorkflowQueueName(value: unknown) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) return undefined;
  if (!TRIGGER_WORKFLOW_REGISTERED_QUEUES.some((item) => item.name === name)) {
    throw new Error(`Trigger.dev queue "${name}" is not registered by the workflow worker.`);
  }
  return name;
}
