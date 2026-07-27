export type WorkflowApiEnv = {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
  WORKFLOW_API_PORT?: string;
  TRIGGER_PROJECT_REF?: string;
  TRIGGER_SECRET_KEY?: string;
  TRIGGER_API_URL?: string;
  PORT?: string;
};

export function getWorkflowEnv(): WorkflowApiEnv {
  return process.env;
}
