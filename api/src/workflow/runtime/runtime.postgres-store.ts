import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import type {
  AddSignTaskInput,
  CloseInstanceResult,
  CreateNodeInstanceInput,
  CreateProcessInstanceInput,
  CreateWorkflowCcInput,
  CreateWorkflowTaskInput,
  PreparedTaskDecision,
  PrepareTaskDecisionInput,
  WorkflowTaskDecision,
  WorkflowRuntimeStore
} from './runtime.engine.types';
import type { WorkflowCcQuery, WorkflowInstanceQuery, WorkflowTaskQuery } from './runtime.dto';
import {
  canActorOperateTask,
  canActorSeeTask,
  inferVariableType,
  toIso
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
import { retryTransientPostgresOperation } from '../common/postgres-resilience';
import {
  createWorkflowPostgresPool,
  withHealthyPostgresClient
} from '../common/postgres-pool';

export class PostgresWorkflowRuntimeStore implements WorkflowRuntimeStore {
  constructor(private readonly database: RuntimeDatabase) {}

  async createInstance(input: CreateProcessInstanceInput) {
    return this.database.withClient(async (client) => {
      await client.query('begin');
      try {
        const duplicate = await client.query<{ id: string }>(
          `select id from public.wf_process_instance
          where account_id = $1 and business_key = $2 and status = 'running'
          limit 1`,
          [input.tenantId, input.businessKey]
        );
        if (duplicate.rows[0]) {
          throw new BadRequestException('A running workflow instance already exists for this business key.');
        }

        const result = await client.query<ProcessInstanceRow>(
          `insert into public.wf_process_instance (
            id, account_id, definition_id, definition_version, business_key,
            document_type, document_id, title, status, initiator_id, trigger_task_id
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'running', $9, 'workflow.instance.run')
          returning *`,
          [
            input.id,
            input.tenantId,
            input.definitionId,
            input.definitionVersion,
            input.businessKey,
            input.documentType ?? null,
            input.documentId ?? null,
            input.title,
            input.initiatorId ?? null
          ]
        );

        for (const [key, value] of Object.entries(input.variables)) {
          await client.query(
            `insert into public.wf_variable (process_instance_id, key, value, value_type)
            values ($1, $2, $3::jsonb, $4)
            on conflict (process_instance_id, key) do update set
              value = excluded.value,
              value_type = excluded.value_type,
              updated_at = timezone('utc'::text, now())`,
            [input.id, key, JSON.stringify(value), inferVariableType(value)]
          );
        }

        if (input.documentType && input.documentId) {
          await client.query(
            `insert into public.wf_document_binding (
              account_id, document_type, document_id, process_instance_id, status
            ) values ($1, $2, $3, $4, 'running')
            on conflict (account_id, document_type, document_id, process_instance_id)
            do update set status = excluded.status`,
            [input.tenantId, input.documentType, input.documentId, input.id]
          );
        }

        await insertHistory(client, {
          tenantId: input.tenantId,
          processInstanceId: input.id,
          eventType: 'PROCESS_STARTED',
          operatorId: input.initiatorId,
          payload: {
            definitionId: input.definitionId,
            businessKey: input.businessKey,
            documentType: input.documentType,
            documentId: input.documentId
          },
          idempotencyKey: `process:${input.id}:started`
        });

        await client.query('commit');
        return mapProcessInstance(result.rows[0]);
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  async setTriggerRun(instanceId: string, triggerRunId: string) {
    await this.database.query(
      `update public.wf_process_instance
      set trigger_run_id = $2
      where id = $1`,
      [instanceId, triggerRunId]
    );
  }

  async deleteUnstartedInstance(instanceId: string) {
    await this.database.query(
      `delete from public.wf_process_instance
      where id = $1 and trigger_run_id is null`,
      [instanceId]
    );
  }

  async listInstances(query: WorkflowInstanceQuery = {}) {
    const values: unknown[] = [];
    const conditions: string[] = [];
    addCondition(conditions, values, 'account_id', query.tenantId);
    addCondition(conditions, values, 'status', query.status);
    addCondition(conditions, values, 'document_type', query.documentType);
    addCondition(conditions, values, 'document_id', query.documentId);

    const result = await this.database.query<ProcessInstanceRow>(
      `select * from public.wf_process_instance
      ${conditions.length ? `where ${conditions.join(' and ')}` : ''}
      order by started_at desc
      limit 200`,
      values
    );
    return result.rows.map(mapProcessInstance);
  }

  async listStarted(actor: RuntimeActor, query: WorkflowInstanceQuery = {}) {
    const instances = await this.listInstances({
      ...query,
      tenantId: actor.tenantId
    });
    return instances.filter((instance) => !actor.userId || instance.initiatorId === actor.userId);
  }

  async getInstance(instanceId: string): Promise<ProcessInstanceDetail> {
    const instanceResult = await this.database.query<ProcessInstanceRow>(
      'select * from public.wf_process_instance where id = $1',
      [instanceId]
    );
    const instance = instanceResult.rows[0];
    if (!instance) throw new NotFoundException('Workflow instance not found.');

    const [variables, comments, ccItems, nodeInstances, tasks] = await Promise.all([
      this.database.query<VariableRow>(
        'select * from public.wf_variable where process_instance_id = $1 order by key',
        [instanceId]
      ),
      this.database.query<CommentRow>(
        'select * from public.wf_comment where process_instance_id = $1 order by created_at',
        [instanceId]
      ),
      this.database.query<CcRow>(
        'select * from public.wf_cc where process_instance_id = $1 order by created_at',
        [instanceId]
      ),
      this.database.query<NodeInstanceRow>(
        'select * from public.wf_node_instance where process_instance_id = $1 order by started_at nulls last',
        [instanceId]
      ),
      this.database.query<TaskRow>(
        'select * from public.wf_task where process_instance_id = $1 order by created_at',
        [instanceId]
      )
    ]);

    return {
      ...mapProcessInstance(instance),
      variables: variables.rows.map(mapVariable),
      comments: comments.rows.map(mapComment),
      ccItems: ccItems.rows.map(mapCc),
      nodeInstances: nodeInstances.rows.map(mapNodeInstance),
      tasks: tasks.rows.map(mapTask)
    };
  }

  async listTasks(query: WorkflowTaskQuery = {}) {
    const values: unknown[] = [];
    const conditions: string[] = [];
    addCondition(conditions, values, 'account_id', query.tenantId);
    addCondition(conditions, values, 'assignee_id', query.assigneeId);
    addCondition(conditions, values, 'status', query.status);

    const result = await this.database.query<TaskRow>(
      `select * from public.wf_task
      ${conditions.length ? `where ${conditions.join(' and ')}` : ''}
      order by created_at desc
      limit 200`,
      values
    );
    return result.rows.map(mapTask);
  }

  async listTodoTasks(actor: RuntimeActor, query: WorkflowTaskQuery = {}) {
    const tasks = await this.listTasks({
      ...query,
      tenantId: actor.tenantId
    });
    const visible = await this.filterVisibleTasks(
      tasks.filter((task) => task.status === 'pending' || task.status === 'claimed'),
      actor
    );
    return visible;
  }

  async listDoneTasks(actor: RuntimeActor, query: WorkflowTaskQuery = {}) {
    const tasks = await this.listTasks({
      ...query,
      tenantId: actor.tenantId,
      status: query.status ?? 'completed'
    });
    return this.filterVisibleTasks(tasks, actor);
  }

  async listCc(actor: RuntimeActor, query: WorkflowCcQuery = {}) {
    const tenantId = actor.tenantId;
    const userId = actor.userId;
    const values: unknown[] = [tenantId];
    const conditions = ['account_id = $1'];

    if (userId) {
      values.push(userId);
      conditions.push(
        `(recipient_id = $${values.length} or candidate_id = $${values.length} or candidate_type <> 'user')`
      );
    }

    const result = await this.database.query<CcRow>(
      `select * from public.wf_cc
      where ${conditions.join(' and ')}
      order by created_at desc
      limit 200`,
      values
    );
    return result.rows.map(mapCc);
  }

  async getTask(taskId: string) {
    const task = await this.readTask(taskId);
    const candidates = await this.readTaskCandidates(task.id);
    return {
      ...task,
      candidates
    };
  }

  async getTimeline(instanceId: string) {
    const exists = await this.database.query<{ id: string }>(
      'select id from public.wf_process_instance where id = $1',
      [instanceId]
    );
    if (!exists.rows[0]) throw new NotFoundException('Workflow instance not found.');

    const result = await this.database.query<HistoryRow>(
      `select * from public.wf_history_event
      where process_instance_id = $1
      order by created_at`,
      [instanceId]
    );
    return result.rows.map(mapHistory);
  }

  async prepareTaskDecision(input: PrepareTaskDecisionInput): Promise<PreparedTaskDecision> {
    return this.database.withClient(async (client) => {
      await client.query('begin');
      try {
        const context = await this.readTaskContextForUpdate(client, input.taskId);
        const { task, instance, candidates } = context;

        if (task.status === 'completed' && task.decisionPayload?.action === input.action) {
          if (!task.waitpointTokenId) {
            throw new BadRequestException('Workflow task is not bound to a Trigger.dev waitpoint.');
          }

          await client.query('commit');
          return {
            task,
            instance,
            tokenId: task.waitpointTokenId,
            decision: task.decisionPayload as WorkflowTaskDecision,
            alreadyPrepared: true
          };
        }

        assertTaskMutable(task, instance, input.actor, candidates);
        if (!canActorOperateTask(task, candidates, input.actor)) {
          throw new BadRequestException('Workflow task cannot be operated by current user.');
        }
        if (!task.waitpointTokenId) {
          throw new BadRequestException('Workflow task is not bound to a Trigger.dev waitpoint.');
        }

        const decision = {
          action: input.action,
          taskId: task.id,
          nodeId: task.nodeId,
          operatorId: input.actor.userId,
          comment: input.comment ?? '',
          variables: input.variables ?? {},
          targetNodeId: input.targetNodeId
        } as const;

        await client.query(
          `update public.wf_task
          set status = 'completed',
              assignee_id = coalesce(assignee_id, $2),
              completed_at = timezone('utc'::text, now()),
              decision_payload = $3::jsonb
          where id = $1`,
          [task.id, input.actor.userId ?? null, JSON.stringify(decision)]
        );

        if (input.action === 'approve') {
          await upsertVariables(client, instance.id, input.variables ?? {});
          await insertComment(client, instance, task, 'approve', input.comment ?? '', input.actor);
          await insertHistory(client, {
            tenantId: instance.tenantId,
            processInstanceId: instance.id,
            eventType: 'TASK_COMPLETED',
            operatorId: input.actor.userId,
            payload: {
              taskId: task.id,
              nodeId: task.nodeId,
              comment: input.comment ?? ''
            },
            idempotencyKey: `task:${task.id}:completed`
          });
        } else {
          await this.cancelActiveTasksInClient(client, instance.id, task.id);
          await this.completeNodeInstanceInClient(client, task.nodeInstanceId);
          await this.closeInstanceInClient(client, instance.id, 'rejected');
          await insertComment(client, instance, task, 'reject', input.comment ?? '', input.actor);
          await insertHistory(client, {
            tenantId: instance.tenantId,
            processInstanceId: instance.id,
            eventType: 'TASK_REJECTED',
            operatorId: input.actor.userId,
            payload: {
              taskId: task.id,
              nodeId: task.nodeId,
              targetNodeId: input.targetNodeId,
              comment: input.comment ?? ''
            },
            idempotencyKey: `task:${task.id}:rejected`
          });
          await insertHistory(client, {
            tenantId: instance.tenantId,
            processInstanceId: instance.id,
            eventType: 'PROCESS_REJECTED',
            operatorId: input.actor.userId,
            payload: {
              status: 'rejected',
              taskId: task.id
            },
            idempotencyKey: `process:${instance.id}:rejected`
          });
        }

        await client.query('commit');
        return {
          task,
          instance,
          tokenId: task.waitpointTokenId,
          decision,
          alreadyPrepared: false
        };
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  async markWaitpointCompleted(taskId: string) {
    await this.database.query(
      `update public.wf_task
      set completed_at = coalesce(completed_at, timezone('utc'::text, now()))
      where id = $1`,
      [taskId]
    );
  }

  async recordWaitpointFailure(taskId: string, message: string) {
    const context = await this.readTaskContext(taskId);
    await this.recordHistory(
      context.instance.tenantId,
      context.instance.id,
      'WAITPOINT_COMPLETE_FAILED',
      undefined,
      { taskId, message },
      `task:${taskId}:waitpoint-failed:${message}`
    );
  }

  async claimTask(taskId: string, actor: RuntimeActor) {
    return this.database.withClient(async (client) => {
      await client.query('begin');
      try {
        const context = await this.readTaskContextForUpdate(client, taskId);
        const { task, instance, candidates } = context;
        assertTaskMutable(task, instance, actor, candidates);

        if (task.assigneeId && task.assigneeId !== actor.userId) {
          throw new BadRequestException('Workflow task has been assigned to another user.');
        }
        if (!canActorOperateTask(task, candidates, actor, { allowUnassigned: true })) {
          throw new BadRequestException('Workflow task cannot be claimed by current user.');
        }

        await client.query(
          `update public.wf_task
          set status = 'claimed', assignee_id = $2, claimed_at = timezone('utc'::text, now())
          where id = $1`,
          [task.id, actor.userId ?? null]
        );
        await insertHistory(client, {
          tenantId: instance.tenantId,
          processInstanceId: instance.id,
          eventType: 'TASK_CLAIMED',
          operatorId: actor.userId,
          payload: {
            taskId: task.id,
            nodeId: task.nodeId,
            assigneeId: actor.userId
          }
        });

        await client.query('commit');
        return this.getTask(task.id);
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  async transferTask(
    taskId: string,
    targetUserId: string,
    comment: string | undefined,
    actor: RuntimeActor
  ) {
    return this.database.withClient(async (client) => {
      await client.query('begin');
      try {
        const context = await this.readTaskContextForUpdate(client, taskId);
        const { task, instance, candidates } = context;
        assertTaskMutable(task, instance, actor, candidates);
        if (!canActorOperateTask(task, candidates, actor, { allowUnassigned: true })) {
          throw new BadRequestException('Workflow task cannot be operated by current user.');
        }

        const nextAssignee = targetUserId.trim();
        await assertActiveAccountUsers(client, instance.tenantId, [nextAssignee]);
        await client.query(
          `update public.wf_task
          set status = 'pending', assignee_id = $2, claimed_at = null
          where id = $1`,
          [task.id, nextAssignee]
        );
        await client.query('delete from public.wf_task_candidate where task_id = $1', [task.id]);
        await client.query(
          `insert into public.wf_task_candidate (task_id, candidate_type, candidate_id, snapshot)
          values ($1, 'user', $2, $3::jsonb)`,
          [task.id, nextAssignee, JSON.stringify({ id: nextAssignee, transferredBy: actor.userId })]
        );
        await insertComment(client, instance, task, 'transfer', comment ?? '', actor);
        await insertHistory(client, {
          tenantId: instance.tenantId,
          processInstanceId: instance.id,
          eventType: 'TASK_TRANSFERRED',
          operatorId: actor.userId,
          payload: {
            taskId: task.id,
            nodeId: task.nodeId,
            fromUserId: task.assigneeId,
            toUserId: nextAssignee
          }
        });

        await client.query('commit');
        return this.getTask(task.id);
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  async addSignTask(input: AddSignTaskInput) {
    return this.database.withClient(async (client) => {
      await client.query('begin');
      try {
        const context = await this.readTaskContextForUpdate(client, input.sourceTaskId);
        const { task, instance, candidates } = context;
        assertTaskMutable(task, instance, input.actor, candidates);
        if (!canActorOperateTask(task, candidates, input.actor, { allowUnassigned: true })) {
          throw new BadRequestException('Workflow task cannot be operated by current user.');
        }

        const taskId = randomUUID();
        const targetUserId = input.targetUserId.trim();
        await assertActiveAccountUsers(client, instance.tenantId, [targetUserId]);
        const result = await client.query<TaskRow>(
          `insert into public.wf_task (
            id, account_id, process_instance_id, node_instance_id, node_id,
            title, status, assignee_id, waitpoint_token_id
          ) values ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
          returning *`,
          [
            taskId,
            task.tenantId,
            task.processInstanceId,
            task.nodeInstanceId,
            task.nodeId,
            `${task.title} - 加签`,
            targetUserId,
            input.tokenId
          ]
        );
        await client.query(
          `insert into public.wf_task_candidate (task_id, candidate_type, candidate_id, snapshot)
          values ($1, 'user', $2, $3::jsonb)`,
          [taskId, targetUserId, JSON.stringify({ id: targetUserId, addedBy: input.actor.userId })]
        );
        await insertComment(client, instance, task, 'addSign', input.comment ?? '', input.actor);
        await insertHistory(client, {
          tenantId: instance.tenantId,
          processInstanceId: instance.id,
          eventType: 'TASK_ADD_SIGNED',
          operatorId: input.actor.userId,
          payload: {
            taskId: task.id,
            signTaskId: taskId,
            nodeId: task.nodeId,
            targetUserId
          }
        });

        await client.query('commit');
        return {
          ...mapTask(result.rows[0]),
          candidates: await this.readTaskCandidates(taskId)
        };
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  async closeInstance(
    instanceId: string,
    status: 'canceled' | 'terminated',
    eventType: string,
    comment: string,
    actor: RuntimeActor
  ): Promise<CloseInstanceResult> {
    return this.database.withClient(async (client) => {
      await client.query('begin');
      try {
        const result = await client.query<ProcessInstanceRow>(
          'select * from public.wf_process_instance where id = $1 for update',
          [instanceId]
        );
        const row = result.rows[0];
        if (!row) throw new NotFoundException('Workflow instance not found.');
        const instance = mapProcessInstance(row);

        if (instance.tenantId !== actor.tenantId) {
          throw new BadRequestException('Workflow instance does not belong to current tenant.');
        }
        if (instance.status !== 'running') {
          throw new BadRequestException('Workflow instance is not running.');
        }
        if (eventType === 'PROCESS_WITHDRAWN' && instance.initiatorId && actor.userId && instance.initiatorId !== actor.userId) {
          throw new BadRequestException('Only workflow initiator can withdraw this instance.');
        }

        await this.closeInstanceInClient(client, instance.id, status);
        await this.cancelActiveTasksInClient(client, instance.id);
        await client.query(
          `update public.wf_node_instance
          set status = 'skipped', ended_at = coalesce(ended_at, timezone('utc'::text, now()))
          where process_instance_id = $1 and status in ('created', 'running', 'waiting')`,
          [instance.id]
        );
        await insertComment(client, instance, undefined, eventType, comment, actor);
        await insertHistory(client, {
          tenantId: instance.tenantId,
          processInstanceId: instance.id,
          eventType,
          operatorId: actor.userId,
          payload: { status, comment },
          idempotencyKey: `process:${instance.id}:${status}`
        });

        await client.query('commit');
        return {
          instance: await this.getInstance(instance.id),
          triggerRunId: instance.triggerRunId
        };
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  async isInstanceRunning(instanceId: string) {
    const result = await this.database.query<{ status: ProcessInstanceStatus }>(
      'select status from public.wf_process_instance where id = $1',
      [instanceId]
    );
    return result.rows[0]?.status === 'running';
  }

  async createNodeInstance(input: CreateNodeInstanceInput) {
    const result = await this.database.query<NodeInstanceRow>(
      `insert into public.wf_node_instance (
        id, process_instance_id, execution_key, node_id, node_type, name, status, started_at,
        ended_at
      ) values ($1, $2, $3, $4, $5, $6, $7, timezone('utc'::text, now()),
        case when $7 = 'completed' then timezone('utc'::text, now()) else null end
      )
      on conflict (process_instance_id, execution_key)
      where execution_key is not null
      do update set
        name = excluded.name
      returning *`,
      [
        input.id,
        input.processInstanceId,
        input.executionKey,
        input.nodeId,
        input.nodeType,
        input.name,
        input.status
      ]
    );
    return mapNodeInstance(result.rows[0]);
  }

  async completeNodeInstance(nodeInstanceId: string) {
    await this.completeNodeInstanceInClient(this.database, nodeInstanceId);
  }

  async failNodeInstance(nodeInstanceId: string, message: string) {
    const node = await this.database.query<NodeInstanceRow>(
      `update public.wf_node_instance
      set status = 'failed', ended_at = timezone('utc'::text, now())
      where id = $1
      returning *`,
      [nodeInstanceId]
    );
    const nodeRow = node.rows[0];
    if (nodeRow) {
      const instance = await this.getProcessInstance(nodeRow.process_instance_id);
      await this.recordHistory(
        instance.tenantId,
        instance.id,
        'NODE_FAILED',
        undefined,
        { nodeId: nodeRow.node_id, nodeInstanceId, message },
        `node:${nodeInstanceId}:failed`
      );
    }
  }

  async createTasks(inputs: CreateWorkflowTaskInput[]) {
    await assertAccountUsersByTenant(
      this.database,
      inputs.map((input) => ({
        tenantId: input.tenantId,
        userIds: [
          input.assigneeId,
          ...input.candidates
            .filter((candidate) => candidate.candidateType === 'user')
            .map((candidate) => candidate.candidateId)
        ]
      }))
    );

    const tasks: WorkflowTaskRecord[] = [];
    for (const input of inputs) {
      const result = await this.database.query<TaskRow>(
        `insert into public.wf_task (
          id, account_id, process_instance_id, node_instance_id, node_id,
          title, status, assignee_id, waitpoint_token_id, trigger_run_id
        ) values ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)
        on conflict (waitpoint_token_id)
        where waitpoint_token_id is not null
        do update set title = excluded.title
        returning *`,
        [
          input.id,
          input.tenantId,
          input.processInstanceId,
          input.nodeInstanceId,
          input.nodeId,
          input.title,
          input.assigneeId ?? null,
          input.waitpointTokenId,
          input.triggerRunId ?? null
        ]
      );
      for (const candidate of input.candidates) {
        await this.database.query(
          `insert into public.wf_task_candidate (
            id, task_id, candidate_type, candidate_id, snapshot
          ) values ($1, $2, $3, $4, $5::jsonb)
          on conflict (task_id, candidate_type, candidate_id) do update set snapshot = excluded.snapshot`,
          [
            candidate.id,
            result.rows[0].id,
            candidate.candidateType,
            candidate.candidateId,
            JSON.stringify(candidate.snapshot)
          ]
        );
      }
      tasks.push(mapTask(result.rows[0]));
    }
    return tasks;
  }

  async listNodeTasks(nodeInstanceId: string) {
    const result = await this.database.query<TaskRow>(
      'select * from public.wf_task where node_instance_id = $1 order by created_at',
      [nodeInstanceId]
    );
    return result.rows.map(mapTask);
  }

  async cancelActiveNodeTasks(nodeInstanceId: string, exceptTaskId?: string) {
    await this.database.query(
      `update public.wf_task
      set status = 'canceled', completed_at = coalesce(completed_at, timezone('utc'::text, now()))
      where node_instance_id = $1
        and ($2::uuid is null or id <> $2::uuid)
        and status in ('pending', 'claimed')`,
      [nodeInstanceId, exceptTaskId ?? null]
    );
  }

  async createCcItems(inputs: CreateWorkflowCcInput[]) {
    await assertAccountUsersByTenant(
      this.database,
      inputs.map((input) => ({
        tenantId: input.tenantId,
        userIds: [
          input.recipientId,
          input.candidateType === 'user' ? input.candidateId : undefined
        ]
      }))
    );

    const items: WorkflowCcRecord[] = [];
    for (const input of inputs) {
      const result = await this.database.query<CcRow>(
        `insert into public.wf_cc (
          id, account_id, process_instance_id, node_instance_id, node_id,
          title, recipient_id, candidate_type, candidate_id
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        on conflict (id) do update set title = excluded.title
        returning *`,
        [
          input.id,
          input.tenantId,
          input.processInstanceId,
          input.nodeInstanceId,
          input.nodeId,
          input.title,
          input.recipientId ?? null,
          input.candidateType ?? null,
          input.candidateId ?? null
        ]
      );
      items.push(mapCc(result.rows[0]));
    }
    return items;
  }

  async getVariables(instanceId: string) {
    const result = await this.database.query<VariableRow>(
      'select * from public.wf_variable where process_instance_id = $1',
      [instanceId]
    );
    return Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
  }

  async recordHistory(
    tenantId: string,
    instanceId: string,
    eventType: string,
    operatorId: string | undefined,
    payload: Record<string, unknown>,
    idempotencyKey?: string
  ) {
    await insertHistory(this.database, {
      tenantId,
      processInstanceId: instanceId,
      eventType,
      operatorId,
      payload,
      idempotencyKey
    });
  }

  async setInstanceStatus(
    instanceId: string,
    status: Extract<ProcessInstanceStatus, 'approved' | 'rejected' | 'failed'>,
    payload: Record<string, unknown> = {}
  ) {
    const instance = await this.getProcessInstance(instanceId);
    const result = await this.database.query<ProcessInstanceRow>(
      `update public.wf_process_instance
      set status = $2, ended_at = coalesce(ended_at, timezone('utc'::text, now()))
      where id = $1 and status = 'running'
      returning *`,
      [instanceId, status]
    );
    if (!result.rows[0] && status !== instance.status) return;

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
    await this.database.query(
      `update public.wf_document_binding
      set status = $2
      where process_instance_id = $1`,
      [instanceId, status]
    );
  }

  private async filterVisibleTasks(tasks: WorkflowTaskRecord[], actor: RuntimeActor) {
    if (!actor.userId) return tasks;
    const visible: WorkflowTaskRecord[] = [];
    for (const task of tasks) {
      const candidates = await this.readTaskCandidates(task.id);
      if (canActorSeeTask(task, candidates, actor)) visible.push(task);
    }
    return visible;
  }

  private async readTask(taskId: string) {
    const result = await this.database.query<TaskRow>('select * from public.wf_task where id = $1', [taskId]);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Workflow task not found.');
    return mapTask(row);
  }

  private async readTaskCandidates(taskId: string) {
    const result = await this.database.query<CandidateRow>(
      'select * from public.wf_task_candidate where task_id = $1 order by id',
      [taskId]
    );
    return result.rows.map(mapCandidate);
  }

  private async readTaskContext(taskId: string) {
    const task = await this.readTask(taskId);
    const instance = await this.getProcessInstance(task.processInstanceId);
    const candidates = await this.readTaskCandidates(task.id);
    return { task, instance, candidates };
  }

  private async readTaskContextForUpdate(client: PoolClient, taskId: string) {
    const taskResult = await client.query<TaskRow>(
      'select * from public.wf_task where id = $1 for update',
      [taskId]
    );
    const taskRow = taskResult.rows[0];
    if (!taskRow) throw new NotFoundException('Workflow task not found.');
    const task = mapTask(taskRow);

    const instanceResult = await client.query<ProcessInstanceRow>(
      'select * from public.wf_process_instance where id = $1 for update',
      [task.processInstanceId]
    );
    const instanceRow = instanceResult.rows[0];
    if (!instanceRow) throw new NotFoundException('Workflow instance not found.');

    const candidatesResult = await client.query<CandidateRow>(
      'select * from public.wf_task_candidate where task_id = $1',
      [task.id]
    );
    return {
      task,
      instance: mapProcessInstance(instanceRow),
      candidates: candidatesResult.rows.map(mapCandidate)
    };
  }

  private async getProcessInstance(instanceId: string) {
    const result = await this.database.query<ProcessInstanceRow>(
      'select * from public.wf_process_instance where id = $1',
      [instanceId]
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Workflow instance not found.');
    return mapProcessInstance(row);
  }

  private async cancelActiveTasksInClient(
    client: Queryable,
    processInstanceId: string,
    exceptTaskId?: string
  ) {
    await client.query(
      `update public.wf_task
      set status = 'canceled', completed_at = coalesce(completed_at, timezone('utc'::text, now()))
      where process_instance_id = $1
        and ($2::uuid is null or id <> $2::uuid)
        and status in ('pending', 'claimed')`,
      [processInstanceId, exceptTaskId ?? null]
    );
  }

  private async completeNodeInstanceInClient(
    client: Queryable,
    nodeInstanceId: string
  ) {
    await client.query(
      `update public.wf_node_instance
      set status = 'completed', ended_at = coalesce(ended_at, timezone('utc'::text, now()))
      where id = $1`,
      [nodeInstanceId]
    );
  }

  private async closeInstanceInClient(
    client: Queryable,
    instanceId: string,
    status: 'rejected' | 'canceled' | 'terminated'
  ) {
    await client.query(
      `update public.wf_process_instance
      set status = $2, ended_at = coalesce(ended_at, timezone('utc'::text, now()))
      where id = $1 and status = 'running'`,
      [instanceId, status]
    );
    await client.query(
      `update public.wf_document_binding
      set status = $2
      where process_instance_id = $1`,
      [instanceId, status]
    );
  }
}

type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<T>>;
};

export type RuntimeDatabase = Queryable & {
  withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
};

async function assertAccountUsersByTenant(
  database: Queryable,
  groups: Array<{ tenantId: string; userIds: Array<string | undefined> }>
) {
  const usersByTenant = new Map<string, string[]>();
  for (const group of groups) {
    usersByTenant.set(group.tenantId, [
      ...(usersByTenant.get(group.tenantId) ?? []),
      ...group.userIds.filter((userId): userId is string => Boolean(userId?.trim()))
    ]);
  }

  for (const [tenantId, userIds] of usersByTenant) {
    await assertActiveAccountUsers(database, tenantId, userIds);
  }
}

async function assertActiveAccountUsers(
  database: Queryable,
  tenantId: string,
  userIds: string[]
) {
  const uniqueUserIds = [...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))];
  if (!uniqueUserIds.length) return;
  if (!isUuid(tenantId) || uniqueUserIds.some((userId) => !isUuid(userId))) {
    throw new BadRequestException('Workflow users and account set must use valid UUIDs.');
  }

  const result = await database.query<{ user_id: string }>(
    `select memberships.user_id::text
    from basejump.account_user memberships
    join basejump.accounts accounts on accounts.id = memberships.account_id
    where memberships.account_id = $1::uuid
      and memberships.user_id = any($2::uuid[])
      and accounts.status = 'active'`,
    [tenantId, uniqueUserIds]
  );
  const memberIds = new Set(result.rows.map((row) => row.user_id));
  if (uniqueUserIds.some((userId) => !memberIds.has(userId))) {
    throw new BadRequestException('Every workflow user must belong to the active account set.');
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function createStandalonePostgresWorkflowRuntimeStore(connectionString: string) {
  const pool = createWorkflowPostgresPool(connectionString, {
    max: 2,
    name: 'workflow-trigger-runtime'
  });
  const database: RuntimeDatabase = {
    query: <T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) =>
      retryTransientPostgresOperation(() => pool.query<T>(text, values)),
    withClient: (callback) => withHealthyPostgresClient(pool, callback)
  };
  return {
    store: new PostgresWorkflowRuntimeStore(database),
    close: () => pool.end()
  };
}

type ProcessInstanceRow = QueryResultRow & {
  id: string;
  account_id: string;
  definition_id: string;
  definition_version: number;
  business_key: string;
  document_type: string | null;
  document_id: string | null;
  title: string;
  status: ProcessInstanceStatus;
  initiator_id: string | null;
  trigger_run_id: string | null;
  trigger_task_id: string | null;
  started_at: Date;
  ended_at: Date | null;
};

type NodeInstanceRow = QueryResultRow & {
  id: string;
  process_instance_id: string;
  execution_key: string | null;
  node_id: string;
  node_type: string;
  name: string;
  status: NodeInstanceRecord['status'];
  started_at: Date | null;
  ended_at: Date | null;
};

type TaskRow = QueryResultRow & {
  id: string;
  account_id: string;
  process_instance_id: string;
  node_instance_id: string;
  node_id: string;
  title: string;
  status: WorkflowTaskRecord['status'];
  assignee_id: string | null;
  claimed_at: Date | null;
  due_at: Date | null;
  waitpoint_token_id: string | null;
  trigger_run_id: string | null;
  decision_payload: Record<string, unknown> | null;
  created_at: Date;
  completed_at: Date | null;
};

type CandidateRow = QueryResultRow & {
  id: string;
  task_id: string;
  candidate_type: WorkflowTaskCandidateRecord['candidateType'];
  candidate_id: string;
  snapshot: Record<string, unknown>;
};

type VariableRow = QueryResultRow & {
  id: string;
  process_instance_id: string;
  key: string;
  value: unknown;
  value_type: string;
  updated_at: Date;
};

type HistoryRow = QueryResultRow & {
  id: string;
  account_id: string;
  process_instance_id: string;
  event_type: string;
  operator_id: string | null;
  payload: Record<string, unknown>;
  created_at: Date;
};

type CommentRow = QueryResultRow & {
  id: string;
  account_id: string;
  process_instance_id: string;
  task_id: string | null;
  node_id: string | null;
  action: string;
  operator_id: string | null;
  comment: string;
  created_at: Date;
};

type CcRow = QueryResultRow & {
  id: string;
  account_id: string;
  process_instance_id: string;
  node_instance_id: string;
  node_id: string;
  title: string;
  recipient_id: string | null;
  candidate_type: WorkflowTaskCandidateRecord['candidateType'] | null;
  candidate_id: string | null;
  created_at: Date;
  read_at: Date | null;
};

function addCondition(conditions: string[], values: unknown[], column: string, value: unknown) {
  if (value === undefined || value === null || value === '') return;
  values.push(value);
  conditions.push(`${column} = $${values.length}`);
}

function mapProcessInstance(row: ProcessInstanceRow): ProcessInstanceRecord {
  return {
    id: row.id,
    tenantId: row.account_id,
    definitionId: row.definition_id,
    definitionVersion: row.definition_version,
    businessKey: row.business_key,
    ...(row.document_type ? { documentType: row.document_type } : {}),
    ...(row.document_id ? { documentId: row.document_id } : {}),
    title: row.title,
    status: row.status,
    ...(row.initiator_id ? { initiatorId: row.initiator_id } : {}),
    ...(row.trigger_run_id ? { triggerRunId: row.trigger_run_id } : {}),
    ...(row.trigger_task_id ? { triggerTaskId: row.trigger_task_id } : {}),
    startedAt: row.started_at.toISOString(),
    ...(row.ended_at ? { endedAt: row.ended_at.toISOString() } : {})
  };
}

function mapNodeInstance(row: NodeInstanceRow): NodeInstanceRecord {
  return {
    id: row.id,
    processInstanceId: row.process_instance_id,
    ...(row.execution_key ? { executionKey: row.execution_key } : {}),
    nodeId: row.node_id,
    nodeType: row.node_type,
    name: row.name,
    status: row.status,
    ...(toIso(row.started_at) ? { startedAt: toIso(row.started_at) } : {}),
    ...(toIso(row.ended_at) ? { endedAt: toIso(row.ended_at) } : {})
  };
}

function mapTask(row: TaskRow): WorkflowTaskRecord {
  return {
    id: row.id,
    tenantId: row.account_id,
    processInstanceId: row.process_instance_id,
    nodeInstanceId: row.node_instance_id,
    nodeId: row.node_id,
    title: row.title,
    status: row.status,
    ...(row.assignee_id ? { assigneeId: row.assignee_id } : {}),
    ...(toIso(row.claimed_at) ? { claimedAt: toIso(row.claimed_at) } : {}),
    ...(toIso(row.due_at) ? { dueAt: toIso(row.due_at) } : {}),
    ...(row.waitpoint_token_id ? { waitpointTokenId: row.waitpoint_token_id } : {}),
    ...(row.trigger_run_id ? { triggerRunId: row.trigger_run_id } : {}),
    ...(row.decision_payload ? { decisionPayload: row.decision_payload } : {}),
    createdAt: row.created_at.toISOString(),
    ...(row.completed_at ? { completedAt: row.completed_at.toISOString() } : {})
  };
}

function mapCandidate(row: CandidateRow): WorkflowTaskCandidateRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    candidateType: row.candidate_type,
    candidateId: row.candidate_id,
    snapshot: row.snapshot ?? {}
  };
}

function mapVariable(row: VariableRow): WorkflowVariableRecord {
  return {
    id: row.id,
    processInstanceId: row.process_instance_id,
    key: row.key,
    value: row.value,
    valueType: row.value_type,
    updatedAt: row.updated_at.toISOString()
  };
}

function mapHistory(row: HistoryRow): WorkflowHistoryEventRecord {
  return {
    id: row.id,
    tenantId: row.account_id,
    processInstanceId: row.process_instance_id,
    eventType: row.event_type,
    ...(row.operator_id ? { operatorId: row.operator_id } : {}),
    payload: row.payload ?? {},
    createdAt: row.created_at.toISOString()
  };
}

function mapComment(row: CommentRow): WorkflowCommentRecord {
  return {
    id: row.id,
    tenantId: row.account_id,
    processInstanceId: row.process_instance_id,
    ...(row.task_id ? { taskId: row.task_id } : {}),
    ...(row.node_id ? { nodeId: row.node_id } : {}),
    action: row.action,
    ...(row.operator_id ? { operatorId: row.operator_id } : {}),
    comment: row.comment,
    createdAt: row.created_at.toISOString()
  };
}

function mapCc(row: CcRow): WorkflowCcRecord {
  return {
    id: row.id,
    tenantId: row.account_id,
    processInstanceId: row.process_instance_id,
    nodeInstanceId: row.node_instance_id,
    nodeId: row.node_id,
    title: row.title,
    ...(row.recipient_id ? { recipientId: row.recipient_id } : {}),
    ...(row.candidate_type ? { candidateType: row.candidate_type } : {}),
    ...(row.candidate_id ? { candidateId: row.candidate_id } : {}),
    createdAt: row.created_at.toISOString(),
    ...(row.read_at ? { readAt: row.read_at.toISOString() } : {})
  };
}

async function upsertVariables(
  client: Queryable,
  processInstanceId: string,
  values: Record<string, unknown>
) {
  for (const [key, value] of Object.entries(values)) {
    await client.query(
      `insert into public.wf_variable (process_instance_id, key, value, value_type)
      values ($1, $2, $3::jsonb, $4)
      on conflict (process_instance_id, key) do update set
        value = excluded.value,
        value_type = excluded.value_type,
        updated_at = timezone('utc'::text, now())`,
      [processInstanceId, key, JSON.stringify(value), inferVariableType(value)]
    );
  }
}

async function insertComment(
  client: Queryable,
  instance: ProcessInstanceRecord,
  task: WorkflowTaskRecord | undefined,
  action: string,
  comment: string,
  actor: RuntimeActor
) {
  if (!comment.trim()) return;

  await client.query(
    `insert into public.wf_comment (
      account_id, process_instance_id, task_id, node_id, action, operator_id, comment
    ) values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      instance.tenantId,
      instance.id,
      task?.id ?? null,
      task?.nodeId ?? null,
      action,
      actor.userId ?? null,
      comment
    ]
  );
}

async function insertHistory(
  client: Queryable,
  input: {
    tenantId: string;
    processInstanceId: string;
    eventType: string;
    operatorId?: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  }
) {
  await client.query(
    `insert into public.wf_history_event (
      account_id, process_instance_id, event_type, operator_id, payload, idempotency_key
    ) values ($1, $2, $3, $4, $5::jsonb, $6)
    on conflict (process_instance_id, idempotency_key)
    where idempotency_key is not null
    do nothing`,
    [
      input.tenantId,
      input.processInstanceId,
      input.eventType,
      input.operatorId ?? null,
      JSON.stringify(input.payload),
      input.idempotencyKey ?? null
    ]
  );
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
