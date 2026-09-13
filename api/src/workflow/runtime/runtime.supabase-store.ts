import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from '../../common/utils/supabase';
import { WorkflowSupabaseService } from '../common/workflow-supabase.service';
import type {
  AddSignTaskInput,
  CloseInstanceResult,
  CreateNodeInstanceInput,
  CreateProcessInstanceInput,
  CreateWorkflowCcInput,
  CreateWorkflowTaskInput,
  PreparedTaskDecision,
  PrepareTaskDecisionInput,
  WorkflowRuntimeStore,
  WorkflowTaskDecision
} from './runtime.engine.types';
import type { WorkflowCcQuery, WorkflowInstanceQuery, WorkflowTaskQuery } from './runtime.dto';
import { inferVariableType, toIso } from './runtime.helpers';
import type {
  NodeInstanceRecord,
  ProcessInstanceDetail,
  ProcessInstanceRecord,
  ProcessInstanceStatus,
  RuntimeActor,
  WorkflowCcRecord,
  WorkflowExecutionEventRecord,
  WorkflowExecutionTokenRecord,
  WorkflowCommentRecord,
  WorkflowHistoryEventRecord,
  WorkflowTaskCandidateRecord,
  WorkflowTaskRecord,
  WorkflowVariableRecord
} from './runtime.types';

const WORKFLOW_RUNTIME_RPC = 'workflow_runtime_command';
type JsonRecord = Record<string, unknown>;

export class SupabaseWorkflowRuntimeStore implements WorkflowRuntimeStore {
  constructor(private readonly persistence: WorkflowSupabaseService | SupabaseClient) {}

  async createInstance(input: CreateProcessInstanceInput) {
    const row = await this.command('create_instance', {
      id: input.id,
      account_id: input.tenantId,
      definition_id: input.definitionId,
      definition_version: input.definitionVersion,
      business_key: input.businessKey,
      document_type: input.documentType ?? null,
      document_id: input.documentId ?? null,
      title: input.title,
      initiator_id: input.initiatorId ?? null,
      variables: input.variables,
      variable_types: variableTypes(input.variables)
    });
    return mapProcessInstance(assertRecord(row, 'Workflow runtime RPC returned an invalid instance.'));
  }

  async setTriggerRun(instanceId: string, triggerRunId: string) {
    await this.command('set_trigger_run', {
      instance_id: instanceId,
      trigger_run_id: triggerRunId
    });
  }

  async deleteUnstartedInstance(instanceId: string) {
    await this.command('delete_unstarted_instance', { instance_id: instanceId });
  }

  async listInstances(query: WorkflowInstanceQuery = {}) {
    const rows = await this.command('list_instances', {
      account_id: query.tenantId ?? null,
      status: query.status ?? null,
      document_type: query.documentType ?? null,
      document_id: query.documentId ?? null,
      limit: 200
    });
    return assertRecordArray(rows, 'Workflow runtime RPC returned an invalid instance list.')
      .map(mapProcessInstance);
  }

  async listStarted(actor: RuntimeActor, query: WorkflowInstanceQuery = {}) {
    const rows = await this.command('list_instances', {
      account_id: actor.tenantId,
      initiator_id: actor.userId ?? null,
      status: query.status ?? null,
      document_type: query.documentType ?? null,
      document_id: query.documentId ?? null,
      limit: 200
    });
    return assertRecordArray(rows, 'Workflow runtime RPC returned an invalid instance list.')
      .map(mapProcessInstance);
  }

  async getInstance(instanceId: string): Promise<ProcessInstanceDetail> {
    const data = assertRecord(
      await this.command('get_instance', { instance_id: instanceId }),
      'Workflow runtime RPC returned an invalid instance.'
    );
    return {
      ...mapProcessInstance(data),
      variables: readNestedRows(data.variables).map(mapVariable),
      comments: readNestedRows(data.comments).map(mapComment),
      ccItems: readNestedRows(data.cc_items).map(mapCc),
      nodeInstances: readNestedRows(data.node_instances).map(mapNodeInstance),
      tasks: readNestedRows(data.tasks).map(mapTask)
    };
  }

  async listTasks(query: WorkflowTaskQuery = {}) {
    return this.listTaskAction('list_tasks', undefined, query);
  }

  async listTodoTasks(actor: RuntimeActor, query: WorkflowTaskQuery = {}) {
    return this.listTaskAction('list_todo_tasks', actor, query);
  }

  async listDoneTasks(actor: RuntimeActor, query: WorkflowTaskQuery = {}) {
    return this.listTaskAction('list_done_tasks', actor, query);
  }

  async listCc(actor: RuntimeActor, _query: WorkflowCcQuery = {}) {
    const rows = await this.command('list_cc', {
      account_id: actor.tenantId,
      user_id: actor.userId ?? null
    });
    return assertRecordArray(rows, 'Workflow runtime RPC returned an invalid CC list.').map(mapCc);
  }

  async getTask(taskId: string) {
    return mapTaskWithCandidates(assertRecord(
      await this.command('get_task', { task_id: taskId }),
      'Workflow runtime RPC returned an invalid task.'
    ));
  }

  async getTimeline(instanceId: string) {
    const rows = await this.command('get_timeline', { instance_id: instanceId });
    return assertRecordArray(rows, 'Workflow runtime RPC returned an invalid timeline.').map(mapHistory);
  }

  async prepareTaskDecision(input: PrepareTaskDecisionInput): Promise<PreparedTaskDecision> {
    const data = assertRecord(
      await this.command('prepare_task_decision', {
        task_id: input.taskId,
        decision_action: input.action,
        account_id: input.actor.tenantId,
        user_id: input.actor.userId ?? null,
        comment: input.comment ?? '',
        variables: input.variables ?? {},
        variable_types: variableTypes(input.variables ?? {}),
        target_node_id: input.targetNodeId ?? null
      }),
      'Workflow runtime RPC returned an invalid task decision.'
    );
    const decision = assertRecord(
      data.decision,
      'Workflow runtime RPC returned an invalid decision payload.'
    ) as WorkflowTaskDecision;
    return {
      task: mapTask(assertRecord(data.task, 'Workflow runtime RPC omitted the task.')),
      instance: mapProcessInstance(
        assertRecord(data.instance, 'Workflow runtime RPC omitted the instance.')
      ),
      tokenId: readRequiredString(data.token_id, 'token_id'),
      decision,
      alreadyPrepared: data.already_prepared === true
    };
  }

  async markWaitpointCompleted(taskId: string) {
    await this.command('mark_waitpoint_completed', { task_id: taskId });
  }

  async recordWaitpointFailure(taskId: string, message: string) {
    await this.command('record_waitpoint_failure', { task_id: taskId, message });
  }

  async claimTask(taskId: string, actor: RuntimeActor) {
    return mapTaskWithCandidates(assertRecord(
      await this.command('claim_task', {
        task_id: taskId,
        account_id: actor.tenantId,
        user_id: actor.userId ?? null
      }),
      'Workflow runtime RPC returned an invalid task.'
    ));
  }

  async transferTask(
    taskId: string,
    targetUserId: string,
    comment: string | undefined,
    actor: RuntimeActor
  ) {
    return mapTaskWithCandidates(assertRecord(
      await this.command('transfer_task', {
        task_id: taskId,
        account_id: actor.tenantId,
        user_id: actor.userId ?? null,
        target_user_id: targetUserId.trim(),
        comment: comment ?? ''
      }),
      'Workflow runtime RPC returned an invalid task.'
    ));
  }

  async addSignTask(input: AddSignTaskInput) {
    return mapTaskWithCandidates(assertRecord(
      await this.command('add_sign_task', {
        source_task_id: input.sourceTaskId,
        new_task_id: randomUUID(),
        account_id: input.actor.tenantId,
        user_id: input.actor.userId ?? null,
        target_user_id: input.targetUserId.trim(),
        comment: input.comment ?? '',
        token_id: input.tokenId
      }),
      'Workflow runtime RPC returned an invalid task.'
    ));
  }

  async closeInstance(
    instanceId: string,
    status: 'canceled' | 'terminated',
    eventType: string,
    comment: string,
    actor: RuntimeActor
  ): Promise<CloseInstanceResult> {
    const data = assertRecord(
      await this.command('close_instance', {
        instance_id: instanceId,
        account_id: actor.tenantId,
        user_id: actor.userId ?? null,
        status,
        event_type: eventType,
        comment
      }),
      'Workflow runtime RPC returned an invalid close result.'
    );
    const instanceData = assertRecord(
      data.instance,
      'Workflow runtime RPC omitted the closed instance.'
    );
    const instance = {
      ...mapProcessInstance(instanceData),
      variables: readNestedRows(instanceData.variables).map(mapVariable),
      comments: readNestedRows(instanceData.comments).map(mapComment),
      ccItems: readNestedRows(instanceData.cc_items).map(mapCc),
      nodeInstances: readNestedRows(instanceData.node_instances).map(mapNodeInstance),
      tasks: readNestedRows(instanceData.tasks).map(mapTask)
    };
    return {
      instance,
      ...(readOptionalString(data.trigger_run_id)
        ? { triggerRunId: readOptionalString(data.trigger_run_id) }
        : {})
    };
  }

  async isInstanceRunning(instanceId: string) {
    return (await this.command('is_instance_running', { instance_id: instanceId })) === true;
  }

  async createNodeInstance(input: CreateNodeInstanceInput) {
    const row = await this.command('create_node_instance', {
      id: input.id,
      process_instance_id: input.processInstanceId,
      execution_key: input.executionKey,
      node_id: input.nodeId,
      node_type: input.nodeType,
      name: input.name,
      status: input.status
    });
    return mapNodeInstance(assertRecord(row, 'Workflow runtime RPC returned an invalid node.'));
  }

  async completeNodeInstance(nodeInstanceId: string) {
    await this.command('complete_node_instance', { node_instance_id: nodeInstanceId });
  }

  async failNodeInstance(nodeInstanceId: string, message: string) {
    await this.command('fail_node_instance', { node_instance_id: nodeInstanceId, message });
  }

  async createTasks(inputs: CreateWorkflowTaskInput[]) {
    const rows = await this.command('create_tasks', {
      items: inputs.map((input) => ({
        id: input.id,
        account_id: input.tenantId,
        process_instance_id: input.processInstanceId,
        node_instance_id: input.nodeInstanceId,
        node_id: input.nodeId,
        title: input.title,
        assignee_id: input.assigneeId ?? null,
        waitpoint_token_id: input.waitpointTokenId,
        trigger_run_id: input.triggerRunId ?? null,
        candidates: input.candidates.map((candidate) => ({
          id: candidate.id,
          candidate_type: candidate.candidateType,
          candidate_id: candidate.candidateId,
          snapshot: candidate.snapshot
        }))
      }))
    });
    return assertRecordArray(rows, 'Workflow runtime RPC returned an invalid task list.').map(mapTask);
  }

  async listNodeTasks(nodeInstanceId: string) {
    const rows = await this.command('list_node_tasks', { node_instance_id: nodeInstanceId });
    return assertRecordArray(rows, 'Workflow runtime RPC returned an invalid task list.').map(mapTask);
  }

  async cancelActiveNodeTasks(nodeInstanceId: string, exceptTaskId?: string) {
    await this.command('cancel_active_node_tasks', {
      node_instance_id: nodeInstanceId,
      except_task_id: exceptTaskId ?? null
    });
  }

  async createCcItems(inputs: CreateWorkflowCcInput[]) {
    const rows = await this.command('create_cc_items', {
      items: inputs.map((input) => ({
        id: input.id,
        account_id: input.tenantId,
        process_instance_id: input.processInstanceId,
        node_instance_id: input.nodeInstanceId,
        node_id: input.nodeId,
        title: input.title,
        recipient_id: input.recipientId ?? null,
        candidate_type: input.candidateType ?? null,
        candidate_id: input.candidateId ?? null
      }))
    });
    return assertRecordArray(rows, 'Workflow runtime RPC returned an invalid CC list.').map(mapCc);
  }

  async getVariables(instanceId: string) {
    const data = await this.command('get_variables', { instance_id: instanceId });
    return assertRecord(data, 'Workflow runtime RPC returned invalid variables.');
  }

  async recordHistory(
    tenantId: string,
    instanceId: string,
    eventType: string,
    operatorId: string | undefined,
    payload: Record<string, unknown>,
    idempotencyKey?: string
  ) {
    await this.command('record_history', {
      account_id: tenantId,
      instance_id: instanceId,
      event_type: eventType,
      operator_id: operatorId ?? null,
      payload,
      idempotency_key: idempotencyKey ?? null
    });
  }

  async setInstanceStatus(
    instanceId: string,
    status: Extract<ProcessInstanceStatus, 'approved' | 'rejected' | 'failed'>,
    payload: Record<string, unknown> = {}
  ) {
    await this.command('set_instance_status', { instance_id: instanceId, status, payload });
  }

  async createExecutionToken(input: {
    id: string;
    processInstanceId: string;
    parentTokenId?: string;
    branchId?: string;
    joinScopeId?: string;
    nodeId: string;
    status: WorkflowExecutionTokenRecord['status'];
    joinKey?: string;
    waitpointId?: string;
  }) {
    const client = this.client();
    const { data, error } = await client.from('wf_execution_token').insert({
      id: input.id,
      process_instance_id: input.processInstanceId,
      parent_token_id: input.parentTokenId ?? null,
      branch_id: input.branchId ?? null,
      join_scope_id: input.joinScopeId ?? null,
      node_id: input.nodeId,
      status: input.status,
      join_key: input.joinKey ?? null,
      waitpoint_id: input.waitpointId ?? null
    }).select('*').single();
    if (error?.code === '23505') {
      const { data: existing, error: existingError } = await client
        .from('wf_execution_token')
        .select('*')
        .eq('id', input.id)
        .single();
      if (existingError) throw new BadRequestException(existingError.message);
      return mapExecutionToken(assertRecord(existing, 'Workflow token lookup returned an invalid row.'));
    }
    if (error) throw new BadRequestException(error.message);
    return mapExecutionToken(assertRecord(data, 'Workflow token insert returned an invalid row.'));
  }

  async updateExecutionToken(tokenId: string, patch: {
    status?: WorkflowExecutionTokenRecord['status'];
    nodeId?: string;
    waitpointId?: string;
    version: number;
  }) {
    const client = this.client();
    const update = {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.nodeId ? { node_id: patch.nodeId } : {}),
      ...(patch.waitpointId ? { waitpoint_id: patch.waitpointId } : {}),
      version: patch.version + 1,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await client.from('wf_execution_token')
      .update(update)
      .eq('id', tokenId)
      .eq('version', patch.version)
      .select('*')
      .single();
    if (error) throw new BadRequestException(error.message);
    return mapExecutionToken(assertRecord(data, 'Workflow token update returned an invalid row.'));
  }

  async listExecutionTokens(processInstanceId: string, joinKey?: string) {
    const client = this.client();
    let request = client.from('wf_execution_token').select('*').eq('process_instance_id', processInstanceId);
    if (joinKey) request = request.eq('join_key', joinKey);
    const { data, error } = await request.order('created_at', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((row) => mapExecutionToken(assertRecord(row, 'Workflow token list returned an invalid row.')));
  }

  async claimExecutionJoin(input: {
    processInstanceId: string;
    joinKey: string;
    joinScopeId?: string;
    tokenId: string;
    expectedBranches: number;
  }) {
    const client = this.client();
    const { data, error } = await client.rpc('workflow_claim_join', {
      p_process_instance_id: input.processInstanceId,
      p_join_key: input.joinKey,
      p_join_scope_id: input.joinScopeId ?? null,
      p_token_id: input.tokenId,
      p_expected_branches: input.expectedBranches
    });
    if (error) throw new BadRequestException(error.message);
    return data === true;
  }

  async appendExecutionEvent(input: {
    id: string;
    processInstanceId: string;
    tokenId?: string;
    eventType: string;
    nodeId?: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  }) {
    const client = this.client();
    const { data, error } = await client.from('wf_execution_event').insert({
      id: input.id,
      process_instance_id: input.processInstanceId,
      token_id: input.tokenId ?? null,
      event_type: input.eventType,
      node_id: input.nodeId ?? null,
      payload: input.payload,
      idempotency_key: input.idempotencyKey ?? null
    }).select('*').single();
    if (error?.code === '23505' && input.idempotencyKey) {
      const { data: existing, error: existingError } = await client
        .from('wf_execution_event')
        .select('*')
        .eq('process_instance_id', input.processInstanceId)
        .eq('idempotency_key', input.idempotencyKey)
        .single();
      if (existingError) throw new BadRequestException(existingError.message);
      return mapExecutionEvent(assertRecord(existing, 'Workflow event lookup returned an invalid row.'));
    }
    if (error) throw new BadRequestException(error.message);
    return mapExecutionEvent(assertRecord(data, 'Workflow execution event insert returned an invalid row.'));
  }

  async claimRecoveryCandidate(input: { instanceId: string; leaseSeconds: number }) {
    const client = this.client();
    const { data, error } = await client.rpc('workflow_claim_recovery_candidate', {
      p_instance_id: input.instanceId,
      p_lease_seconds: input.leaseSeconds
    });
    if (error) throw new BadRequestException(error.message);
    return data === true;
  }

  async releaseRecoveryLease(instanceId: string, succeeded: boolean, error?: string) {
    const { error: updateError } = await this.client()
      .from('wf_process_instance')
      .update({
        recovery_status: succeeded ? 'succeeded' : 'failed',
        recovery_lease_until: null,
        last_recovery_error: error ?? null
      })
      .eq('id', instanceId);
    if (updateError) throw new BadRequestException(updateError.message);
  }

  private async listTaskAction(
    action: 'list_tasks' | 'list_todo_tasks' | 'list_done_tasks',
    actor: RuntimeActor | undefined,
    query: WorkflowTaskQuery
  ) {
    const rows = await this.command(action, {
      account_id: actor?.tenantId ?? query.tenantId ?? null,
      user_id: actor?.userId ?? null,
      assignee_id: query.assigneeId ?? null,
      status: query.status ?? null
    });
    return assertRecordArray(rows, 'Workflow runtime RPC returned an invalid task list.').map(mapTask);
  }

  private client() {
    return isSupabaseService(this.persistence) ? this.persistence.client : this.persistence;
  }

  private async command(action: string, payload: JsonRecord) {
    const client = isSupabaseService(this.persistence)
      ? this.persistence.client
      : this.persistence;
    const { data, error } = await client.rpc(WORKFLOW_RUNTIME_RPC, {
      p_action: action,
      p_payload: payload
    });
    if (error?.code === 'P0002') throw new NotFoundException(error.message);
    if (error) throw new BadRequestException(error.message);
    return data;
  }
}

export function createStandaloneSupabaseWorkflowRuntimeStore() {
  const client = createSupabaseClient('admin');
  return new SupabaseWorkflowRuntimeStore(client);
}

function isSupabaseService(
  value: WorkflowSupabaseService | SupabaseClient
): value is WorkflowSupabaseService {
  return 'isConfigured' in value;
}

function variableTypes(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, inferVariableType(value)]));
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, message: string) {
  if (!isRecord(value)) throw new BadRequestException(message);
  return value;
}

function assertRecordArray(value: unknown, message: string) {
  if (!Array.isArray(value) || !value.every(isRecord)) throw new BadRequestException(message);
  return value;
}

function readNestedRows(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function mapExecutionToken(row: JsonRecord): WorkflowExecutionTokenRecord {
  return {
    id: readRequiredString(row.id, 'id'),
    processInstanceId: readRequiredString(row.process_instance_id, 'process_instance_id'),
    ...(readOptionalString(row.parent_token_id) ? { parentTokenId: readOptionalString(row.parent_token_id) } : {}),
    ...(readOptionalString(row.branch_id) ? { branchId: readOptionalString(row.branch_id) } : {}),
    ...(readOptionalString(row.join_scope_id) ? { joinScopeId: readOptionalString(row.join_scope_id) } : {}),
    nodeId: readRequiredString(row.node_id, 'node_id'),
    status: readRequiredString(row.status, 'status') as WorkflowExecutionTokenRecord['status'],
    ...(readOptionalString(row.join_key) ? { joinKey: readOptionalString(row.join_key) } : {}),
    ...(readOptionalString(row.waitpoint_id) ? { waitpointId: readOptionalString(row.waitpoint_id) } : {}),
    version: readNumber(row.version),
    createdAt: toIso(row.created_at as string | Date | null | undefined) ?? '',
    updatedAt: toIso(row.updated_at as string | Date | null | undefined) ?? ''
  };
}

function mapExecutionEvent(row: JsonRecord): WorkflowExecutionEventRecord {
  return {
    id: readRequiredString(row.id, 'id'),
    processInstanceId: readRequiredString(row.process_instance_id, 'process_instance_id'),
    ...(readOptionalString(row.token_id) ? { tokenId: readOptionalString(row.token_id) } : {}),
    sequence: readNumber(row.sequence),
    eventType: readRequiredString(row.event_type, 'event_type'),
    ...(readOptionalString(row.node_id) ? { nodeId: readOptionalString(row.node_id) } : {}),
    payload: isRecord(row.payload) ? row.payload : {},
    ...(readOptionalString(row.idempotency_key) ? { idempotencyKey: readOptionalString(row.idempotency_key) } : {}),
    createdAt: toIso(row.created_at as string | Date | null | undefined) ?? ''
  };
}

function readRequiredString(value: unknown, field: string) {
  const result = readOptionalString(value);
  if (!result) throw new BadRequestException(`Workflow runtime RPC response is missing ${field}.`);
  return result;
}

function readNumber(value: unknown, fallback = 0) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function requiredIso(value: unknown) {
  const result = toIso(value as Date | string | null | undefined);
  if (!result) throw new BadRequestException('Workflow runtime RPC returned an invalid timestamp.');
  return result;
}

function mapProcessInstance(row: JsonRecord): ProcessInstanceRecord {
  return {
    id: readRequiredString(row.id, 'id'),
    tenantId: readRequiredString(row.account_id, 'account_id'),
    definitionId: readRequiredString(row.definition_id, 'definition_id'),
    definitionVersion: readNumber(row.definition_version),
    businessKey: readRequiredString(row.business_key, 'business_key'),
    ...(readOptionalString(row.document_type) ? { documentType: readOptionalString(row.document_type) } : {}),
    ...(readOptionalString(row.document_id) ? { documentId: readOptionalString(row.document_id) } : {}),
    title: readRequiredString(row.title, 'title'),
    status: row.status as ProcessInstanceStatus,
    ...(readOptionalString(row.initiator_id) ? { initiatorId: readOptionalString(row.initiator_id) } : {}),
    ...(readOptionalString(row.trigger_run_id) ? { triggerRunId: readOptionalString(row.trigger_run_id) } : {}),
    ...(readOptionalString(row.trigger_task_id) ? { triggerTaskId: readOptionalString(row.trigger_task_id) } : {}),
    startedAt: requiredIso(row.started_at),
    ...(row.ended_at ? { endedAt: requiredIso(row.ended_at) } : {})
  };
}

function mapNodeInstance(row: JsonRecord): NodeInstanceRecord {
  return {
    id: readRequiredString(row.id, 'id'),
    processInstanceId: readRequiredString(row.process_instance_id, 'process_instance_id'),
    ...(readOptionalString(row.execution_key) ? { executionKey: readOptionalString(row.execution_key) } : {}),
    nodeId: readRequiredString(row.node_id, 'node_id'),
    nodeType: readRequiredString(row.node_type, 'node_type'),
    name: readRequiredString(row.name, 'name'),
    status: row.status as NodeInstanceRecord['status'],
    ...(row.started_at ? { startedAt: requiredIso(row.started_at) } : {}),
    ...(row.ended_at ? { endedAt: requiredIso(row.ended_at) } : {})
  };
}

function mapTask(row: JsonRecord): WorkflowTaskRecord {
  return {
    id: readRequiredString(row.id, 'id'),
    tenantId: readRequiredString(row.account_id, 'account_id'),
    processInstanceId: readRequiredString(row.process_instance_id, 'process_instance_id'),
    nodeInstanceId: readRequiredString(row.node_instance_id, 'node_instance_id'),
    nodeId: readRequiredString(row.node_id, 'node_id'),
    title: readRequiredString(row.title, 'title'),
    status: row.status as WorkflowTaskRecord['status'],
    ...(readOptionalString(row.assignee_id) ? { assigneeId: readOptionalString(row.assignee_id) } : {}),
    ...(row.claimed_at ? { claimedAt: requiredIso(row.claimed_at) } : {}),
    ...(row.due_at ? { dueAt: requiredIso(row.due_at) } : {}),
    ...(readOptionalString(row.waitpoint_token_id) ? { waitpointTokenId: readOptionalString(row.waitpoint_token_id) } : {}),
    ...(readOptionalString(row.trigger_run_id) ? { triggerRunId: readOptionalString(row.trigger_run_id) } : {}),
    ...(isRecord(row.decision_payload) ? { decisionPayload: row.decision_payload } : {}),
    createdAt: requiredIso(row.created_at),
    ...(row.completed_at ? { completedAt: requiredIso(row.completed_at) } : {})
  };
}

function mapCandidate(row: JsonRecord): WorkflowTaskCandidateRecord {
  return {
    id: readRequiredString(row.id, 'id'),
    taskId: readRequiredString(row.task_id, 'task_id'),
    candidateType: row.candidate_type as WorkflowTaskCandidateRecord['candidateType'],
    candidateId: readRequiredString(row.candidate_id, 'candidate_id'),
    snapshot: isRecord(row.snapshot) ? row.snapshot : {}
  };
}

function mapTaskWithCandidates(row: JsonRecord) {
  return {
    ...mapTask(row),
    candidates: readNestedRows(row.candidates).map(mapCandidate)
  };
}

function mapVariable(row: JsonRecord): WorkflowVariableRecord {
  return {
    id: readRequiredString(row.id, 'id'),
    processInstanceId: readRequiredString(row.process_instance_id, 'process_instance_id'),
    key: readRequiredString(row.key, 'key'),
    value: row.value,
    valueType: readRequiredString(row.value_type, 'value_type'),
    updatedAt: requiredIso(row.updated_at)
  };
}

function mapHistory(row: JsonRecord): WorkflowHistoryEventRecord {
  return {
    id: readRequiredString(row.id, 'id'),
    tenantId: readRequiredString(row.account_id, 'account_id'),
    processInstanceId: readRequiredString(row.process_instance_id, 'process_instance_id'),
    eventType: readRequiredString(row.event_type, 'event_type'),
    ...(readOptionalString(row.operator_id) ? { operatorId: readOptionalString(row.operator_id) } : {}),
    payload: isRecord(row.payload) ? row.payload : {},
    createdAt: requiredIso(row.created_at)
  };
}

function mapComment(row: JsonRecord): WorkflowCommentRecord {
  return {
    id: readRequiredString(row.id, 'id'),
    tenantId: readRequiredString(row.account_id, 'account_id'),
    processInstanceId: readRequiredString(row.process_instance_id, 'process_instance_id'),
    ...(readOptionalString(row.task_id) ? { taskId: readOptionalString(row.task_id) } : {}),
    ...(readOptionalString(row.node_id) ? { nodeId: readOptionalString(row.node_id) } : {}),
    action: readRequiredString(row.action, 'action'),
    ...(readOptionalString(row.operator_id) ? { operatorId: readOptionalString(row.operator_id) } : {}),
    comment: typeof row.comment === 'string' ? row.comment : '',
    createdAt: requiredIso(row.created_at)
  };
}

function mapCc(row: JsonRecord): WorkflowCcRecord {
  return {
    id: readRequiredString(row.id, 'id'),
    tenantId: readRequiredString(row.account_id, 'account_id'),
    processInstanceId: readRequiredString(row.process_instance_id, 'process_instance_id'),
    nodeInstanceId: readRequiredString(row.node_instance_id, 'node_instance_id'),
    nodeId: readRequiredString(row.node_id, 'node_id'),
    title: readRequiredString(row.title, 'title'),
    ...(readOptionalString(row.recipient_id) ? { recipientId: readOptionalString(row.recipient_id) } : {}),
    ...(readOptionalString(row.candidate_type)
      ? { candidateType: readOptionalString(row.candidate_type) as WorkflowTaskCandidateRecord['candidateType'] }
      : {}),
    ...(readOptionalString(row.candidate_id) ? { candidateId: readOptionalString(row.candidate_id) } : {}),
    createdAt: requiredIso(row.created_at),
    ...(row.read_at ? { readAt: requiredIso(row.read_at) } : {})
  };
}
