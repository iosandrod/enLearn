export type WorkflowJobType = 'once' | 'cron' | 'interval' | 'manual' | 'service_task';
export type WorkflowJobStatus = 'draft' | 'enabled' | 'disabled' | 'archived';
export type WorkflowJobRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export type WorkflowJobRecord = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  type: WorkflowJobType;
  status: WorkflowJobStatus;
  triggerTaskId: string;
  scheduleId?: string;
  cronExpr?: string;
  timezone: string;
  intervalSeconds?: number;
  payload: Record<string, unknown>;
  retryPolicy: Record<string, unknown>;
  timeoutSeconds?: number;
  concurrencyKey?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowJobRunRecord = {
  id: string;
  tenantId: string;
  jobId?: string;
  triggerRunId?: string;
  status: WorkflowJobRunStatus;
  attempt: number;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
};

export type WorkflowJobActor = {
  tenantId: string;
  userId?: string;
};
