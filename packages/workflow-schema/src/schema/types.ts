export const WORKFLOW_SCHEMA_VERSION = 1;

export type WorkflowModelStatus = 'draft' | 'published' | 'archived' | 'disabled';

export type WorkflowNodeType =
  | 'start'
  | 'approval'
  | 'sign'
  | 'orSign'
  | 'condition'
  | 'cc'
  | 'parallelGateway'
  | 'serviceTask'
  | 'timer'
  | 'subProcess'
  | 'end'
  | (string & {});

export type WorkflowConditionType = 'always' | 'expression' | 'field';

export type WorkflowConditionOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'contains';

export type WorkflowCondition = {
  type: WorkflowConditionType;
  expression?: string;
  field?: string;
  operator?: WorkflowConditionOperator;
  value?: unknown;
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  name?: string;
  priority?: number;
  condition?: WorkflowCondition;
};

export type WorkflowPosition = {
  x: number;
  y: number;
};

export type AssigneeStrategy =
  | { type: 'users'; userIds: string[] }
  | { type: 'roles'; roleCodes: string[] }
  | { type: 'departments'; departmentIds: string[] }
  | { type: 'initiatorManager'; level?: number }
  | { type: 'field'; field: string }
  | { type: 'expression'; expression: string };

export type ApprovalNodeConfig = {
  assigneeStrategy?: AssigneeStrategy;
  completionStrategy?: 'all' | 'any' | 'ratio';
  passRatio?: number;
  sequential?: boolean;
  allowTransfer?: boolean;
  allowDelegate?: boolean;
  allowAddSign?: boolean;
  allowReject?: boolean;
  rejectMode?: 'previous' | 'start' | 'specificNode';
  rejectTargetNodeId?: string;
  taskTitleTemplate?: string;
};

export type CcNodeConfig = {
  assigneeStrategy?: AssigneeStrategy;
};

export type TimerNodeConfig = {
  mode?: 'delay' | 'datetime';
  delaySeconds?: number;
  duration?: string;
  datetime?: string;
  timezone?: string;
  action?: 'continue' | 'autoApprove' | 'autoReject' | 'notifyOnly';
};

export type ServiceTaskConfig = {
  serviceName?: string;
  serviceMethod?: string;
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  timeoutSeconds?: number;
  retry?: {
    maxAttempts?: number;
    backoff?: 'fixed' | 'exponential';
  };
  failureStrategy?: 'fail' | 'markFailed' | 'skip' | 'manual';
};

export type WorkflowNode = {
  id: string;
  type: WorkflowNodeType;
  name: string;
  description?: string;
  position?: WorkflowPosition;
  config?: Record<string, unknown>;
};

export type WorkflowVariableType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'json';

export type WorkflowVariable = {
  key: string;
  label?: string;
  type: WorkflowVariableType;
  source?: 'document' | 'system' | 'manual';
  path?: string;
  required?: boolean;
};

export type WorkflowSettings = {
  allowCancel?: boolean;
  allowWithdraw?: boolean;
  duplicateSubmitPolicy?: 'reject' | 'reuseRunning' | 'newInstance';
  historyLevel?: 'basic' | 'full';
};

export type WorkflowModel = {
  schemaVersion: number;
  id?: string;
  code: string;
  name: string;
  description?: string;
  tenantId?: string;
  documentType?: string;
  status?: WorkflowModelStatus;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables?: WorkflowVariable[];
  settings?: WorkflowSettings;
};

export type WorkflowSchemaIssueLevel = 'error' | 'warning';

export type WorkflowSchemaIssue = {
  level: WorkflowSchemaIssueLevel;
  path: string;
  message: string;
};
