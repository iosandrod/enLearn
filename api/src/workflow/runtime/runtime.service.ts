import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DefinitionService } from '../definition/definition.service';
import {
  WORKFLOW_RUNTIME_STORE,
  type WorkflowRuntimeStore,
  type WorkflowTriggerClient
} from './runtime.engine.types';
import type {
  AddSignTaskDto,
  CompleteTaskDto,
  InstanceActionDto,
  RejectTaskDto,
  StartWorkflowInstanceDto,
  TransferTaskDto,
  WorkflowCcQuery,
  WorkflowInstanceQuery,
  WorkflowTaskQuery
} from './runtime.dto';
import type {
  ProcessInstanceRecord,
  RuntimeActor,
  WorkflowTaskRecord
} from './runtime.types';
import { TriggerDevClient } from '../trigger/trigger-dev.client';

const NOTIFICATION_DISPATCH_TASK_ID = 'notification.dispatch';

@Injectable()
export class RuntimeService {
  constructor(
    @Inject(DefinitionService) private readonly definitionService: DefinitionService,
    @Inject(WORKFLOW_RUNTIME_STORE) private readonly store: WorkflowRuntimeStore,
    @Inject(TriggerDevClient) private readonly triggerClient: WorkflowTriggerClient
  ) {}

  async startInstance(dto: StartWorkflowInstanceDto, actor: RuntimeActor) {
    const definition = await this.definitionService.getDefinition(dto.definitionId);
    if (definition.status !== 'active') {
      throw new BadRequestException('Workflow definition is not active.');
    }

    const variables = dto.variables ?? {};
    const instance = await this.store.createInstance({
      id: randomUUID(),
      tenantId: actor.tenantId,
      definitionId: definition.id,
      definitionVersion: definition.version,
      businessKey: dto.businessKey.trim(),
      ...(dto.documentType?.trim() ? { documentType: dto.documentType.trim() } : {}),
      ...(dto.documentId?.trim() ? { documentId: dto.documentId.trim() } : {}),
      title: dto.title.trim(),
      initiatorId: actor.userId,
      variables
    });

    try {
      const run = await this.triggerClient.triggerWorkflow({
        instanceId: instance.id,
        tenantId: instance.tenantId,
        definitionId: definition.id,
        definitionVersion: definition.version,
        title: instance.title,
        ...(actor.userId ? { initiatorId: actor.userId } : {}),
        schema: definition.schema,
        variables
      });
      await this.store.setTriggerRun(instance.id, run.id);
    } catch (error) {
      await this.store.setInstanceStatus(instance.id, 'failed', {
        message: error instanceof Error ? error.message : String(error),
        phase: 'triggerWorkflow'
      });
      throw error;
    }

    return this.store.getInstance(instance.id);
  }

  listInstances(query: WorkflowInstanceQuery = {}) {
    return this.store.listInstances(query);
  }

  listStarted(actor: RuntimeActor, query: WorkflowInstanceQuery = {}) {
    return this.store.listStarted(actor, query);
  }

  getInstance(instanceId: string) {
    return this.store.getInstance(instanceId);
  }

  listTasks(query: WorkflowTaskQuery = {}) {
    return this.store.listTasks(query);
  }

  listTodoTasks(actor: RuntimeActor, query: WorkflowTaskQuery = {}) {
    return this.store.listTodoTasks(actor, query);
  }

  listDoneTasks(actor: RuntimeActor, query: WorkflowTaskQuery = {}) {
    return this.store.listDoneTasks(actor, query);
  }

  listCc(actor: RuntimeActor, query: WorkflowCcQuery = {}) {
    return this.store.listCc(actor, query);
  }

  getTask(taskId: string) {
    return this.store.getTask(taskId);
  }

  async completeTask(taskId: string, dto: CompleteTaskDto, actor: RuntimeActor) {
    const prepared = await this.store.prepareTaskDecision({
      taskId,
      action: 'approve',
      actor,
      comment: dto.comment,
      variables: dto.variables
    });

    try {
      await this.triggerClient.completeWaitpoint(prepared.tokenId, prepared.decision);
      await this.store.markWaitpointCompleted(taskId);
    } catch (error) {
      await this.store.recordWaitpointFailure(
        taskId,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }

    await this.emitApprovalNotification({
      eventType: 'approval.task.completed',
      instance: prepared.instance,
      task: prepared.task,
      actor,
      recipientIds: [prepared.instance.initiatorId],
      idempotencyKey: `approval-task:${prepared.task.id}:completed`,
      payload: {
        title: prepared.task.title,
        taskId: prepared.task.id,
        instanceId: prepared.instance.id,
        nodeId: prepared.task.nodeId,
        operatorId: actor.userId,
        comment: dto.comment ?? '',
        linkUrl: `/dashboard/workflow/instances/${prepared.instance.id}`,
        priority: 'normal'
      }
    });

    return this.store.getInstance(prepared.instance.id);
  }

  async claimTask(taskId: string, actor: RuntimeActor) {
    return this.store.claimTask(taskId, actor);
  }

  async rejectTask(taskId: string, dto: RejectTaskDto, actor: RuntimeActor) {
    const prepared = await this.store.prepareTaskDecision({
      taskId,
      action: 'reject',
      actor,
      comment: dto.comment,
      targetNodeId: dto.targetNodeId
    });

    try {
      await this.triggerClient.completeWaitpoint(prepared.tokenId, prepared.decision);
      await this.store.markWaitpointCompleted(taskId);
    } catch (error) {
      await this.store.recordWaitpointFailure(
        taskId,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }

    await this.emitApprovalNotification({
      eventType: 'approval.task.rejected',
      instance: prepared.instance,
      task: prepared.task,
      actor,
      recipientIds: [prepared.instance.initiatorId],
      idempotencyKey: `approval-task:${prepared.task.id}:rejected`,
      payload: {
        title: prepared.task.title,
        taskId: prepared.task.id,
        instanceId: prepared.instance.id,
        nodeId: prepared.task.nodeId,
        operatorId: actor.userId,
        targetNodeId: dto.targetNodeId,
        comment: dto.comment ?? '',
        linkUrl: `/dashboard/workflow/instances/${prepared.instance.id}`,
        priority: 'high'
      }
    });

    return this.store.getInstance(prepared.instance.id);
  }

  async transferTask(taskId: string, dto: TransferTaskDto, actor: RuntimeActor) {
    const previousTask = await this.store.getTask(taskId);
    const task = await this.store.transferTask(taskId, dto.targetUserId, dto.comment, actor);
    const instance = await this.store.getInstance(task.processInstanceId);
    const targetUserId = dto.targetUserId.trim();

    await this.emitApprovalNotification({
      eventType: 'approval.task.transferred',
      instance,
      task,
      actor,
      recipientIds: [targetUserId],
      idempotencyKey: `approval-task:${task.id}:transferred:${targetUserId}`,
      payload: {
        title: task.title,
        taskId: task.id,
        instanceId: instance.id,
        nodeId: task.nodeId,
        fromUserId: previousTask.assigneeId,
        toUserId: targetUserId,
        operatorId: actor.userId,
        comment: dto.comment ?? '',
        linkUrl: `/dashboard/workflow/tasks/${task.id}`,
        priority: 'normal'
      }
    });

    return task;
  }

  async addSignTask(taskId: string, dto: AddSignTaskDto, actor: RuntimeActor) {
    const sourceTask = await this.store.getTask(taskId);
    const token = await this.triggerClient.createWaitpoint({
      idempotencyKey: `workflow:add-sign:${taskId}:${dto.targetUserId.trim()}`,
      tags: [
        `tenant:${actor.tenantId}`,
        `workflow-task:${taskId}`,
        `add-sign:${dto.targetUserId.trim()}`
      ]
    });
    const task = await this.store.addSignTask({
      sourceTaskId: taskId,
      targetUserId: dto.targetUserId,
      comment: dto.comment,
      tokenId: token.id,
      actor
    });
    const instance = await this.store.getInstance(task.processInstanceId);
    const targetUserId = dto.targetUserId.trim();

    await this.emitApprovalNotification({
      eventType: 'approval.task.add_signed',
      instance,
      task,
      actor,
      recipientIds: [targetUserId],
      idempotencyKey: `approval-task:${task.id}:add-signed`,
      payload: {
        title: task.title,
        taskId: task.id,
        sourceTaskId: sourceTask.id,
        instanceId: instance.id,
        nodeId: task.nodeId,
        targetUserId,
        operatorId: actor.userId,
        comment: dto.comment ?? '',
        linkUrl: `/dashboard/workflow/tasks/${task.id}`,
        priority: 'normal'
      }
    });

    return task;
  }

  async withdrawInstance(instanceId: string, dto: InstanceActionDto, actor: RuntimeActor) {
    const result = await this.store.closeInstance(
      instanceId,
      'canceled',
      'PROCESS_WITHDRAWN',
      dto.comment ?? '',
      actor
    );
    if (result.triggerRunId) {
      await this.triggerClient.cancelRun(result.triggerRunId);
    }
    return result.instance;
  }

  async terminateInstance(instanceId: string, dto: InstanceActionDto, actor: RuntimeActor) {
    const result = await this.store.closeInstance(
      instanceId,
      'terminated',
      'PROCESS_TERMINATED',
      dto.comment ?? '',
      actor
    );
    if (result.triggerRunId) {
      await this.triggerClient.cancelRun(result.triggerRunId);
    }
    return result.instance;
  }

  getTimeline(instanceId: string) {
    return this.store.getTimeline(instanceId);
  }

  private async emitApprovalNotification(input: {
    eventType: string;
    instance: ProcessInstanceRecord;
    task: WorkflowTaskRecord;
    actor: RuntimeActor;
    recipientIds: Array<string | undefined>;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  }) {
    const recipientIds = uniqueIds(input.recipientIds);
    if (!recipientIds.length) return;

    try {
      await this.triggerClient.triggerTask(
        NOTIFICATION_DISPATCH_TASK_ID,
        {
          tenantId: input.instance.tenantId,
          event: {
            tenantId: input.instance.tenantId,
            eventType: input.eventType,
            sourceType: 'workflow_task',
            sourceId: input.task.id,
            actorId: input.actor.userId,
            payload: {
              ...input.payload,
              recipientIds
            },
            idempotencyKey: input.idempotencyKey
          }
        },
        {
          idempotencyKey: `notification:${input.idempotencyKey}`,
          tags: [
            `tenant:${input.instance.tenantId}`,
            `workflow-instance:${input.instance.id}`,
            `notification:${input.eventType}`
          ]
        }
      );
    } catch (error) {
      await this.store.recordHistory(
        input.instance.tenantId,
        input.instance.id,
        'NOTIFICATION_TRIGGER_FAILED',
        input.actor.userId,
        {
          eventType: input.eventType,
          sourceType: 'workflow_task',
          sourceId: input.task.id,
          message: error instanceof Error ? error.message : String(error)
        },
        `notification:${input.idempotencyKey}:trigger-failed`
      );
    }
  }
}

function uniqueIds(ids: Array<string | undefined>) {
  return [
    ...new Set(
      ids
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter(Boolean)
    )
  ];
}
