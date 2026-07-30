export type ProcessInstanceStatus =
  | 'running'
  | 'approved'
  | 'rejected'
  | 'canceled'
  | 'terminated'
  | 'failed';

export type NodeInstanceStatus = 'created' | 'running' | 'waiting' | 'completed' | 'skipped' | 'failed';

export type WorkflowTaskStatus = 'pending' | 'claimed' | 'completed' | 'canceled';

export type RuntimeActor = {
  tenantId: string;
  userId?: string;
};

export type ProcessInstanceRecord = {
  id: string;
  tenantId: string;
  definitionId: string;
  definitionVersion: number;
  businessKey: string;
  documentType?: string;
  documentId?: string;
  title: string;
  status: ProcessInstanceStatus;
  initiatorId?: string;
  triggerRunId?: string;
  triggerTaskId?: string;
  startedAt: string;
  endedAt?: string;
};

export type NodeInstanceRecord = {
  id: string;
  processInstanceId: string;
  executionKey?: string;
  nodeId: string;
  nodeType: string;
  name: string;
  status: NodeInstanceStatus;
  startedAt?: string;
  endedAt?: string;
};

export type WorkflowTaskRecord = {
  id: string;
  tenantId: string;
  processInstanceId: string;
  nodeInstanceId: string;
  nodeId: string;
  title: string;
  status: WorkflowTaskStatus;
  assigneeId?: string;
  claimedAt?: string;
  dueAt?: string;
  waitpointTokenId?: string;
  triggerRunId?: string;
  decisionPayload?: Record<string, unknown>;
  createdAt: string;
  completedAt?: string;
};

export type WorkflowTaskCandidateRecord = {
  id: string;
  taskId: string;
  candidateType: 'user' | 'role' | 'department';
  candidateId: string;
  snapshot: Record<string, unknown>;
};

export type WorkflowCcRecord = {
  id: string;
  tenantId: string;
  processInstanceId: string;
  nodeInstanceId: string;
  nodeId: string;
  title: string;
  recipientId?: string;
  candidateType?: 'user' | 'role' | 'department';
  candidateId?: string;
  createdAt: string;
  readAt?: string;
};

export type WorkflowCommentRecord = {
  id: string;
  tenantId: string;
  processInstanceId: string;
  taskId?: string;
  nodeId?: string;
  action: string;
  operatorId?: string;
  comment: string;
  createdAt: string;
};

export type WorkflowVariableRecord = {
  id: string;
  processInstanceId: string;
  key: string;
  value: unknown;
  valueType: string;
  updatedAt: string;
};

export type WorkflowHistoryEventRecord = {
  id: string;
  tenantId: string;
  processInstanceId: string;
  eventType: string;
  operatorId?: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type WorkflowNodeSnapshot = {
  id: string;
  type: string;
  name: string;
  config?: Record<string, unknown>;
};

export type WorkflowEdgeSnapshot = {
  id: string;
  source: string;
  target: string;
  priority?: number;
  condition?: Record<string, unknown>;
};

export type ProcessInstanceDetail = ProcessInstanceRecord & {
  variables: WorkflowVariableRecord[];
  comments: WorkflowCommentRecord[];
  ccItems: WorkflowCcRecord[];
  nodeInstances: NodeInstanceRecord[];
  tasks: WorkflowTaskRecord[];
};
