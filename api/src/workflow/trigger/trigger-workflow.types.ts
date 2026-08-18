export const TRIGGER_WORKFLOW_RUNNER_TASK_ID = 'workflow.trigger-workflow.run';

export const TRIGGER_WORKFLOW_ADAPTER_TASK_IDS = {
  frontendCommand: 'workflow.adapter.frontend-command',
  backendCommand: 'workflow.adapter.backend-command',
  storedProcedure: 'workflow.adapter.stored-procedure'
} as const;

export type TriggerWorkflowTaskType =
  | 'frontendCommand'
  | 'backendCommand'
  | 'storedProcedure'
  | 'registeredTask';

export type TriggerWorkflowTaskJobAdapter = {
  type: TriggerWorkflowTaskType;
  executorTaskId: string;
  input: Record<string, unknown>;
  functionSource?: string;
  procedureName?: string;
  procedureSchema?: string;
  outputPath?: string;
  outputMapping?: Record<string, string>;
  failureStrategy?: 'failWorkflow' | 'continue' | 'useDefaultOutput';
  defaultOutput?: unknown;
  priority?: number;
  tags?: string[];
  queue?: { name?: string };
  retry?: {
    maxAttempts?: number;
    factor?: number;
    minTimeoutMs?: number;
    maxTimeoutMs?: number;
  };
  timeoutSeconds?: number;
  idempotencyKey?: string;
};

export type TriggerWorkflowJobOperation = {
  id: string;
  nodeId: string;
  type: string;
  label: string;
  dependsOn: string[];
  next: string[];
  options: Record<string, unknown>;
  adapter?: TriggerWorkflowTaskJobAdapter;
};

export type TriggerWorkflowJobExecutionPlan = {
  workflowId: string;
  workflowCode: string;
  workflowName: string;
  entryNodeId: string;
  operations: TriggerWorkflowJobOperation[];
};

export type TriggerWorkflowJobDefinitionPayload = {
  version: 1;
  modelId: string;
  modelCode: string;
  modelName: string;
  planSignature: string;
  executionPlan: TriggerWorkflowJobExecutionPlan;
};

export type TriggerWorkflowRunnerPayload = Record<string, unknown> & {
  runId?: string;
  jobId?: string;
  tenantId?: string;
  userId?: string;
  triggerWorkflow?: TriggerWorkflowJobDefinitionPayload;
};

export type TriggerWorkflowAdapterPayload = {
  runId: string;
  jobId?: string;
  tenantId: string;
  userId?: string;
  workflowId: string;
  workflowCode: string;
  operationId: string;
  nodeId: string;
  payload: Record<string, unknown>;
  variables: Record<string, unknown>;
  previousOutput?: unknown;
  adapter: TriggerWorkflowTaskJobAdapter;
};
