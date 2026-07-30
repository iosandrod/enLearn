import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type {
  AddSignTaskInput,
  CloseInstanceResult,
  CreateNodeInstanceInput,
  CreateProcessInstanceInput,
  CreateWorkflowCcInput,
  CreateWorkflowTaskInput,
  PreparedTaskDecision,
  PrepareTaskDecisionInput,
  WorkflowRuntimeStore
} from './runtime.engine.types';
import type { WorkflowCcQuery, WorkflowInstanceQuery, WorkflowTaskQuery } from './runtime.dto';
import {
  canActorOperateTask,
  canActorSeeTask,
  inferVariableType
} from './runtime.helpers';
import type {
  NodeInstanceRecord,
  ProcessInstanceDetail,
  ProcessInstanceRecord,
  ProcessInstanceStatus,
  RuntimeActor,
  WorkflowCcRecord,
  WorkflowCommentRecord,
  WorkflowHistoryEventRecord,
  WorkflowTaskCandidateRecord,
  WorkflowTaskRecord,
  WorkflowVariableRecord
} from './runtime.types';

export class MemoryWorkflowRuntimeStore implements WorkflowRuntimeStore {
  private readonly instances = new Map<string, ProcessInstanceRecord>();
  private readonly nodes = new Map<string, NodeInstanceRecord>();
  private readonly nodeByExecutionKey = new Map<string, string>();
  private readonly tasks = new Map<string, WorkflowTaskRecord>();
  private readonly candidates = new Map<string, WorkflowTaskCandidateRecord[]>();
  private readonly variables = new Map<string, WorkflowVariableRecord[]>();
  private readonly history = new Map<string, WorkflowHistoryEventRecord[]>();
  private readonly historyKeys = new Set<string>();
  private readonly comments = new Map<string, WorkflowCommentRecord[]>();
  private readonly ccItems = new Map<string, WorkflowCcRecord[]>();

  async createInstance(input: CreateProcessInstanceInput) {
    const duplicate = Array.from(this.instances.values()).find(
      (instance) =>
        instance.tenantId === input.tenantId &&
        instance.businessKey === input.businessKey &&
        instance.status === 'running'
    );
    if (duplicate) {
      throw new BadRequestException('A running workflow instance already exists for this business key.');
    }

    const now = new Date().toISOString();
    const instance: ProcessInstanceRecord = {
      id: input.id,
      tenantId: input.tenantId,
      definitionId: input.definitionId,
      definitionVersion: input.definitionVersion,
      businessKey: input.businessKey,
      ...(input.documentType ? { documentType: input.documentType } : {}),
      ...(input.documentId ? { documentId: input.documentId } : {}),
      title: input.title,
      status: 'running',
      ...(input.initiatorId ? { initiatorId: input.initiatorId } : {}),
      triggerTaskId: 'workflow.instance.run',
      startedAt: now
    };
    this.instances.set(instance.id, instance);
    this.variables.set(
      instance.id,
      Object.entries(input.variables).map(([key, value]) => ({
        id: randomUUID(),
        processInstanceId: instance.id,
        key,
        value,
        valueType: inferVariableType(value),
        updatedAt: now
      }))
    );
    await this.recordHistory(
      input.tenantId,
      instance.id,
      'PROCESS_STARTED',
      input.initiatorId,
      {
        definitionId: input.definitionId,
        businessKey: input.businessKey,
        documentType: input.documentType,
        documentId: input.documentId
      },
      `process:${instance.id}:started`
    );
    return instance;
  }

  async setTriggerRun(instanceId: string, triggerRunId: string) {
    const instance = this.instances.get(instanceId);
    if (instance) this.instances.set(instanceId, { ...instance, triggerRunId });
  }

  async deleteUnstartedInstance(instanceId: string) {
    const instance = this.instances.get(instanceId);
    if (instance?.triggerRunId) return;
    this.instances.delete(instanceId);
  }

  async listInstances(query: WorkflowInstanceQuery = {}) {
    return Array.from(this.instances.values())
      .filter((instance) => !query.tenantId || instance.tenantId === query.tenantId)
      .filter((instance) => !query.status || instance.status === query.status)
      .filter((instance) => !query.documentType || instance.documentType === query.documentType)
      .filter((instance) => !query.documentId || instance.documentId === query.documentId)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  async listStarted(actor: RuntimeActor, query: WorkflowInstanceQuery = {}) {
    const instances = await this.listInstances({
      ...query,
      tenantId: query.tenantId ?? actor.tenantId
    });
    return instances.filter((instance) => !actor.userId || instance.initiatorId === actor.userId);
  }

  async getInstance(instanceId: string): Promise<ProcessInstanceDetail> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new NotFoundException('Workflow instance not found.');
    return {
      ...instance,
      variables: this.variables.get(instance.id) ?? [],
      comments: this.comments.get(instance.id) ?? [],
      ccItems: this.ccItems.get(instance.id) ?? [],
      nodeInstances: Array.from(this.nodes.values()).filter((node) => node.processInstanceId === instance.id),
      tasks: Array.from(this.tasks.values()).filter((task) => task.processInstanceId === instance.id)
    };
  }

  async listTasks(query: WorkflowTaskQuery = {}) {
    return Array.from(this.tasks.values())
      .filter((task) => !query.tenantId || task.tenantId === query.tenantId)
      .filter((task) => !query.assigneeId || task.assigneeId === query.assigneeId)
      .filter((task) => !query.status || task.status === query.status)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async listTodoTasks(actor: RuntimeActor, query: WorkflowTaskQuery = {}) {
    const tasks = await this.listTasks({
      ...query,
      tenantId: query.tenantId ?? actor.tenantId
    });
    return tasks.filter(
      (task) =>
        (task.status === 'pending' || task.status === 'claimed') &&
        canActorSeeTask(task, this.candidates.get(task.id) ?? [], actor)
    );
  }

  async listDoneTasks(actor: RuntimeActor, query: WorkflowTaskQuery = {}) {
    const tasks = await this.listTasks({
      ...query,
      tenantId: query.tenantId ?? actor.tenantId,
      status: query.status ?? 'completed'
    });
    return tasks.filter((task) => canActorSeeTask(task, this.candidates.get(task.id) ?? [], actor));
  }

  async listCc(actor: RuntimeActor, query: WorkflowCcQuery = {}) {
    return Array.from(this.ccItems.values())
      .flat()
      .filter((item) => item.tenantId === (query.tenantId ?? actor.tenantId))
      .filter((item) => {
        const userId = query.userId ?? actor.userId;
        return !userId || item.recipientId === userId || item.candidateId === userId || item.candidateType !== 'user';
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getTask(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task) throw new NotFoundException('Workflow task not found.');
    return {
      ...task,
      candidates: this.candidates.get(task.id) ?? []
    };
  }

  async getTimeline(instanceId: string) {
    if (!this.instances.has(instanceId)) throw new NotFoundException('Workflow instance not found.');
    return [...(this.history.get(instanceId) ?? [])].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
  }

  async prepareTaskDecision(input: PrepareTaskDecisionInput): Promise<PreparedTaskDecision> {
    const task = this.tasks.get(input.taskId);
    if (!task) throw new NotFoundException('Workflow task not found.');
    const instance = this.instances.get(task.processInstanceId);
    if (!instance) throw new NotFoundException('Workflow instance not found.');
    const candidates = this.candidates.get(task.id) ?? [];
    assertTaskMutable(task, instance, input.actor, candidates);
    if (!canActorOperateTask(task, candidates, input.actor)) {
      throw new BadRequestException('Workflow task cannot be operated by current user.');
    }
    if (!task.waitpointTokenId) {
      throw new BadRequestException('Workflow task is not bound to a Trigger.dev waitpoint.');
    }

    const now = new Date().toISOString();
    const decision = {
      action: input.action,
      taskId: task.id,
      nodeId: task.nodeId,
      operatorId: input.actor.userId,
      comment: input.comment ?? '',
      variables: input.variables ?? {},
      targetNodeId: input.targetNodeId
    };
    this.tasks.set(task.id, {
      ...task,
      status: 'completed',
      assigneeId: task.assigneeId ?? input.actor.userId,
      completedAt: now,
      decisionPayload: decision
    });

    if (input.action === 'approve') {
      this.mergeVariables(instance.id, input.variables ?? {});
      this.recordComment(instance, task, 'approve', input.comment ?? '', input.actor);
      await this.recordHistory(
        instance.tenantId,
        instance.id,
        'TASK_COMPLETED',
        input.actor.userId,
        {
          taskId: task.id,
          nodeId: task.nodeId,
          comment: input.comment ?? ''
        },
        `task:${task.id}:completed`
      );
    } else {
      await this.cancelActiveTasks(instance.id, task.id);
      await this.completeNodeInstance(task.nodeInstanceId);
      await this.setClosedStatus(instance.id, 'rejected');
      this.recordComment(instance, task, 'reject', input.comment ?? '', input.actor);
      await this.recordHistory(
        instance.tenantId,
        instance.id,
        'TASK_REJECTED',
        input.actor.userId,
        {
          taskId: task.id,
          nodeId: task.nodeId,
          targetNodeId: input.targetNodeId,
          comment: input.comment ?? ''
        },
        `task:${task.id}:rejected`
      );
      await this.recordHistory(
        instance.tenantId,
        instance.id,
        'PROCESS_REJECTED',
        input.actor.userId,
        { status: 'rejected', taskId: task.id },
        `process:${instance.id}:rejected`
      );
    }

    return {
      task,
      instance,
      tokenId: task.waitpointTokenId,
      decision,
      alreadyPrepared: false
    };
  }

  async markWaitpointCompleted(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    this.tasks.set(taskId, {
      ...task,
      completedAt: task.completedAt ?? new Date().toISOString()
    });
  }

  async recordWaitpointFailure(taskId: string, message: string) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    const instance = this.instances.get(task.processInstanceId);
    if (!instance) return;
    await this.recordHistory(
      instance.tenantId,
      instance.id,
      'WAITPOINT_COMPLETE_FAILED',
      undefined,
      { taskId, message },
      `task:${taskId}:waitpoint-failed:${message}`
    );
  }

  async claimTask(taskId: string, actor: RuntimeActor) {
    const { task, instance, candidates } = await this.getMutableTaskContext(taskId, actor, {
      allowUnassigned: true
    });
    if (task.assigneeId && task.assigneeId !== actor.userId) {
      throw new BadRequestException('Workflow task has been assigned to another user.');
    }
    const now = new Date().toISOString();
    this.tasks.set(task.id, {
      ...task,
      status: 'claimed',
      assigneeId: actor.userId,
      claimedAt: now
    });
    await this.recordHistory(instance.tenantId, instance.id, 'TASK_CLAIMED', actor.userId, {
      taskId: task.id,
      nodeId: task.nodeId,
      assigneeId: actor.userId
    });
    return this.getTask(task.id);
  }

  async transferTask(
    taskId: string,
    targetUserId: string,
    comment: string | undefined,
    actor: RuntimeActor
  ) {
    const { task, instance } = await this.getMutableTaskContext(taskId, actor, {
      allowUnassigned: true
    });
    const toUserId = targetUserId.trim();
    this.tasks.set(task.id, {
      ...task,
      status: 'pending',
      assigneeId: toUserId,
      claimedAt: undefined
    });
    this.candidates.set(task.id, [
      {
        id: randomUUID(),
        taskId: task.id,
        candidateType: 'user',
        candidateId: toUserId,
        snapshot: { id: toUserId, transferredBy: actor.userId }
      }
    ]);
    this.recordComment(instance, task, 'transfer', comment ?? '', actor);
    await this.recordHistory(instance.tenantId, instance.id, 'TASK_TRANSFERRED', actor.userId, {
      taskId: task.id,
      nodeId: task.nodeId,
      fromUserId: task.assigneeId,
      toUserId
    });
    return this.getTask(task.id);
  }

  async addSignTask(input: AddSignTaskInput) {
    const { task, instance } = await this.getMutableTaskContext(input.sourceTaskId, input.actor, {
      allowUnassigned: true
    });
    const now = new Date().toISOString();
    const taskId = randomUUID();
    const signTask: WorkflowTaskRecord = {
      id: taskId,
      tenantId: task.tenantId,
      processInstanceId: task.processInstanceId,
      nodeInstanceId: task.nodeInstanceId,
      nodeId: task.nodeId,
      title: `${task.title} - 加签`,
      status: 'pending',
      assigneeId: input.targetUserId.trim(),
      waitpointTokenId: input.tokenId,
      createdAt: now
    };
    this.tasks.set(signTask.id, signTask);
    this.candidates.set(signTask.id, [
      {
        id: randomUUID(),
        taskId: signTask.id,
        candidateType: 'user',
        candidateId: input.targetUserId.trim(),
        snapshot: { id: input.targetUserId.trim(), addedBy: input.actor.userId }
      }
    ]);
    this.recordComment(instance, task, 'addSign', input.comment ?? '', input.actor);
    await this.recordHistory(instance.tenantId, instance.id, 'TASK_ADD_SIGNED', input.actor.userId, {
      taskId: task.id,
      signTaskId: signTask.id,
      nodeId: task.nodeId,
      targetUserId: input.targetUserId.trim()
    });
    return this.getTask(signTask.id);
  }

  async closeInstance(
    instanceId: string,
    status: 'canceled' | 'terminated',
    eventType: string,
    comment: string,
    actor: RuntimeActor
  ): Promise<CloseInstanceResult> {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new NotFoundException('Workflow instance not found.');
    if (instance.tenantId !== actor.tenantId) {
      throw new BadRequestException('Workflow instance does not belong to current tenant.');
    }
    if (instance.status !== 'running') {
      throw new BadRequestException('Workflow instance is not running.');
    }
    if (eventType === 'PROCESS_WITHDRAWN' && instance.initiatorId && actor.userId && instance.initiatorId !== actor.userId) {
      throw new BadRequestException('Only workflow initiator can withdraw this instance.');
    }

    await this.setClosedStatus(instance.id, status);
    await this.cancelActiveTasks(instance.id);
    for (const node of Array.from(this.nodes.values())) {
      if (
        node.processInstanceId === instance.id &&
        (node.status === 'created' || node.status === 'running' || node.status === 'waiting')
      ) {
        this.nodes.set(node.id, {
          ...node,
          status: 'skipped',
          endedAt: new Date().toISOString()
        });
      }
    }
    this.recordComment(instance, undefined, eventType, comment, actor);
    await this.recordHistory(
      instance.tenantId,
      instance.id,
      eventType,
      actor.userId,
      { status, comment },
      `process:${instance.id}:${status}`
    );
    return {
      instance: await this.getInstance(instance.id),
      triggerRunId: instance.triggerRunId
    };
  }

  async isInstanceRunning(instanceId: string) {
    return this.instances.get(instanceId)?.status === 'running';
  }

  async createNodeInstance(input: CreateNodeInstanceInput) {
    const key = `${input.processInstanceId}:${input.executionKey}`;
    const existingId = this.nodeByExecutionKey.get(key);
    if (existingId) {
      const existing = this.nodes.get(existingId);
      if (existing) return existing;
    }

    const now = new Date().toISOString();
    const node: NodeInstanceRecord = {
      id: input.id,
      processInstanceId: input.processInstanceId,
      executionKey: input.executionKey,
      nodeId: input.nodeId,
      nodeType: input.nodeType,
      name: input.name,
      status: input.status,
      startedAt: now,
      ...(input.status === 'completed' ? { endedAt: now } : {})
    };
    this.nodes.set(node.id, node);
    this.nodeByExecutionKey.set(key, node.id);
    return node;
  }

  async completeNodeInstance(nodeInstanceId: string) {
    const node = this.nodes.get(nodeInstanceId);
    if (!node) return;
    this.nodes.set(node.id, {
      ...node,
      status: 'completed',
      endedAt: node.endedAt ?? new Date().toISOString()
    });
  }

  async failNodeInstance(nodeInstanceId: string, message: string) {
    const node = this.nodes.get(nodeInstanceId);
    if (!node) return;
    this.nodes.set(node.id, {
      ...node,
      status: 'failed',
      endedAt: new Date().toISOString()
    });
    const instance = this.instances.get(node.processInstanceId);
    if (instance) {
      await this.recordHistory(
        instance.tenantId,
        instance.id,
        'NODE_FAILED',
        undefined,
        { nodeId: node.nodeId, nodeInstanceId, message },
        `node:${nodeInstanceId}:failed`
      );
    }
  }

  async createTasks(inputs: CreateWorkflowTaskInput[]) {
    const now = new Date().toISOString();
    const created: WorkflowTaskRecord[] = [];
    for (const input of inputs) {
      const existing = Array.from(this.tasks.values()).find(
        (task) => task.waitpointTokenId === input.waitpointTokenId
      );
      if (existing) {
        created.push(existing);
        continue;
      }

      const task: WorkflowTaskRecord = {
        id: input.id,
        tenantId: input.tenantId,
        processInstanceId: input.processInstanceId,
        nodeInstanceId: input.nodeInstanceId,
        nodeId: input.nodeId,
        title: input.title,
        status: 'pending',
        ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
        waitpointTokenId: input.waitpointTokenId,
        ...(input.triggerRunId ? { triggerRunId: input.triggerRunId } : {}),
        createdAt: now
      };
      this.tasks.set(task.id, task);
      this.candidates.set(
        task.id,
        input.candidates.map((candidate) => ({
          id: candidate.id,
          taskId: task.id,
          candidateType: candidate.candidateType,
          candidateId: candidate.candidateId,
          snapshot: candidate.snapshot
        }))
      );
      created.push(task);
    }
    return created;
  }

  async listNodeTasks(nodeInstanceId: string) {
    return Array.from(this.tasks.values())
      .filter((task) => task.nodeInstanceId === nodeInstanceId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async cancelActiveNodeTasks(nodeInstanceId: string, exceptTaskId?: string) {
    const now = new Date().toISOString();
    for (const task of Array.from(this.tasks.values())) {
      if (
        task.nodeInstanceId === nodeInstanceId &&
        task.id !== exceptTaskId &&
        (task.status === 'pending' || task.status === 'claimed')
      ) {
        this.tasks.set(task.id, {
          ...task,
          status: 'canceled',
          completedAt: task.completedAt ?? now
        });
      }
    }
  }

  async createCcItems(inputs: CreateWorkflowCcInput[]) {
    const now = new Date().toISOString();
    const items = inputs.map((input): WorkflowCcRecord => ({
      id: input.id,
      tenantId: input.tenantId,
      processInstanceId: input.processInstanceId,
      nodeInstanceId: input.nodeInstanceId,
      nodeId: input.nodeId,
      title: input.title,
      ...(input.recipientId ? { recipientId: input.recipientId } : {}),
      ...(input.candidateType ? { candidateType: input.candidateType } : {}),
      ...(input.candidateId ? { candidateId: input.candidateId } : {}),
      createdAt: now
    }));
    for (const item of items) {
      const current = this.ccItems.get(item.processInstanceId) ?? [];
      if (!current.some((existing) => existing.id === item.id)) {
        this.ccItems.set(item.processInstanceId, [...current, item]);
      }
    }
    return items;
  }

  async getVariables(instanceId: string) {
    return Object.fromEntries((this.variables.get(instanceId) ?? []).map((variable) => [variable.key, variable.value]));
  }

  async recordHistory(
    tenantId: string,
    instanceId: string,
    eventType: string,
    operatorId: string | undefined,
    payload: Record<string, unknown>,
    idempotencyKey?: string
  ) {
    if (idempotencyKey) {
      const key = `${instanceId}:${idempotencyKey}`;
      if (this.historyKeys.has(key)) return;
      this.historyKeys.add(key);
    }

    const event: WorkflowHistoryEventRecord = {
      id: randomUUID(),
      tenantId,
      processInstanceId: instanceId,
      eventType,
      ...(operatorId ? { operatorId } : {}),
      payload,
      createdAt: new Date().toISOString()
    };
    this.history.set(instanceId, [...(this.history.get(instanceId) ?? []), event]);
  }

  async setInstanceStatus(
    instanceId: string,
    status: Extract<ProcessInstanceStatus, 'approved' | 'rejected' | 'failed'>,
    payload: Record<string, unknown> = {}
  ) {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new NotFoundException('Workflow instance not found.');
    if (instance.status !== 'running' && instance.status !== status) return;

    await this.setClosedStatus(instanceId, status);
    const eventType =
      status === 'approved' ? 'PROCESS_COMPLETED' : status === 'rejected' ? 'PROCESS_REJECTED' : 'PROCESS_FAILED';
    await this.recordHistory(
      instance.tenantId,
      instance.id,
      eventType,
      undefined,
      { status, ...payload },
      `process:${instance.id}:${status}`
    );
  }

  private async getMutableTaskContext(
    taskId: string,
    actor: RuntimeActor,
    options: { allowUnassigned?: boolean } = {}
  ) {
    const task = this.tasks.get(taskId);
    if (!task) throw new NotFoundException('Workflow task not found.');
    const instance = this.instances.get(task.processInstanceId);
    if (!instance) throw new NotFoundException('Workflow instance not found.');
    const candidates = this.candidates.get(task.id) ?? [];
    assertTaskMutable(task, instance, actor, candidates);
    if (!canActorOperateTask(task, candidates, actor, options)) {
      throw new BadRequestException('Workflow task cannot be operated by current user.');
    }
    return { task, instance, candidates };
  }

  private mergeVariables(instanceId: string, values: Record<string, unknown>) {
    const current = this.variables.get(instanceId) ?? [];
    const byKey = new Map(current.map((variable) => [variable.key, variable]));
    const now = new Date().toISOString();
    for (const [key, value] of Object.entries(values)) {
      byKey.set(key, {
        id: byKey.get(key)?.id ?? randomUUID(),
        processInstanceId: instanceId,
        key,
        value,
        valueType: inferVariableType(value),
        updatedAt: now
      });
    }
    this.variables.set(instanceId, Array.from(byKey.values()));
  }

  private recordComment(
    instance: ProcessInstanceRecord,
    task: WorkflowTaskRecord | undefined,
    action: string,
    comment: string,
    actor: RuntimeActor
  ) {
    if (!comment.trim()) return;
    const record: WorkflowCommentRecord = {
      id: randomUUID(),
      tenantId: instance.tenantId,
      processInstanceId: instance.id,
      ...(task ? { taskId: task.id, nodeId: task.nodeId } : {}),
      action,
      ...(actor.userId ? { operatorId: actor.userId } : {}),
      comment,
      createdAt: new Date().toISOString()
    };
    this.comments.set(instance.id, [...(this.comments.get(instance.id) ?? []), record]);
  }

  private async cancelActiveTasks(processInstanceId: string, exceptTaskId?: string) {
    const now = new Date().toISOString();
    for (const task of Array.from(this.tasks.values())) {
      if (
        task.processInstanceId === processInstanceId &&
        task.id !== exceptTaskId &&
        (task.status === 'pending' || task.status === 'claimed')
      ) {
        this.tasks.set(task.id, {
          ...task,
          status: 'canceled',
          completedAt: task.completedAt ?? now
        });
      }
    }
  }

  private async setClosedStatus(
    instanceId: string,
    status: Extract<ProcessInstanceStatus, 'approved' | 'rejected' | 'canceled' | 'terminated' | 'failed'>
  ) {
    const instance = this.instances.get(instanceId);
    if (!instance) throw new NotFoundException('Workflow instance not found.');
    this.instances.set(instanceId, {
      ...instance,
      status,
      endedAt: instance.endedAt ?? new Date().toISOString()
    });
  }
}

function assertTaskMutable(
  task: WorkflowTaskRecord,
  instance: ProcessInstanceRecord,
  actor: RuntimeActor,
  candidates: WorkflowTaskCandidateRecord[]
) {
  if (task.status === 'completed') {
    throw new BadRequestException('Workflow task is already completed.');
  }
  if (task.status === 'canceled') {
    throw new BadRequestException('Workflow task is canceled.');
  }
  if (task.tenantId !== actor.tenantId) {
    throw new BadRequestException('Workflow task does not belong to current tenant.');
  }
  if (instance.status !== 'running') {
    throw new BadRequestException('Workflow instance is not running.');
  }
  if (!canActorSeeTask(task, candidates, actor)) {
    throw new BadRequestException('Workflow task cannot be operated by current user.');
  }
}
