import type {
  NodeInstanceRecord,
  ProcessInstanceDetail,
  ProcessInstanceRecord,
  ProcessInstanceStatus,
  RuntimeActor,
  WorkflowCcRecord,
  WorkflowHistoryEventRecord,
  WorkflowTaskCandidateRecord,
  WorkflowTaskRecord,
  WorkflowVariableRecord
} from './runtime.types';
import type {
  WorkflowCcQuery,
  WorkflowInstanceQuery,
  WorkflowTaskQuery
} from './runtime.dto';

export const WORKFLOW_RUNTIME_STORE = Symbol('WORKFLOW_RUNTIME_STORE');
export const WORKFLOW_INSTANCE_TASK_ID = 'workflow.instance.run';

export type WorkflowInstanceTaskPayload = {
  instanceId: string;
  tenantId: string;
  definitionId: string;
  definitionVersion: number;
  title: string;
  initiatorId?: string;
  schema: Record<string, unknown>;
  variables: Record<string, unknown>;
};

export type WorkflowTaskDecision = {
  action: 'approve' | 'reject';
  taskId: string;
  nodeId: string;
  operatorId?: string;
  comment?: string;
  variables?: Record<string, unknown>;
  targetNodeId?: string;
};

export type CreateProcessInstanceInput = {
  id: string;
  tenantId: string;
  definitionId: string;
  definitionVersion: number;
  businessKey: string;
  documentType?: string;
  documentId?: string;
  title: string;
  initiatorId?: string;
  variables: Record<string, unknown>;
};

export type CreateNodeInstanceInput = {
  id: string;
  processInstanceId: string;
  executionKey: string;
  nodeId: string;
  nodeType: string;
  name: string;
  status: NodeInstanceRecord['status'];
};

export type CreateWorkflowTaskInput = {
  id: string;
  tenantId: string;
  processInstanceId: string;
  nodeInstanceId: string;
  nodeId: string;
  title: string;
  assigneeId?: string;
  waitpointTokenId: string;
  triggerRunId?: string;
  candidates: Array<{
    id: string;
    candidateType: WorkflowTaskCandidateRecord['candidateType'];
    candidateId: string;
    snapshot: Record<string, unknown>;
  }>;
};

export type CreateWorkflowCcInput = {
  id: string;
  tenantId: string;
  processInstanceId: string;
  nodeInstanceId: string;
  nodeId: string;
  title: string;
  recipientId?: string;
  candidateType?: WorkflowTaskCandidateRecord['candidateType'];
  candidateId?: string;
};

export type PrepareTaskDecisionInput = {
  taskId: string;
  action: WorkflowTaskDecision['action'];
  actor: RuntimeActor;
  comment?: string;
  variables?: Record<string, unknown>;
  targetNodeId?: string;
};

export type PreparedTaskDecision = {
  task: WorkflowTaskRecord;
  instance: ProcessInstanceRecord;
  tokenId: string;
  decision: WorkflowTaskDecision;
  alreadyPrepared: boolean;
};

export type AddSignTaskInput = {
  sourceTaskId: string;
  targetUserId: string;
  comment?: string;
  tokenId: string;
  actor: RuntimeActor;
};

export type CloseInstanceResult = {
  instance: ProcessInstanceDetail;
  triggerRunId?: string;
};

export interface WorkflowRuntimeStore {
  createInstance(input: CreateProcessInstanceInput): Promise<ProcessInstanceRecord>;
  setTriggerRun(instanceId: string, triggerRunId: string): Promise<void>;
  deleteUnstartedInstance(instanceId: string): Promise<void>;
  listInstances(query?: WorkflowInstanceQuery): Promise<ProcessInstanceRecord[]>;
  listStarted(actor: RuntimeActor, query?: WorkflowInstanceQuery): Promise<ProcessInstanceRecord[]>;
  getInstance(instanceId: string): Promise<ProcessInstanceDetail>;
  listTasks(query?: WorkflowTaskQuery): Promise<WorkflowTaskRecord[]>;
  listTodoTasks(actor: RuntimeActor, query?: WorkflowTaskQuery): Promise<WorkflowTaskRecord[]>;
  listDoneTasks(actor: RuntimeActor, query?: WorkflowTaskQuery): Promise<WorkflowTaskRecord[]>;
  listCc(actor: RuntimeActor, query?: WorkflowCcQuery): Promise<WorkflowCcRecord[]>;
  getTask(taskId: string): Promise<WorkflowTaskRecord & { candidates: WorkflowTaskCandidateRecord[] }>;
  getTimeline(instanceId: string): Promise<WorkflowHistoryEventRecord[]>;
  prepareTaskDecision(input: PrepareTaskDecisionInput): Promise<PreparedTaskDecision>;
  markWaitpointCompleted(taskId: string): Promise<void>;
  recordWaitpointFailure(taskId: string, message: string): Promise<void>;
  claimTask(taskId: string, actor: RuntimeActor): Promise<WorkflowTaskRecord & {
    candidates: WorkflowTaskCandidateRecord[];
  }>;
  transferTask(
    taskId: string,
    targetUserId: string,
    comment: string | undefined,
    actor: RuntimeActor
  ): Promise<WorkflowTaskRecord & { candidates: WorkflowTaskCandidateRecord[] }>;
  addSignTask(input: AddSignTaskInput): Promise<WorkflowTaskRecord & {
    candidates: WorkflowTaskCandidateRecord[];
  }>;
  closeInstance(
    instanceId: string,
    status: 'canceled' | 'terminated',
    eventType: string,
    comment: string,
    actor: RuntimeActor
  ): Promise<CloseInstanceResult>;
  isInstanceRunning(instanceId: string): Promise<boolean>;
  createNodeInstance(input: CreateNodeInstanceInput): Promise<NodeInstanceRecord>;
  completeNodeInstance(nodeInstanceId: string): Promise<void>;
  failNodeInstance(nodeInstanceId: string, message: string): Promise<void>;
  createTasks(inputs: CreateWorkflowTaskInput[]): Promise<WorkflowTaskRecord[]>;
  listNodeTasks(nodeInstanceId: string): Promise<WorkflowTaskRecord[]>;
  cancelActiveNodeTasks(nodeInstanceId: string, exceptTaskId?: string): Promise<void>;
  createCcItems(inputs: CreateWorkflowCcInput[]): Promise<WorkflowCcRecord[]>;
  getVariables(instanceId: string): Promise<Record<string, unknown>>;
  recordHistory(
    tenantId: string,
    instanceId: string,
    eventType: string,
    operatorId: string | undefined,
    payload: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<void>;
  setInstanceStatus(
    instanceId: string,
    status: Extract<ProcessInstanceStatus, 'approved' | 'rejected' | 'failed'>,
    payload?: Record<string, unknown>
  ): Promise<void>;
}

export interface WorkflowTriggerClient {
  triggerWorkflow(payload: WorkflowInstanceTaskPayload): Promise<{ id: string }>;
  triggerTask(
    taskId: string,
    payload: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<{ id: string }>;
  createWaitpoint(options: {
    idempotencyKey: string;
    tags: string[];
  }): Promise<{ id: string }>;
  completeWaitpoint(tokenId: string, decision: WorkflowTaskDecision): Promise<void>;
  cancelRun(runId: string): Promise<void>;
}
