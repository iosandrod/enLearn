import { queue } from '@trigger.dev/sdk';

export const TRIGGER_WORKFLOW_REGISTERED_QUEUES = [
  {
    name: 'trigger-workflow-jobs',
    concurrencyLimit: 10
  },
  {
    name: 'planning-supply',
    concurrencyLimit: 2
  }
] as const;

export const triggerWorkflowQueues = TRIGGER_WORKFLOW_REGISTERED_QUEUES.map(
  (definition) => queue(definition)
);

export function resolveTriggerWorkflowQueueName(value: unknown) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) return undefined;
  if (!TRIGGER_WORKFLOW_REGISTERED_QUEUES.some((item) => item.name === name)) {
    throw new Error(`Trigger.dev queue "${name}" is not registered by the workflow worker.`);
  }
  return name;
}
