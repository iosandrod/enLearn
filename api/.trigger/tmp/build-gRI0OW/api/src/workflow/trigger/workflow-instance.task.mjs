import {
  isTransientPostgresError,
  retryTransientPostgresOperation
} from "../../../../chunk-EGIQ65LU.mjs";
import {
  WORKFLOW_INSTANCE_TASK_ID
} from "../../../../chunk-CE3CATGV.mjs";
import {
  require_common
} from "../../../../chunk-GYQGVJTL.mjs";
import {
  Pool
} from "../../../../chunk-OV5RCJTK.mjs";
import {
  task,
  tasks,
  wait
} from "../../../../chunk-ELK4KT3A.mjs";
import "../../../../chunk-JAUVKWWZ.mjs";
import "../../../../chunk-RD3PYEXF.mjs";
import "../../../../chunk-3YJ5QEIB.mjs";
import "../../../../chunk-LL72OHMD.mjs";
import "../../../../chunk-4N4XZL7H.mjs";
import {
  __name,
  __toESM,
  init_esm
} from "../../../../chunk-VDUEJNM7.mjs";

// src/workflow/trigger/workflow-instance.task.ts
init_esm();

// src/workflow/runtime/runtime.postgres-store.ts
init_esm();
var import_common = __toESM(require_common());
import { randomUUID } from "node:crypto";

// src/workflow/runtime/runtime.helpers.ts
init_esm();
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
__name(isRecord, "isRecord");
function readString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
__name(readString, "readString");
function inferVariableType(value) {
  if (value instanceof Date) return "datetime";
  if (typeof value === "string") return Number.isNaN(Date.parse(value)) ? "string" : "datetime";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "json";
}
__name(inferVariableType, "inferVariableType");
function canActorSeeTask(task2, candidates, actor) {
  if (!actor.userId) return true;
  if (task2.assigneeId === actor.userId) return true;
  return candidates.some(
    (candidate) => candidate.candidateType !== "user" || candidate.candidateId === actor.userId
  );
}
__name(canActorSeeTask, "canActorSeeTask");
function canActorOperateTask(task2, candidates, actor, options = {}) {
  if (!actor.userId) return true;
  if (task2.assigneeId) return task2.assigneeId === actor.userId;
  if (options.allowUnassigned) {
    return candidates.some(
      (candidate) => candidate.candidateType !== "user" || candidate.candidateId === actor.userId
    );
  }
  return candidates.some(
    (candidate) => candidate.candidateType === "user" && candidate.candidateId === actor.userId
  );
}
__name(canActorOperateTask, "canActorOperateTask");
function toIso(value) {
  if (!value) return void 0;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
__name(toIso, "toIso");

// src/workflow/runtime/runtime.postgres-store.ts
var PostgresWorkflowRuntimeStore = class {
  constructor(database) {
    this.database = database;
  }
  static {
    __name(this, "PostgresWorkflowRuntimeStore");
  }
  async createInstance(input) {
    return this.database.withClient(async (client) => {
      await client.query("begin");
      try {
        const duplicate = await client.query(
          `select id from public.wf_process_instance
          where tenant_id = $1 and business_key = $2 and status = 'running'
          limit 1`,
          [input.tenantId, input.businessKey]
        );
        if (duplicate.rows[0]) {
          throw new import_common.BadRequestException("A running workflow instance already exists for this business key.");
        }
        const result = await client.query(
          `insert into public.wf_process_instance (
            id, tenant_id, definition_id, definition_version, business_key,
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
              tenant_id, document_type, document_id, process_instance_id, status
            ) values ($1, $2, $3, $4, 'running')
            on conflict (tenant_id, document_type, document_id, process_instance_id)
            do update set status = excluded.status`,
            [input.tenantId, input.documentType, input.documentId, input.id]
          );
        }
        await insertHistory(client, {
          tenantId: input.tenantId,
          processInstanceId: input.id,
          eventType: "PROCESS_STARTED",
          operatorId: input.initiatorId,
          payload: {
            definitionId: input.definitionId,
            businessKey: input.businessKey,
            documentType: input.documentType,
            documentId: input.documentId
          },
          idempotencyKey: `process:${input.id}:started`
        });
        await client.query("commit");
        return mapProcessInstance(result.rows[0]);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    });
  }
  async setTriggerRun(instanceId, triggerRunId) {
    await this.database.query(
      `update public.wf_process_instance
      set trigger_run_id = $2
      where id = $1`,
      [instanceId, triggerRunId]
    );
  }
  async deleteUnstartedInstance(instanceId) {
    await this.database.query(
      `delete from public.wf_process_instance
      where id = $1 and trigger_run_id is null`,
      [instanceId]
    );
  }
  async listInstances(query = {}) {
    const values = [];
    const conditions = [];
    addCondition(conditions, values, "tenant_id", query.tenantId);
    addCondition(conditions, values, "status", query.status);
    addCondition(conditions, values, "document_type", query.documentType);
    addCondition(conditions, values, "document_id", query.documentId);
    const result = await this.database.query(
      `select * from public.wf_process_instance
      ${conditions.length ? `where ${conditions.join(" and ")}` : ""}
      order by started_at desc
      limit 200`,
      values
    );
    return result.rows.map(mapProcessInstance);
  }
  async listStarted(actor, query = {}) {
    const instances = await this.listInstances({
      ...query,
      tenantId: query.tenantId ?? actor.tenantId
    });
    return instances.filter((instance) => !actor.userId || instance.initiatorId === actor.userId);
  }
  async getInstance(instanceId) {
    const instanceResult = await this.database.query(
      "select * from public.wf_process_instance where id = $1",
      [instanceId]
    );
    const instance = instanceResult.rows[0];
    if (!instance) throw new import_common.NotFoundException("Workflow instance not found.");
    const [variables, comments, ccItems, nodeInstances, tasks2] = await Promise.all([
      this.database.query(
        "select * from public.wf_variable where process_instance_id = $1 order by key",
        [instanceId]
      ),
      this.database.query(
        "select * from public.wf_comment where process_instance_id = $1 order by created_at",
        [instanceId]
      ),
      this.database.query(
        "select * from public.wf_cc where process_instance_id = $1 order by created_at",
        [instanceId]
      ),
      this.database.query(
        "select * from public.wf_node_instance where process_instance_id = $1 order by started_at nulls last",
        [instanceId]
      ),
      this.database.query(
        "select * from public.wf_task where process_instance_id = $1 order by created_at",
        [instanceId]
      )
    ]);
    return {
      ...mapProcessInstance(instance),
      variables: variables.rows.map(mapVariable),
      comments: comments.rows.map(mapComment),
      ccItems: ccItems.rows.map(mapCc),
      nodeInstances: nodeInstances.rows.map(mapNodeInstance),
      tasks: tasks2.rows.map(mapTask)
    };
  }
  async listTasks(query = {}) {
    const values = [];
    const conditions = [];
    addCondition(conditions, values, "tenant_id", query.tenantId);
    addCondition(conditions, values, "assignee_id", query.assigneeId);
    addCondition(conditions, values, "status", query.status);
    const result = await this.database.query(
      `select * from public.wf_task
      ${conditions.length ? `where ${conditions.join(" and ")}` : ""}
      order by created_at desc
      limit 200`,
      values
    );
    return result.rows.map(mapTask);
  }
  async listTodoTasks(actor, query = {}) {
    const tasks2 = await this.listTasks({
      ...query,
      tenantId: query.tenantId ?? actor.tenantId
    });
    const visible = await this.filterVisibleTasks(
      tasks2.filter((task2) => task2.status === "pending" || task2.status === "claimed"),
      actor
    );
    return visible;
  }
  async listDoneTasks(actor, query = {}) {
    const tasks2 = await this.listTasks({
      ...query,
      tenantId: query.tenantId ?? actor.tenantId,
      status: query.status ?? "completed"
    });
    return this.filterVisibleTasks(tasks2, actor);
  }
  async listCc(actor, query = {}) {
    const tenantId = query.tenantId ?? actor.tenantId;
    const userId = query.userId ?? actor.userId;
    const values = [tenantId];
    const conditions = ["tenant_id = $1"];
    if (userId) {
      values.push(userId);
      conditions.push(
        `(recipient_id = $${values.length} or candidate_id = $${values.length} or candidate_type <> 'user')`
      );
    }
    const result = await this.database.query(
      `select * from public.wf_cc
      where ${conditions.join(" and ")}
      order by created_at desc
      limit 200`,
      values
    );
    return result.rows.map(mapCc);
  }
  async getTask(taskId) {
    const task2 = await this.readTask(taskId);
    const candidates = await this.readTaskCandidates(task2.id);
    return {
      ...task2,
      candidates
    };
  }
  async getTimeline(instanceId) {
    const exists = await this.database.query(
      "select id from public.wf_process_instance where id = $1",
      [instanceId]
    );
    if (!exists.rows[0]) throw new import_common.NotFoundException("Workflow instance not found.");
    const result = await this.database.query(
      `select * from public.wf_history_event
      where process_instance_id = $1
      order by created_at`,
      [instanceId]
    );
    return result.rows.map(mapHistory);
  }
  async prepareTaskDecision(input) {
    return this.database.withClient(async (client) => {
      await client.query("begin");
      try {
        const context = await this.readTaskContextForUpdate(client, input.taskId);
        const { task: task2, instance, candidates } = context;
        assertTaskMutable(task2, instance, input.actor, candidates);
        if (!canActorOperateTask(task2, candidates, input.actor)) {
          throw new import_common.BadRequestException("Workflow task cannot be operated by current user.");
        }
        if (!task2.waitpointTokenId) {
          throw new import_common.BadRequestException("Workflow task is not bound to a Trigger.dev waitpoint.");
        }
        const decision = {
          action: input.action,
          taskId: task2.id,
          nodeId: task2.nodeId,
          operatorId: input.actor.userId,
          comment: input.comment ?? "",
          variables: input.variables ?? {},
          targetNodeId: input.targetNodeId
        };
        await client.query(
          `update public.wf_task
          set status = 'completed',
              assignee_id = coalesce(assignee_id, $2),
              completed_at = timezone('utc'::text, now()),
              decision_payload = $3::jsonb
          where id = $1`,
          [task2.id, input.actor.userId ?? null, JSON.stringify(decision)]
        );
        if (input.action === "approve") {
          await upsertVariables(client, instance.id, input.variables ?? {});
          await insertComment(client, instance, task2, "approve", input.comment ?? "", input.actor);
          await insertHistory(client, {
            tenantId: instance.tenantId,
            processInstanceId: instance.id,
            eventType: "TASK_COMPLETED",
            operatorId: input.actor.userId,
            payload: {
              taskId: task2.id,
              nodeId: task2.nodeId,
              comment: input.comment ?? ""
            },
            idempotencyKey: `task:${task2.id}:completed`
          });
        } else {
          await this.cancelActiveTasksInClient(client, instance.id, task2.id);
          await this.completeNodeInstanceInClient(client, task2.nodeInstanceId);
          await this.closeInstanceInClient(client, instance.id, "rejected");
          await insertComment(client, instance, task2, "reject", input.comment ?? "", input.actor);
          await insertHistory(client, {
            tenantId: instance.tenantId,
            processInstanceId: instance.id,
            eventType: "TASK_REJECTED",
            operatorId: input.actor.userId,
            payload: {
              taskId: task2.id,
              nodeId: task2.nodeId,
              targetNodeId: input.targetNodeId,
              comment: input.comment ?? ""
            },
            idempotencyKey: `task:${task2.id}:rejected`
          });
          await insertHistory(client, {
            tenantId: instance.tenantId,
            processInstanceId: instance.id,
            eventType: "PROCESS_REJECTED",
            operatorId: input.actor.userId,
            payload: {
              status: "rejected",
              taskId: task2.id
            },
            idempotencyKey: `process:${instance.id}:rejected`
          });
        }
        await client.query("commit");
        return {
          task: task2,
          instance,
          tokenId: task2.waitpointTokenId,
          decision,
          alreadyPrepared: false
        };
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    });
  }
  async markWaitpointCompleted(taskId) {
    await this.database.query(
      `update public.wf_task
      set completed_at = coalesce(completed_at, timezone('utc'::text, now()))
      where id = $1`,
      [taskId]
    );
  }
  async recordWaitpointFailure(taskId, message) {
    const context = await this.readTaskContext(taskId);
    await this.recordHistory(
      context.instance.tenantId,
      context.instance.id,
      "WAITPOINT_COMPLETE_FAILED",
      void 0,
      { taskId, message },
      `task:${taskId}:waitpoint-failed:${message}`
    );
  }
  async claimTask(taskId, actor) {
    return this.database.withClient(async (client) => {
      await client.query("begin");
      try {
        const context = await this.readTaskContextForUpdate(client, taskId);
        const { task: task2, instance, candidates } = context;
        assertTaskMutable(task2, instance, actor, candidates);
        if (task2.assigneeId && task2.assigneeId !== actor.userId) {
          throw new import_common.BadRequestException("Workflow task has been assigned to another user.");
        }
        if (!canActorOperateTask(task2, candidates, actor, { allowUnassigned: true })) {
          throw new import_common.BadRequestException("Workflow task cannot be claimed by current user.");
        }
        await client.query(
          `update public.wf_task
          set status = 'claimed', assignee_id = $2, claimed_at = timezone('utc'::text, now())
          where id = $1`,
          [task2.id, actor.userId ?? null]
        );
        await insertHistory(client, {
          tenantId: instance.tenantId,
          processInstanceId: instance.id,
          eventType: "TASK_CLAIMED",
          operatorId: actor.userId,
          payload: {
            taskId: task2.id,
            nodeId: task2.nodeId,
            assigneeId: actor.userId
          }
        });
        await client.query("commit");
        return this.getTask(task2.id);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    });
  }
  async transferTask(taskId, targetUserId, comment, actor) {
    return this.database.withClient(async (client) => {
      await client.query("begin");
      try {
        const context = await this.readTaskContextForUpdate(client, taskId);
        const { task: task2, instance, candidates } = context;
        assertTaskMutable(task2, instance, actor, candidates);
        if (!canActorOperateTask(task2, candidates, actor, { allowUnassigned: true })) {
          throw new import_common.BadRequestException("Workflow task cannot be operated by current user.");
        }
        const nextAssignee = targetUserId.trim();
        await client.query(
          `update public.wf_task
          set status = 'pending', assignee_id = $2, claimed_at = null
          where id = $1`,
          [task2.id, nextAssignee]
        );
        await client.query("delete from public.wf_task_candidate where task_id = $1", [task2.id]);
        await client.query(
          `insert into public.wf_task_candidate (task_id, candidate_type, candidate_id, snapshot)
          values ($1, 'user', $2, $3::jsonb)`,
          [task2.id, nextAssignee, JSON.stringify({ id: nextAssignee, transferredBy: actor.userId })]
        );
        await insertComment(client, instance, task2, "transfer", comment ?? "", actor);
        await insertHistory(client, {
          tenantId: instance.tenantId,
          processInstanceId: instance.id,
          eventType: "TASK_TRANSFERRED",
          operatorId: actor.userId,
          payload: {
            taskId: task2.id,
            nodeId: task2.nodeId,
            fromUserId: task2.assigneeId,
            toUserId: nextAssignee
          }
        });
        await client.query("commit");
        return this.getTask(task2.id);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    });
  }
  async addSignTask(input) {
    return this.database.withClient(async (client) => {
      await client.query("begin");
      try {
        const context = await this.readTaskContextForUpdate(client, input.sourceTaskId);
        const { task: task2, instance, candidates } = context;
        assertTaskMutable(task2, instance, input.actor, candidates);
        if (!canActorOperateTask(task2, candidates, input.actor, { allowUnassigned: true })) {
          throw new import_common.BadRequestException("Workflow task cannot be operated by current user.");
        }
        const taskId = randomUUID();
        const targetUserId = input.targetUserId.trim();
        const result = await client.query(
          `insert into public.wf_task (
            id, tenant_id, process_instance_id, node_instance_id, node_id,
            title, status, assignee_id, waitpoint_token_id
          ) values ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
          returning *`,
          [
            taskId,
            task2.tenantId,
            task2.processInstanceId,
            task2.nodeInstanceId,
            task2.nodeId,
            `${task2.title} - 加签`,
            targetUserId,
            input.tokenId
          ]
        );
        await client.query(
          `insert into public.wf_task_candidate (task_id, candidate_type, candidate_id, snapshot)
          values ($1, 'user', $2, $3::jsonb)`,
          [taskId, targetUserId, JSON.stringify({ id: targetUserId, addedBy: input.actor.userId })]
        );
        await insertComment(client, instance, task2, "addSign", input.comment ?? "", input.actor);
        await insertHistory(client, {
          tenantId: instance.tenantId,
          processInstanceId: instance.id,
          eventType: "TASK_ADD_SIGNED",
          operatorId: input.actor.userId,
          payload: {
            taskId: task2.id,
            signTaskId: taskId,
            nodeId: task2.nodeId,
            targetUserId
          }
        });
        await client.query("commit");
        return {
          ...mapTask(result.rows[0]),
          candidates: await this.readTaskCandidates(taskId)
        };
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    });
  }
  async closeInstance(instanceId, status, eventType, comment, actor) {
    return this.database.withClient(async (client) => {
      await client.query("begin");
      try {
        const result = await client.query(
          "select * from public.wf_process_instance where id = $1 for update",
          [instanceId]
        );
        const row = result.rows[0];
        if (!row) throw new import_common.NotFoundException("Workflow instance not found.");
        const instance = mapProcessInstance(row);
        if (instance.tenantId !== actor.tenantId) {
          throw new import_common.BadRequestException("Workflow instance does not belong to current tenant.");
        }
        if (instance.status !== "running") {
          throw new import_common.BadRequestException("Workflow instance is not running.");
        }
        if (eventType === "PROCESS_WITHDRAWN" && instance.initiatorId && actor.userId && instance.initiatorId !== actor.userId) {
          throw new import_common.BadRequestException("Only workflow initiator can withdraw this instance.");
        }
        await this.closeInstanceInClient(client, instance.id, status);
        await this.cancelActiveTasksInClient(client, instance.id);
        await client.query(
          `update public.wf_node_instance
          set status = 'skipped', ended_at = coalesce(ended_at, timezone('utc'::text, now()))
          where process_instance_id = $1 and status in ('created', 'running', 'waiting')`,
          [instance.id]
        );
        await insertComment(client, instance, void 0, eventType, comment, actor);
        await insertHistory(client, {
          tenantId: instance.tenantId,
          processInstanceId: instance.id,
          eventType,
          operatorId: actor.userId,
          payload: { status, comment },
          idempotencyKey: `process:${instance.id}:${status}`
        });
        await client.query("commit");
        return {
          instance: await this.getInstance(instance.id),
          triggerRunId: instance.triggerRunId
        };
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    });
  }
  async isInstanceRunning(instanceId) {
    const result = await this.database.query(
      "select status from public.wf_process_instance where id = $1",
      [instanceId]
    );
    return result.rows[0]?.status === "running";
  }
  async createNodeInstance(input) {
    const result = await this.database.query(
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
  async completeNodeInstance(nodeInstanceId) {
    await this.completeNodeInstanceInClient(this.database, nodeInstanceId);
  }
  async failNodeInstance(nodeInstanceId, message) {
    const node = await this.database.query(
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
        "NODE_FAILED",
        void 0,
        { nodeId: nodeRow.node_id, nodeInstanceId, message },
        `node:${nodeInstanceId}:failed`
      );
    }
  }
  async createTasks(inputs) {
    const tasks2 = [];
    for (const input of inputs) {
      const result = await this.database.query(
        `insert into public.wf_task (
          id, tenant_id, process_instance_id, node_instance_id, node_id,
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
      tasks2.push(mapTask(result.rows[0]));
    }
    return tasks2;
  }
  async listNodeTasks(nodeInstanceId) {
    const result = await this.database.query(
      "select * from public.wf_task where node_instance_id = $1 order by created_at",
      [nodeInstanceId]
    );
    return result.rows.map(mapTask);
  }
  async cancelActiveNodeTasks(nodeInstanceId, exceptTaskId) {
    await this.database.query(
      `update public.wf_task
      set status = 'canceled', completed_at = coalesce(completed_at, timezone('utc'::text, now()))
      where node_instance_id = $1
        and ($2::uuid is null or id <> $2::uuid)
        and status in ('pending', 'claimed')`,
      [nodeInstanceId, exceptTaskId ?? null]
    );
  }
  async createCcItems(inputs) {
    const items = [];
    for (const input of inputs) {
      const result = await this.database.query(
        `insert into public.wf_cc (
          id, tenant_id, process_instance_id, node_instance_id, node_id,
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
  async getVariables(instanceId) {
    const result = await this.database.query(
      "select * from public.wf_variable where process_instance_id = $1",
      [instanceId]
    );
    return Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
  }
  async recordHistory(tenantId, instanceId, eventType, operatorId, payload, idempotencyKey) {
    await insertHistory(this.database, {
      tenantId,
      processInstanceId: instanceId,
      eventType,
      operatorId,
      payload,
      idempotencyKey
    });
  }
  async setInstanceStatus(instanceId, status, payload = {}) {
    const instance = await this.getProcessInstance(instanceId);
    const result = await this.database.query(
      `update public.wf_process_instance
      set status = $2, ended_at = coalesce(ended_at, timezone('utc'::text, now()))
      where id = $1 and status = 'running'
      returning *`,
      [instanceId, status]
    );
    if (!result.rows[0] && status !== instance.status) return;
    const eventType = status === "approved" ? "PROCESS_COMPLETED" : status === "rejected" ? "PROCESS_REJECTED" : "PROCESS_FAILED";
    await this.recordHistory(
      instance.tenantId,
      instance.id,
      eventType,
      void 0,
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
  async filterVisibleTasks(tasks2, actor) {
    if (!actor.userId) return tasks2;
    const visible = [];
    for (const task2 of tasks2) {
      const candidates = await this.readTaskCandidates(task2.id);
      if (canActorSeeTask(task2, candidates, actor)) visible.push(task2);
    }
    return visible;
  }
  async readTask(taskId) {
    const result = await this.database.query("select * from public.wf_task where id = $1", [taskId]);
    const row = result.rows[0];
    if (!row) throw new import_common.NotFoundException("Workflow task not found.");
    return mapTask(row);
  }
  async readTaskCandidates(taskId) {
    const result = await this.database.query(
      "select * from public.wf_task_candidate where task_id = $1 order by id",
      [taskId]
    );
    return result.rows.map(mapCandidate);
  }
  async readTaskContext(taskId) {
    const task2 = await this.readTask(taskId);
    const instance = await this.getProcessInstance(task2.processInstanceId);
    const candidates = await this.readTaskCandidates(task2.id);
    return { task: task2, instance, candidates };
  }
  async readTaskContextForUpdate(client, taskId) {
    const taskResult = await client.query(
      "select * from public.wf_task where id = $1 for update",
      [taskId]
    );
    const taskRow = taskResult.rows[0];
    if (!taskRow) throw new import_common.NotFoundException("Workflow task not found.");
    const task2 = mapTask(taskRow);
    const instanceResult = await client.query(
      "select * from public.wf_process_instance where id = $1 for update",
      [task2.processInstanceId]
    );
    const instanceRow = instanceResult.rows[0];
    if (!instanceRow) throw new import_common.NotFoundException("Workflow instance not found.");
    const candidatesResult = await client.query(
      "select * from public.wf_task_candidate where task_id = $1",
      [task2.id]
    );
    return {
      task: task2,
      instance: mapProcessInstance(instanceRow),
      candidates: candidatesResult.rows.map(mapCandidate)
    };
  }
  async getProcessInstance(instanceId) {
    const result = await this.database.query(
      "select * from public.wf_process_instance where id = $1",
      [instanceId]
    );
    const row = result.rows[0];
    if (!row) throw new import_common.NotFoundException("Workflow instance not found.");
    return mapProcessInstance(row);
  }
  async cancelActiveTasksInClient(client, processInstanceId, exceptTaskId) {
    await client.query(
      `update public.wf_task
      set status = 'canceled', completed_at = coalesce(completed_at, timezone('utc'::text, now()))
      where process_instance_id = $1
        and ($2::uuid is null or id <> $2::uuid)
        and status in ('pending', 'claimed')`,
      [processInstanceId, exceptTaskId ?? null]
    );
  }
  async completeNodeInstanceInClient(client, nodeInstanceId) {
    await client.query(
      `update public.wf_node_instance
      set status = 'completed', ended_at = coalesce(ended_at, timezone('utc'::text, now()))
      where id = $1`,
      [nodeInstanceId]
    );
  }
  async closeInstanceInClient(client, instanceId, status) {
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
};
function createStandalonePostgresWorkflowRuntimeStore(connectionString) {
  const pool = new Pool({
    connectionString,
    max: 5,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5e3,
    idleTimeoutMillis: 3e4,
    connectionTimeoutMillis: 3e4
  });
  pool.on("error", (error) => {
    console.warn(`[workflow-runtime] Postgres idle client error: ${error.message}`);
  });
  const database = {
    query: /* @__PURE__ */ __name((text, values) => retryTransientPostgresOperation(() => pool.query(text, values)), "query"),
    withClient: /* @__PURE__ */ __name(async (callback) => {
      const client = await retryTransientPostgresOperation(() => pool.connect());
      let failure;
      try {
        return await callback(client);
      } catch (error) {
        failure = error;
        throw error;
      } finally {
        client.release(isTransientPostgresError(failure) ? true : void 0);
      }
    }, "withClient")
  };
  return {
    store: new PostgresWorkflowRuntimeStore(database),
    close: /* @__PURE__ */ __name(() => pool.end(), "close")
  };
}
__name(createStandalonePostgresWorkflowRuntimeStore, "createStandalonePostgresWorkflowRuntimeStore");
function addCondition(conditions, values, column, value) {
  if (value === void 0 || value === null || value === "") return;
  values.push(value);
  conditions.push(`${column} = $${values.length}`);
}
__name(addCondition, "addCondition");
function mapProcessInstance(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    definitionId: row.definition_id,
    definitionVersion: row.definition_version,
    businessKey: row.business_key,
    ...row.document_type ? { documentType: row.document_type } : {},
    ...row.document_id ? { documentId: row.document_id } : {},
    title: row.title,
    status: row.status,
    ...row.initiator_id ? { initiatorId: row.initiator_id } : {},
    ...row.trigger_run_id ? { triggerRunId: row.trigger_run_id } : {},
    ...row.trigger_task_id ? { triggerTaskId: row.trigger_task_id } : {},
    startedAt: row.started_at.toISOString(),
    ...row.ended_at ? { endedAt: row.ended_at.toISOString() } : {}
  };
}
__name(mapProcessInstance, "mapProcessInstance");
function mapNodeInstance(row) {
  return {
    id: row.id,
    processInstanceId: row.process_instance_id,
    ...row.execution_key ? { executionKey: row.execution_key } : {},
    nodeId: row.node_id,
    nodeType: row.node_type,
    name: row.name,
    status: row.status,
    ...toIso(row.started_at) ? { startedAt: toIso(row.started_at) } : {},
    ...toIso(row.ended_at) ? { endedAt: toIso(row.ended_at) } : {}
  };
}
__name(mapNodeInstance, "mapNodeInstance");
function mapTask(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    processInstanceId: row.process_instance_id,
    nodeInstanceId: row.node_instance_id,
    nodeId: row.node_id,
    title: row.title,
    status: row.status,
    ...row.assignee_id ? { assigneeId: row.assignee_id } : {},
    ...toIso(row.claimed_at) ? { claimedAt: toIso(row.claimed_at) } : {},
    ...toIso(row.due_at) ? { dueAt: toIso(row.due_at) } : {},
    ...row.waitpoint_token_id ? { waitpointTokenId: row.waitpoint_token_id } : {},
    ...row.trigger_run_id ? { triggerRunId: row.trigger_run_id } : {},
    ...row.decision_payload ? { decisionPayload: row.decision_payload } : {},
    createdAt: row.created_at.toISOString(),
    ...row.completed_at ? { completedAt: row.completed_at.toISOString() } : {}
  };
}
__name(mapTask, "mapTask");
function mapCandidate(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    candidateType: row.candidate_type,
    candidateId: row.candidate_id,
    snapshot: row.snapshot ?? {}
  };
}
__name(mapCandidate, "mapCandidate");
function mapVariable(row) {
  return {
    id: row.id,
    processInstanceId: row.process_instance_id,
    key: row.key,
    value: row.value,
    valueType: row.value_type,
    updatedAt: row.updated_at.toISOString()
  };
}
__name(mapVariable, "mapVariable");
function mapHistory(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    processInstanceId: row.process_instance_id,
    eventType: row.event_type,
    ...row.operator_id ? { operatorId: row.operator_id } : {},
    payload: row.payload ?? {},
    createdAt: row.created_at.toISOString()
  };
}
__name(mapHistory, "mapHistory");
function mapComment(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    processInstanceId: row.process_instance_id,
    ...row.task_id ? { taskId: row.task_id } : {},
    ...row.node_id ? { nodeId: row.node_id } : {},
    action: row.action,
    ...row.operator_id ? { operatorId: row.operator_id } : {},
    comment: row.comment,
    createdAt: row.created_at.toISOString()
  };
}
__name(mapComment, "mapComment");
function mapCc(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    processInstanceId: row.process_instance_id,
    nodeInstanceId: row.node_instance_id,
    nodeId: row.node_id,
    title: row.title,
    ...row.recipient_id ? { recipientId: row.recipient_id } : {},
    ...row.candidate_type ? { candidateType: row.candidate_type } : {},
    ...row.candidate_id ? { candidateId: row.candidate_id } : {},
    createdAt: row.created_at.toISOString(),
    ...row.read_at ? { readAt: row.read_at.toISOString() } : {}
  };
}
__name(mapCc, "mapCc");
async function upsertVariables(client, processInstanceId, values) {
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
__name(upsertVariables, "upsertVariables");
async function insertComment(client, instance, task2, action, comment, actor) {
  if (!comment.trim()) return;
  await client.query(
    `insert into public.wf_comment (
      tenant_id, process_instance_id, task_id, node_id, action, operator_id, comment
    ) values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      instance.tenantId,
      instance.id,
      task2?.id ?? null,
      task2?.nodeId ?? null,
      action,
      actor.userId ?? null,
      comment
    ]
  );
}
__name(insertComment, "insertComment");
async function insertHistory(client, input) {
  await client.query(
    `insert into public.wf_history_event (
      tenant_id, process_instance_id, event_type, operator_id, payload, idempotency_key
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
__name(insertHistory, "insertHistory");
function assertTaskMutable(task2, instance, actor, candidates) {
  if (task2.status === "completed") {
    throw new import_common.BadRequestException("Workflow task is already completed.");
  }
  if (task2.status === "canceled") {
    throw new import_common.BadRequestException("Workflow task is canceled.");
  }
  if (task2.tenantId !== actor.tenantId) {
    throw new import_common.BadRequestException("Workflow task does not belong to current tenant.");
  }
  if (instance.status !== "running") {
    throw new import_common.BadRequestException("Workflow instance is not running.");
  }
  if (!canActorSeeTask(task2, candidates, actor)) {
    throw new import_common.BadRequestException("Workflow task cannot be operated by current user.");
  }
}
__name(assertTaskMutable, "assertTaskMutable");

// src/workflow/runtime/workflow.executor.ts
init_esm();
import { randomUUID as randomUUID2 } from "node:crypto";
var NOTIFICATION_DISPATCH_TASK_ID = "notification.dispatch";
async function executeWorkflowInstance(payload, store, waits) {
  const actor = {
    tenantId: payload.tenantId,
    ...payload.initiatorId ? { userId: payload.initiatorId } : {}
  };
  const definition = compileRuntimeDefinition(payload.schema);
  const startNode = definition.nodes.find((node) => node.type === "start");
  if (!startNode) {
    await store.setInstanceStatus(payload.instanceId, "failed", {
      message: "Workflow definition has no start node."
    });
    throw new Error("Workflow definition has no start node.");
  }
  const startNodeInstance = await enterNodeProjection(payload, store, startNode, "root:start", "completed", actor);
  await completeNodeProjection(payload, store, startNode, startNodeInstance, actor);
  const result = await moveToNextNode(payload, store, waits, definition, startNode.id, "root", actor);
  if (result === "stopped") {
    return {
      instanceId: payload.instanceId,
      status: "stopped"
    };
  }
  if (await store.isInstanceRunning(payload.instanceId)) {
    await store.setInstanceStatus(payload.instanceId, "approved", {
      status: "approved"
    });
    await emitWorkflowApprovedNotification(payload, store, waits, actor);
  }
  return {
    instanceId: payload.instanceId,
    status: "completed"
  };
}
__name(executeWorkflowInstance, "executeWorkflowInstance");
async function moveToNextNode(payload, store, waits, definition, sourceNodeId, pathKey, actor) {
  if (!await store.isInstanceRunning(payload.instanceId)) return "stopped";
  const variables = await store.getVariables(payload.instanceId);
  const edge = selectOutgoingEdges(definition, sourceNodeId, variables)[0];
  if (!edge) {
    await store.setInstanceStatus(payload.instanceId, "failed", {
      sourceNodeId,
      message: `Node "${sourceNodeId}" has no matched outgoing edge.`
    });
    throw new Error(`Node "${sourceNodeId}" has no matched outgoing edge.`);
  }
  const targetNode = definition.nodeMap.get(edge.target);
  if (!targetNode) {
    await store.setInstanceStatus(payload.instanceId, "failed", {
      sourceNodeId,
      targetNodeId: edge.target,
      message: `Target node "${edge.target}" does not exist.`
    });
    throw new Error(`Target node "${edge.target}" does not exist.`);
  }
  return enterNode(payload, store, waits, definition, targetNode, `${pathKey}:${edge.id}`, actor);
}
__name(moveToNextNode, "moveToNextNode");
async function enterNode(payload, store, waits, definition, node, pathKey, actor) {
  if (!await store.isInstanceRunning(payload.instanceId)) return "stopped";
  const nodeInstance = await enterNodeProjection(
    payload,
    store,
    node,
    `${pathKey}:${node.id}`,
    initialNodeStatus(node.type),
    actor
  );
  try {
    switch (node.type) {
      case "approval":
      case "sign":
      case "orSign": {
        const result = await waitForHumanNode(payload, store, waits, node, nodeInstance, actor);
        if (result === "stopped") return "stopped";
        await completeNodeProjection(payload, store, node, nodeInstance, actor);
        return moveToNextNode(payload, store, waits, definition, node.id, pathKey, actor);
      }
      case "condition":
        await completeNodeProjection(payload, store, node, nodeInstance, actor);
        return moveToNextNode(payload, store, waits, definition, node.id, pathKey, actor);
      case "cc":
        await createCcItems(payload, store, waits, node, nodeInstance, actor);
        await completeNodeProjection(payload, store, node, nodeInstance, actor);
        return moveToNextNode(payload, store, waits, definition, node.id, pathKey, actor);
      case "serviceTask":
        await executeServiceTask(payload, store, node, nodeInstance, actor);
        await completeNodeProjection(payload, store, node, nodeInstance, actor);
        return moveToNextNode(payload, store, waits, definition, node.id, pathKey, actor);
      case "timer":
        await waitForTimer(payload, store, waits, node, nodeInstance, actor);
        if (!await store.isInstanceRunning(payload.instanceId)) return "stopped";
        await completeNodeProjection(payload, store, node, nodeInstance, actor);
        return moveToNextNode(payload, store, waits, definition, node.id, pathKey, actor);
      case "subProcess":
        await store.recordHistory(
          payload.tenantId,
          payload.instanceId,
          "SUB_PROCESS_COMPLETED",
          actor.userId,
          {
            nodeId: node.id,
            nodeInstanceId: nodeInstance.id,
            config: node.config ?? {}
          },
          `node:${nodeInstance.id}:sub-process-completed`
        );
        await completeNodeProjection(payload, store, node, nodeInstance, actor);
        return moveToNextNode(payload, store, waits, definition, node.id, pathKey, actor);
      case "parallelGateway": {
        await store.recordHistory(
          payload.tenantId,
          payload.instanceId,
          "PARALLEL_GATEWAY_COMPLETED",
          actor.userId,
          {
            nodeId: node.id,
            nodeInstanceId: nodeInstance.id
          },
          `node:${nodeInstance.id}:parallel-completed`
        );
        await completeNodeProjection(payload, store, node, nodeInstance, actor);
        return moveToAllNextNodes(payload, store, waits, definition, node.id, pathKey, actor);
      }
      case "end":
        await completeNodeProjection(payload, store, node, nodeInstance, actor);
        return "continued";
      default:
        await store.setInstanceStatus(payload.instanceId, "failed", {
          nodeId: node.id,
          nodeType: node.type,
          message: `Unsupported runtime node type "${node.type}".`
        });
        throw new Error(`Unsupported runtime node type "${node.type}".`);
    }
  } catch (error) {
    await store.failNodeInstance(nodeInstance.id, error instanceof Error ? error.message : String(error));
    await store.setInstanceStatus(payload.instanceId, "failed", {
      nodeId: node.id,
      nodeType: node.type,
      message: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
__name(enterNode, "enterNode");
async function moveToAllNextNodes(payload, store, waits, definition, sourceNodeId, pathKey, actor) {
  const variables = await store.getVariables(payload.instanceId);
  const edges = selectOutgoingEdges(definition, sourceNodeId, variables);
  if (!edges.length) {
    await store.setInstanceStatus(payload.instanceId, "failed", {
      sourceNodeId,
      message: `Node "${sourceNodeId}" has no matched outgoing edge.`
    });
    throw new Error(`Node "${sourceNodeId}" has no matched outgoing edge.`);
  }
  const results = await Promise.all(
    edges.map((edge) => {
      const node = definition.nodeMap.get(edge.target);
      if (!node) throw new Error(`Target node "${edge.target}" does not exist.`);
      return enterNode(payload, store, waits, definition, node, `${pathKey}:${edge.id}`, actor);
    })
  );
  return results.includes("stopped") ? "stopped" : "continued";
}
__name(moveToAllNextNodes, "moveToAllNextNodes");
async function enterNodeProjection(payload, store, node, executionKey, status, actor) {
  const nodeInstance = await store.createNodeInstance({
    id: randomUUID2(),
    processInstanceId: payload.instanceId,
    executionKey,
    nodeId: node.id,
    nodeType: node.type,
    name: node.name,
    status
  });
  await store.recordHistory(
    payload.tenantId,
    payload.instanceId,
    "NODE_ENTERED",
    actor.userId,
    {
      nodeId: node.id,
      nodeType: node.type,
      nodeInstanceId: nodeInstance.id
    },
    `node:${nodeInstance.id}:entered`
  );
  return nodeInstance;
}
__name(enterNodeProjection, "enterNodeProjection");
async function completeNodeProjection(payload, store, node, nodeInstance, actor) {
  await store.completeNodeInstance(nodeInstance.id);
  await store.recordHistory(
    payload.tenantId,
    payload.instanceId,
    "NODE_COMPLETED",
    actor.userId,
    {
      nodeId: node.id,
      nodeType: node.type,
      nodeInstanceId: nodeInstance.id
    },
    `node:${nodeInstance.id}:completed`
  );
}
__name(completeNodeProjection, "completeNodeProjection");
async function waitForHumanNode(payload, store, waits, node, nodeInstance, actor) {
  const initialTasks = await store.listNodeTasks(nodeInstance.id);
  let pendingDecision;
  if (!initialTasks.length) {
    const { tasks: tasks2, taskInputs } = await createHumanTasks(payload, store, waits, node, nodeInstance, actor);
    pendingDecision = waitForAnyTaskDecision(
      tasks2.filter((task2) => Boolean(task2.waitpointTokenId)),
      waits
    );
    await store.recordHistory(
      payload.tenantId,
      payload.instanceId,
      "TASK_CREATED",
      actor.userId,
      {
        nodeId: node.id,
        nodeType: node.type,
        taskIds: tasks2.map((task2) => task2.id),
        completionStrategy: completionStrategyForNode(node)
      },
      `node:${nodeInstance.id}:tasks-created`
    );
    void emitTaskCreatedNotifications(payload, store, waits, tasks2, taskInputs, actor).catch(
      (error) => store.recordHistory(
        payload.tenantId,
        payload.instanceId,
        "NOTIFICATION_TRIGGER_FAILED",
        actor.userId,
        {
          eventType: "approval.task.created",
          nodeId: node.id,
          nodeInstanceId: nodeInstance.id,
          message: error instanceof Error ? error.message : String(error)
        },
        `node:${nodeInstance.id}:task-created-notification-failed`
      )
    );
  }
  while (await store.isInstanceRunning(payload.instanceId)) {
    const nodeTasks = await store.listNodeTasks(nodeInstance.id);
    const activeTasks = nodeTasks.filter((task2) => task2.status === "pending" || task2.status === "claimed");
    if (!activeTasks.length) break;
    const waitableTasks = activeTasks.filter((task2) => Boolean(task2.waitpointTokenId));
    if (!waitableTasks.length) {
      await store.setInstanceStatus(payload.instanceId, "failed", {
        nodeId: node.id,
        nodeInstanceId: nodeInstance.id,
        message: "Human task has no Trigger.dev waitpoint token."
      });
      throw new Error("Human task has no Trigger.dev waitpoint token.");
    }
    const decision = await (pendingDecision ?? waitForAnyTaskDecision(waitableTasks, waits));
    pendingDecision = void 0;
    await store.markWaitpointCompleted(decision.taskId);
    if (!await store.isInstanceRunning(payload.instanceId)) return "stopped";
    if (decision.action === "reject") return "stopped";
    const latestNodeTasks = await store.listNodeTasks(nodeInstance.id);
    if (isHumanNodeCompleted(node, latestNodeTasks)) {
      if (completionStrategyForNode(node) !== "all") {
        await store.cancelActiveNodeTasks(nodeInstance.id, decision.taskId);
      }
      break;
    }
  }
  return await store.isInstanceRunning(payload.instanceId) ? "continued" : "stopped";
}
__name(waitForHumanNode, "waitForHumanNode");
async function createHumanTasks(payload, store, waits, node, nodeInstance, actor) {
  const variables = await store.getVariables(payload.instanceId);
  const strategy = isRecord(node.config?.assigneeStrategy) ? node.config.assigneeStrategy : { type: "initiatorManager", level: 1 };
  const assignees = resolveAssignees(strategy, actor, variables);
  const candidates = node.type === "approval" ? assignees.candidates.slice(0, 1) : assignees.candidates.length ? assignees.candidates : [
    {
      type: "user",
      id: assignees.directAssigneeId ?? actor.userId ?? "initiator-manager",
      snapshot: { id: assignees.directAssigneeId ?? actor.userId ?? "initiator-manager" }
    }
  ];
  const taskInputs = [];
  for (const [index, candidate] of candidates.entries()) {
    const token = await waits.createToken({
      idempotencyKey: `workflow:${payload.instanceId}:node:${nodeInstance.id}:task:${index}:${candidate.type}:${candidate.id}`,
      tags: [
        `tenant:${payload.tenantId}`,
        `workflow-instance:${payload.instanceId}`,
        `node:${node.id}`,
        `node-instance:${nodeInstance.id}`
      ]
    });
    taskInputs.push({
      id: randomUUID2(),
      tenantId: payload.tenantId,
      processInstanceId: payload.instanceId,
      nodeInstanceId: nodeInstance.id,
      nodeId: node.id,
      title: `${payload.title} - ${node.name}`,
      assigneeId: candidate.type === "user" ? candidate.id : assignees.directAssigneeId,
      waitpointTokenId: token.id,
      candidates: [
        {
          id: randomUUID2(),
          candidateType: candidate.type,
          candidateId: candidate.id,
          snapshot: candidate.snapshot
        }
      ]
    });
  }
  const tasks2 = await store.createTasks(taskInputs);
  return { tasks: tasks2, taskInputs };
}
__name(createHumanTasks, "createHumanTasks");
async function emitTaskCreatedNotifications(payload, store, waits, tasks2, taskInputs, actor) {
  await Promise.all(
    tasks2.map((workflowTask, index) => {
      const recipients = recipientIdsForTask(workflowTask, taskInputs[index]);
      return triggerNotificationEvent(payload, store, waits, actor, {
        eventType: "approval.task.created",
        sourceType: "workflow_task",
        sourceId: workflowTask.id,
        idempotencyKey: `approval-task:${workflowTask.id}:created`,
        payload: {
          title: workflowTask.title,
          taskId: workflowTask.id,
          instanceId: workflowTask.processInstanceId,
          nodeId: workflowTask.nodeId,
          recipientIds: recipients,
          linkUrl: `/dashboard/workflow/tasks/${workflowTask.id}`,
          priority: "normal"
        }
      });
    })
  );
}
__name(emitTaskCreatedNotifications, "emitTaskCreatedNotifications");
async function emitCcCreatedNotifications(payload, store, waits, items, actor) {
  await Promise.all(
    items.map((item) => {
      const recipients = recipientIdsForCc(item);
      return triggerNotificationEvent(payload, store, waits, actor, {
        eventType: "approval.cc.created",
        sourceType: "workflow_cc",
        sourceId: item.id,
        idempotencyKey: `approval-cc:${item.id}:created`,
        payload: {
          title: item.title,
          ccId: item.id,
          instanceId: item.processInstanceId,
          nodeId: item.nodeId,
          recipientIds: recipients,
          linkUrl: `/dashboard/workflow/instances/${item.processInstanceId}`,
          priority: "normal"
        }
      });
    })
  );
}
__name(emitCcCreatedNotifications, "emitCcCreatedNotifications");
async function triggerNotificationEvent(payload, store, waits, actor, input) {
  if (!waits.triggerTask) return;
  try {
    await waits.triggerTask(
      NOTIFICATION_DISPATCH_TASK_ID,
      {
        tenantId: payload.tenantId,
        event: {
          tenantId: payload.tenantId,
          eventType: input.eventType,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          actorId: actor.userId,
          payload: input.payload,
          idempotencyKey: input.idempotencyKey
        }
      },
      {
        idempotencyKey: `notification:${input.idempotencyKey}`,
        tags: [
          `tenant:${payload.tenantId}`,
          `workflow-instance:${payload.instanceId}`,
          `notification:${input.eventType}`
        ]
      }
    );
  } catch (error) {
    await store.recordHistory(
      payload.tenantId,
      payload.instanceId,
      "NOTIFICATION_TRIGGER_FAILED",
      actor.userId,
      {
        eventType: input.eventType,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        message: error instanceof Error ? error.message : String(error)
      },
      `notification:${input.idempotencyKey}:trigger-failed`
    );
  }
}
__name(triggerNotificationEvent, "triggerNotificationEvent");
async function emitWorkflowApprovedNotification(payload, store, waits, actor) {
  if (!payload.initiatorId?.trim()) return;
  await triggerNotificationEvent(payload, store, waits, actor, {
    eventType: "approval.instance.approved",
    sourceType: "workflow_instance",
    sourceId: payload.instanceId,
    idempotencyKey: `approval-instance:${payload.instanceId}:approved`,
    payload: {
      title: payload.title,
      instanceId: payload.instanceId,
      definitionId: payload.definitionId,
      recipientIds: [payload.initiatorId],
      linkUrl: `/dashboard/workflow/instances/${payload.instanceId}`,
      priority: "normal"
    }
  });
}
__name(emitWorkflowApprovedNotification, "emitWorkflowApprovedNotification");
function recipientIdsForTask(task2, input) {
  return [
    ...new Set(
      [
        task2.assigneeId,
        ...(input?.candidates ?? []).filter((candidate) => candidate.candidateType === "user").map((candidate) => candidate.candidateId)
      ].map((id) => typeof id === "string" ? id.trim() : "").filter(Boolean)
    )
  ];
}
__name(recipientIdsForTask, "recipientIdsForTask");
function recipientIdsForCc(item) {
  return [
    ...new Set(
      [
        item.recipientId,
        item.candidateType === "user" ? item.candidateId : void 0
      ].map((id) => typeof id === "string" ? id.trim() : "").filter(Boolean)
    )
  ];
}
__name(recipientIdsForCc, "recipientIdsForCc");
async function waitForAnyTaskDecision(tasks2, waits) {
  if (!tasks2.length) {
    throw new Error("Human node has no waitable tasks.");
  }
  if (tasks2.length === 1) {
    return waitForTaskDecision(tasks2[0], waits);
  }
  const decisions = tasks2.map((task2) => waitForTaskDecision(task2, waits));
  return Promise.race(decisions);
}
__name(waitForAnyTaskDecision, "waitForAnyTaskDecision");
function waitForTaskDecision(task2, waits) {
  if (!task2.waitpointTokenId) {
    throw new Error(`Task "${task2.id}" has no waitpoint token.`);
  }
  return waits.waitForToken(task2.waitpointTokenId);
}
__name(waitForTaskDecision, "waitForTaskDecision");
async function createCcItems(payload, store, waits, node, nodeInstance, actor) {
  const variables = await store.getVariables(payload.instanceId);
  const strategy = isRecord(node.config?.assigneeStrategy) ? node.config.assigneeStrategy : { type: "users", userIds: actor.userId ? [actor.userId] : [] };
  const assignees = resolveAssignees(strategy, actor, variables);
  const items = await store.createCcItems(
    assignees.candidates.map((candidate) => ({
      id: randomUUID2(),
      tenantId: payload.tenantId,
      processInstanceId: payload.instanceId,
      nodeInstanceId: nodeInstance.id,
      nodeId: node.id,
      title: `${payload.title} - ${node.name}`,
      ...candidate.type === "user" ? { recipientId: candidate.id } : {},
      candidateType: candidate.type,
      candidateId: candidate.id
    }))
  );
  await emitCcCreatedNotifications(payload, store, waits, items, actor);
  await store.recordHistory(
    payload.tenantId,
    payload.instanceId,
    "CC_CREATED",
    actor.userId,
    {
      nodeId: node.id,
      nodeInstanceId: nodeInstance.id,
      recipients: items
    },
    `node:${nodeInstance.id}:cc-created`
  );
}
__name(createCcItems, "createCcItems");
async function executeServiceTask(payload, store, node, nodeInstance, actor) {
  const config = node.config ?? {};
  const url = readString(config.url);
  let output = { handledBy: "workflow.instance.run" };
  if (url) {
    const variables = await store.getVariables(payload.instanceId);
    const response = await fetchWithTimeout(url, {
      method: readString(config.method, "POST"),
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        instanceId: payload.instanceId,
        tenantId: payload.tenantId,
        nodeId: node.id,
        nodeInstanceId: nodeInstance.id,
        variables,
        config
      }),
      timeoutSeconds: typeof config.timeoutSeconds === "number" ? config.timeoutSeconds : 30
    });
    output = await readResponseBody(response);
    if (!response.ok) {
      throw new Error(`Service task "${node.id}" failed with HTTP ${response.status}.`);
    }
  }
  await store.recordHistory(
    payload.tenantId,
    payload.instanceId,
    "SERVICE_TASK_COMPLETED",
    actor.userId,
    {
      nodeId: node.id,
      nodeInstanceId: nodeInstance.id,
      config,
      output
    },
    `node:${nodeInstance.id}:service-completed`
  );
}
__name(executeServiceTask, "executeServiceTask");
async function waitForTimer(payload, store, waits, node, nodeInstance, actor) {
  const dueAt = resolveTimerDueAt(node.config);
  await store.recordHistory(
    payload.tenantId,
    payload.instanceId,
    "TIMER_SCHEDULED",
    actor.userId,
    {
      nodeId: node.id,
      nodeInstanceId: nodeInstance.id,
      dueAt: dueAt.toISOString(),
      config: node.config ?? {}
    },
    `node:${nodeInstance.id}:timer-scheduled`
  );
  const waitKey = `workflow:${payload.instanceId}:timer:${nodeInstance.id}`;
  if (dueAt.getTime() > Date.now()) {
    await waits.waitUntil({ date: dueAt, idempotencyKey: waitKey });
  } else {
    const seconds = readDelaySeconds(node.config);
    if (seconds > 0) {
      await waits.waitFor({ seconds, idempotencyKey: waitKey });
    }
  }
  await store.recordHistory(
    payload.tenantId,
    payload.instanceId,
    "TIMER_FIRED",
    actor.userId,
    {
      nodeId: node.id,
      nodeInstanceId: nodeInstance.id,
      dueAt: dueAt.toISOString()
    },
    `node:${nodeInstance.id}:timer-fired`
  );
}
__name(waitForTimer, "waitForTimer");
function compileRuntimeDefinition(schema) {
  const nodes = Array.isArray(schema.nodes) ? schema.nodes.filter(isRecord).map((node) => ({
    id: readString(node.id),
    type: readString(node.type),
    name: readString(node.name, readString(node.type)),
    ...isRecord(node.config) ? { config: node.config } : {}
  })) : [];
  const edges = Array.isArray(schema.edges) ? schema.edges.filter(isRecord).map((edge) => ({
    id: readString(edge.id),
    source: readString(edge.source),
    target: readString(edge.target),
    ...typeof edge.priority === "number" ? { priority: edge.priority } : {},
    ...isRecord(edge.condition) ? { condition: edge.condition } : {}
  })) : [];
  return {
    nodes,
    edges,
    nodeMap: new Map(nodes.map((node) => [node.id, node]))
  };
}
__name(compileRuntimeDefinition, "compileRuntimeDefinition");
function selectOutgoingEdges(definition, sourceNodeId, variables) {
  return definition.edges.filter((edge) => edge.source === sourceNodeId).sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0)).filter((edge) => matchesCondition(edge.condition, variables));
}
__name(selectOutgoingEdges, "selectOutgoingEdges");
function matchesCondition(condition, variables) {
  if (!condition || condition.type === "always") return true;
  if (condition.type !== "field") return false;
  const field = readString(condition.field);
  const operator = readString(condition.operator, "eq");
  const left = variables[field];
  const right = condition.value;
  switch (operator) {
    case "eq":
      return left === right;
    case "ne":
      return left !== right;
    case "gt":
      return Number(left) > Number(right);
    case "gte":
      return Number(left) >= Number(right);
    case "lt":
      return Number(left) < Number(right);
    case "lte":
      return Number(left) <= Number(right);
    case "in":
      return Array.isArray(right) && right.includes(left);
    case "contains":
      return Array.isArray(left) ? left.includes(right) : String(left ?? "").includes(String(right ?? ""));
    default:
      return false;
  }
}
__name(matchesCondition, "matchesCondition");
function resolveAssignees(strategy, actor, variables) {
  const type = readString(strategy.type, "initiatorManager");
  if (type === "users" && Array.isArray(strategy.userIds)) {
    const userIds = strategy.userIds.filter((userId) => typeof userId === "string");
    return {
      directAssigneeId: userIds[0],
      candidates: userIds.map((userId) => ({
        type: "user",
        id: userId,
        snapshot: { id: userId }
      }))
    };
  }
  if (type === "roles" && Array.isArray(strategy.roleCodes)) {
    const roleCodes = strategy.roleCodes.filter((roleCode) => typeof roleCode === "string");
    return {
      directAssigneeId: void 0,
      candidates: roleCodes.map((roleCode) => ({
        type: "role",
        id: roleCode,
        snapshot: { code: roleCode }
      }))
    };
  }
  if (type === "departments" && Array.isArray(strategy.departmentIds)) {
    const departmentIds = strategy.departmentIds.filter(
      (departmentId) => typeof departmentId === "string"
    );
    return {
      directAssigneeId: void 0,
      candidates: departmentIds.map((departmentId) => ({
        type: "department",
        id: departmentId,
        snapshot: { id: departmentId }
      }))
    };
  }
  if (type === "field") {
    const value = variables[readString(strategy.field)];
    const userIds = Array.isArray(value) ? value.filter((item) => typeof item === "string") : typeof value === "string" ? [value] : [];
    if (userIds.length) {
      return {
        directAssigneeId: userIds[0],
        candidates: userIds.map((userId) => ({
          type: "user",
          id: userId,
          snapshot: { id: userId, source: "field" }
        }))
      };
    }
  }
  const fallbackUserId = actor.userId ?? "initiator-manager";
  return {
    directAssigneeId: fallbackUserId,
    candidates: [
      {
        type: "user",
        id: fallbackUserId,
        snapshot: { id: fallbackUserId, strategy: type }
      }
    ]
  };
}
__name(resolveAssignees, "resolveAssignees");
function isHumanNodeCompleted(node, tasks2) {
  const humanTasks = tasks2.filter((task2) => task2.status !== "canceled");
  const completedCount = humanTasks.filter((task2) => task2.status === "completed").length;
  if (!humanTasks.length) return false;
  const strategy = completionStrategyForNode(node);
  if (strategy === "any") return completedCount >= 1;
  if (strategy === "ratio") {
    const passRatio = typeof node.config?.passRatio === "number" && node.config.passRatio > 0 ? node.config.passRatio : 1;
    return completedCount / humanTasks.length >= passRatio;
  }
  return completedCount === humanTasks.length;
}
__name(isHumanNodeCompleted, "isHumanNodeCompleted");
function completionStrategyForNode(node) {
  if (node.type === "orSign") return "any";
  const strategy = readString(node.config?.completionStrategy, "all");
  return strategy === "any" || strategy === "ratio" ? strategy : "all";
}
__name(completionStrategyForNode, "completionStrategyForNode");
function initialNodeStatus(nodeType) {
  if (nodeType === "timer") return "waiting";
  if (nodeType === "approval" || nodeType === "sign" || nodeType === "orSign") return "running";
  return "completed";
}
__name(initialNodeStatus, "initialNodeStatus");
function resolveTimerDueAt(config) {
  const now = Date.now();
  const mode = readString(config?.mode);
  if (mode === "datetime") {
    const datetime = readString(config?.datetime);
    const dueAt = new Date(datetime);
    if (Number.isNaN(dueAt.getTime())) {
      throw new Error("Timer node datetime is invalid.");
    }
    return dueAt;
  }
  if (mode === "delay" && typeof config?.duration === "string") {
    return new Date(now + parseIsoDurationMillis(config.duration));
  }
  if (typeof config?.delaySeconds === "number") {
    return new Date(now + Math.max(0, config.delaySeconds) * 1e3);
  }
  return new Date(now);
}
__name(resolveTimerDueAt, "resolveTimerDueAt");
function readDelaySeconds(config) {
  if (typeof config?.delaySeconds === "number") return Math.max(0, config.delaySeconds);
  if (readString(config?.mode) === "delay" && typeof config?.duration === "string") {
    return Math.max(0, Math.ceil(parseIsoDurationMillis(config.duration) / 1e3));
  }
  return 0;
}
__name(readDelaySeconds, "readDelaySeconds");
function parseIsoDurationMillis(duration) {
  const match = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) {
    throw new Error("Timer node duration must be an ISO-8601 duration like PT2H.");
  }
  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  return Number(days) * 24 * 60 * 60 * 1e3 + Number(hours) * 60 * 60 * 1e3 + Number(minutes) * 60 * 1e3 + Number(seconds) * 1e3;
}
__name(parseIsoDurationMillis, "parseIsoDurationMillis");
async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutSeconds * 1e3);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}
__name(fetchWithTimeout, "fetchWithTimeout");
async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { body: text };
  }
}
__name(readResponseBody, "readResponseBody");

// src/workflow/trigger/workflow-instance.task.ts
var workflowInstanceTask = task({
  id: WORKFLOW_INSTANCE_TASK_ID,
  run: /* @__PURE__ */ __name(async (payload) => {
    const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DIRECT_URL or DATABASE_URL is required by the Trigger.dev workflow task.");
    }
    const runtime = createStandalonePostgresWorkflowRuntimeStore(connectionString);
    const waits = {
      createToken: /* @__PURE__ */ __name(async (options) => wait.createToken(options), "createToken"),
      waitForToken: /* @__PURE__ */ __name(async (tokenId) => {
        const result = await wait.forToken(tokenId);
        if (!result.ok) throw result.error;
        return result.output;
      }, "waitForToken"),
      waitFor: /* @__PURE__ */ __name(async ({ seconds, idempotencyKey }) => {
        await wait.for({ seconds, idempotencyKey });
      }, "waitFor"),
      waitUntil: /* @__PURE__ */ __name(async ({ date, idempotencyKey }) => {
        await wait.until({ date, idempotencyKey });
      }, "waitUntil"),
      triggerTask: /* @__PURE__ */ __name(async (taskId, taskPayload, options) => {
        await tasks.trigger(taskId, taskPayload, options);
      }, "triggerTask")
    };
    try {
      return await executeWorkflowInstance(payload, runtime.store, waits);
    } finally {
      await runtime.close();
    }
  }, "run")
});
export {
  workflowInstanceTask
};
//# sourceMappingURL=workflow-instance.task.mjs.map
