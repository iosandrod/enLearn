export const WORKFLOW_SERVICE_CLIENT = 'WORKFLOW_SERVICE_CLIENT';
export const WORKFLOW_REQUEST_PATTERN = 'workflow.request';

export type WorkflowHttpMethod = 'GET' | 'POST' | 'PUT';

export type WorkflowRequest = {
  method: WorkflowHttpMethod;
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
};

export type WorkflowApiEnvelope<T = unknown> = {
  success?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};
