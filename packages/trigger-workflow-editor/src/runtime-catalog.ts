export const TRIGGER_WORKFLOW_REGISTERED_QUEUES = [
  {
    name: 'trigger-workflow-jobs',
    label: '流程任务队列',
    concurrencyLimit: 10
  }
] as const;

export const TRIGGER_WORKFLOW_REGISTERED_QUEUE_NAMES =
  TRIGGER_WORKFLOW_REGISTERED_QUEUES.map((queue) => queue.name);

export function isRegisteredTriggerWorkflowQueue(value: string) {
  return TRIGGER_WORKFLOW_REGISTERED_QUEUE_NAMES.includes(
    value as (typeof TRIGGER_WORKFLOW_REGISTERED_QUEUE_NAMES)[number]
  );
}
