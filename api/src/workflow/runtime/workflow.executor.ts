import { randomUUID } from 'node:crypto';
import type {
  CreateWorkflowTaskInput,
  WorkflowInstanceTaskPayload,
  WorkflowRuntimeStore,
  WorkflowTaskDecision
} from './runtime.engine.types';
import { isRecord, readString } from './runtime.helpers';
import type {
  NodeInstanceRecord,
  RuntimeActor,
  WorkflowCcRecord,
  WorkflowEdgeSnapshot,
  WorkflowNodeSnapshot,
  WorkflowTaskCandidateRecord,
  WorkflowTaskRecord
} from './runtime.types';

const NOTIFICATION_DISPATCH_TASK_ID = 'notification.dispatch';

export type WorkflowWaitDriver = {
  createToken(input: {
    idempotencyKey: string;
    tags: string[];
  }): Promise<{ id: string }>;
  waitForToken<T>(tokenId: string): Promise<T>;
  waitFor(input: { seconds: number; idempotencyKey: string }): Promise<void>;
  waitUntil(input: { date: Date; idempotencyKey: string }): Promise<void>;
  triggerTask?(
    taskId: string,
    payload: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<unknown>;
};

export async function executeWorkflowInstance(
  payload: WorkflowInstanceTaskPayload,
  store: WorkflowRuntimeStore,
  waits: WorkflowWaitDriver
) {
  const actor: RuntimeActor = {
    tenantId: payload.tenantId,
    ...(payload.initiatorId ? { userId: payload.initiatorId } : {})
  };
  const definition = compileRuntimeDefinition(payload.schema);
  const startNode = definition.nodes.find((node) => node.type === 'start');
  if (!startNode) {
    await store.setInstanceStatus(payload.instanceId, 'failed', {
      message: 'Workflow definition has no start node.'
    });
    throw new Error('Workflow definition has no start node.');
  }

  const startNodeInstance = await enterNodeProjection(payload, store, startNode, 'root:start', 'completed', actor);
  await completeNodeProjection(payload, store, startNode, startNodeInstance, actor);

  const result = await moveToNextNode(payload, store, waits, definition, startNode.id, 'root', actor);
  if (result === 'stopped') {
    return {
      instanceId: payload.instanceId,
      status: 'stopped'
    };
  }

  if (await store.isInstanceRunning(payload.instanceId)) {
    await store.setInstanceStatus(payload.instanceId, 'approved', {
      status: 'approved'
    });
    await emitWorkflowApprovedNotification(payload, store, waits, actor);
  }

  return {
    instanceId: payload.instanceId,
    status: 'completed'
  };
}

async function moveToNextNode(
  payload: WorkflowInstanceTaskPayload,
  store: WorkflowRuntimeStore,
  waits: WorkflowWaitDriver,
  definition: RuntimeDefinition,
  sourceNodeId: string,
  pathKey: string,
  actor: RuntimeActor
): Promise<ExecutionResult> {
  if (!(await store.isInstanceRunning(payload.instanceId))) return 'stopped';

  const variables = await store.getVariables(payload.instanceId);
  const edge = selectOutgoingEdges(definition, sourceNodeId, variables)[0];
  if (!edge) {
    await store.setInstanceStatus(payload.instanceId, 'failed', {
      sourceNodeId,
      message: `Node "${sourceNodeId}" has no matched outgoing edge.`
    });
    throw new Error(`Node "${sourceNodeId}" has no matched outgoing edge.`);
  }

  const targetNode = definition.nodeMap.get(edge.target);
  if (!targetNode) {
    await store.setInstanceStatus(payload.instanceId, 'failed', {
      sourceNodeId,
      targetNodeId: edge.target,
      message: `Target node "${edge.target}" does not exist.`
    });
    throw new Error(`Target node "${edge.target}" does not exist.`);
  }

  return enterNode(payload, store, waits, definition, targetNode, `${pathKey}:${edge.id}`, actor);
}

async function enterNode(
  payload: WorkflowInstanceTaskPayload,
  store: WorkflowRuntimeStore,
  waits: WorkflowWaitDriver,
  definition: RuntimeDefinition,
  node: WorkflowNodeSnapshot,
  pathKey: string,
  actor: RuntimeActor
): Promise<ExecutionResult> {
  if (!(await store.isInstanceRunning(payload.instanceId))) return 'stopped';

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
      case 'approval':
      case 'sign':
      case 'orSign': {
        const result = await waitForHumanNode(payload, store, waits, node, nodeInstance, actor);
        if (result === 'stopped') return 'stopped';
        await completeNodeProjection(payload, store, node, nodeInstance, actor);
        return moveToNextNode(payload, store, waits, definition, node.id, pathKey, actor);
      }
      case 'condition':
        await completeNodeProjection(payload, store, node, nodeInstance, actor);
        return moveToNextNode(payload, store, waits, definition, node.id, pathKey, actor);
      case 'cc':
        await createCcItems(payload, store, waits, node, nodeInstance, actor);
        await completeNodeProjection(payload, store, node, nodeInstance, actor);
        return moveToNextNode(payload, store, waits, definition, node.id, pathKey, actor);
      case 'serviceTask':
        await executeServiceTask(payload, store, node, nodeInstance, actor);
        await completeNodeProjection(payload, store, node, nodeInstance, actor);
        return moveToNextNode(payload, store, waits, definition, node.id, pathKey, actor);
      case 'timer':
        await waitForTimer(payload, store, waits, node, nodeInstance, actor);
        if (!(await store.isInstanceRunning(payload.instanceId))) return 'stopped';
        await completeNodeProjection(payload, store, node, nodeInstance, actor);
        return moveToNextNode(payload, store, waits, definition, node.id, pathKey, actor);
      case 'subProcess':
        await store.recordHistory(
          payload.tenantId,
          payload.instanceId,
          'SUB_PROCESS_COMPLETED',
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
      case 'parallelGateway': {
        await store.recordHistory(
          payload.tenantId,
          payload.instanceId,
          'PARALLEL_GATEWAY_COMPLETED',
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
      case 'end':
        await completeNodeProjection(payload, store, node, nodeInstance, actor);
        return 'continued';
      default:
        await store.setInstanceStatus(payload.instanceId, 'failed', {
          nodeId: node.id,
          nodeType: node.type,
          message: `Unsupported runtime node type "${node.type}".`
        });
        throw new Error(`Unsupported runtime node type "${node.type}".`);
    }
  } catch (error) {
    await store.failNodeInstance(nodeInstance.id, error instanceof Error ? error.message : String(error));
    await store.setInstanceStatus(payload.instanceId, 'failed', {
      nodeId: node.id,
      nodeType: node.type,
      message: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

async function moveToAllNextNodes(
  payload: WorkflowInstanceTaskPayload,
  store: WorkflowRuntimeStore,
  waits: WorkflowWaitDriver,
  definition: RuntimeDefinition,
  sourceNodeId: string,
  pathKey: string,
  actor: RuntimeActor
): Promise<ExecutionResult> {
  const variables = await store.getVariables(payload.instanceId);
  const edges = selectOutgoingEdges(definition, sourceNodeId, variables);
  if (!edges.length) {
    await store.setInstanceStatus(payload.instanceId, 'failed', {
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
  return results.includes('stopped') ? 'stopped' : 'continued';
}

async function enterNodeProjection(
  payload: WorkflowInstanceTaskPayload,
  store: WorkflowRuntimeStore,
  node: WorkflowNodeSnapshot,
  executionKey: string,
  status: NodeInstanceRecord['status'],
  actor: RuntimeActor
) {
  const nodeInstance = await store.createNodeInstance({
    id: randomUUID(),
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
    'NODE_ENTERED',
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

async function completeNodeProjection(
  payload: WorkflowInstanceTaskPayload,
  store: WorkflowRuntimeStore,
  node: WorkflowNodeSnapshot,
  nodeInstance: NodeInstanceRecord,
  actor: RuntimeActor
) {
  await store.completeNodeInstance(nodeInstance.id);
  await store.recordHistory(
    payload.tenantId,
    payload.instanceId,
    'NODE_COMPLETED',
    actor.userId,
    {
      nodeId: node.id,
      nodeType: node.type,
      nodeInstanceId: nodeInstance.id
    },
    `node:${nodeInstance.id}:completed`
  );
}

async function waitForHumanNode(
  payload: WorkflowInstanceTaskPayload,
  store: WorkflowRuntimeStore,
  waits: WorkflowWaitDriver,
  node: WorkflowNodeSnapshot,
  nodeInstance: NodeInstanceRecord,
  actor: RuntimeActor
): Promise<ExecutionResult> {
  const initialTasks = await store.listNodeTasks(nodeInstance.id);
  let pendingDecision: Promise<WorkflowTaskDecision> | undefined;
  if (!initialTasks.length) {
    const { tasks, taskInputs } = await createHumanTasks(payload, store, waits, node, nodeInstance, actor);
    pendingDecision = waitForAnyTaskDecision(
      tasks.filter((task) => Boolean(task.waitpointTokenId)),
      waits
    );
    await store.recordHistory(
      payload.tenantId,
      payload.instanceId,
      'TASK_CREATED',
      actor.userId,
      {
        nodeId: node.id,
        nodeType: node.type,
        taskIds: tasks.map((task) => task.id),
        completionStrategy: completionStrategyForNode(node)
      },
      `node:${nodeInstance.id}:tasks-created`
    );
    void emitTaskCreatedNotifications(payload, store, waits, tasks, taskInputs, actor).catch((error) =>
      store.recordHistory(
        payload.tenantId,
        payload.instanceId,
        'NOTIFICATION_TRIGGER_FAILED',
        actor.userId,
        {
          eventType: 'approval.task.created',
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
    const activeTasks = nodeTasks.filter((task) => task.status === 'pending' || task.status === 'claimed');
    if (!activeTasks.length) break;

    const waitableTasks = activeTasks.filter((task) => Boolean(task.waitpointTokenId));
    if (!waitableTasks.length) {
      await store.setInstanceStatus(payload.instanceId, 'failed', {
        nodeId: node.id,
        nodeInstanceId: nodeInstance.id,
        message: 'Human task has no Trigger.dev waitpoint token.'
      });
      throw new Error('Human task has no Trigger.dev waitpoint token.');
    }

    const decision = await (pendingDecision ?? waitForAnyTaskDecision(waitableTasks, waits));
    pendingDecision = undefined;
    await store.markWaitpointCompleted(decision.taskId);
    if (!(await store.isInstanceRunning(payload.instanceId))) return 'stopped';
    if (decision.action === 'reject') return 'stopped';

    const latestNodeTasks = await store.listNodeTasks(nodeInstance.id);
    if (isHumanNodeCompleted(node, latestNodeTasks)) {
      if (completionStrategyForNode(node) !== 'all') {
        await store.cancelActiveNodeTasks(nodeInstance.id, decision.taskId);
      }
      break;
    }
  }

  return (await store.isInstanceRunning(payload.instanceId)) ? 'continued' : 'stopped';
}

async function createHumanTasks(
  payload: WorkflowInstanceTaskPayload,
  store: WorkflowRuntimeStore,
  waits: WorkflowWaitDriver,
  node: WorkflowNodeSnapshot,
  nodeInstance: NodeInstanceRecord,
  actor: RuntimeActor
) {
  const variables = await store.getVariables(payload.instanceId);
  const strategy = isRecord(node.config?.assigneeStrategy)
    ? node.config.assigneeStrategy
    : { type: 'initiatorManager', level: 1 };
  const assignees = resolveAssignees(strategy, actor, variables);
  const candidates =
    node.type === 'approval'
      ? assignees.candidates.slice(0, 1)
      : assignees.candidates.length
        ? assignees.candidates
        : [
            {
              type: 'user' as const,
              id: assignees.directAssigneeId ?? actor.userId ?? 'initiator-manager',
              snapshot: { id: assignees.directAssigneeId ?? actor.userId ?? 'initiator-manager' }
            }
          ];

  const taskInputs: CreateWorkflowTaskInput[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const workflowTaskId = randomUUID();
    const token = await waits.createToken({
      idempotencyKey: `workflow:${payload.instanceId}:node:${nodeInstance.id}:task:${index}:${candidate.type}:${candidate.id}`,
      tags: [
        `tenant:${payload.tenantId}`,
        `workflow-instance:${payload.instanceId}`,
        `workflow-task:${workflowTaskId}`,
        `node:${node.id}`,
        `node-instance:${nodeInstance.id}`
      ]
    });
    taskInputs.push({
      id: workflowTaskId,
      tenantId: payload.tenantId,
      processInstanceId: payload.instanceId,
      nodeInstanceId: nodeInstance.id,
      nodeId: node.id,
      title: `${payload.title} - ${node.name}`,
      assigneeId: candidate.type === 'user' ? candidate.id : assignees.directAssigneeId,
      waitpointTokenId: token.id,
      candidates: [
        {
          id: randomUUID(),
          candidateType: candidate.type,
          candidateId: candidate.id,
          snapshot: candidate.snapshot
        }
      ]
    });
  }

  const tasks = await store.createTasks(taskInputs);
  return { tasks, taskInputs };
}

async function emitTaskCreatedNotifications(
  payload: WorkflowInstanceTaskPayload,
  store: WorkflowRuntimeStore,
  waits: WorkflowWaitDriver,
  tasks: WorkflowTaskRecord[],
  taskInputs: CreateWorkflowTaskInput[],
  actor: RuntimeActor
) {
  await Promise.all(
    tasks.map((workflowTask, index) => {
      const recipients = recipientIdsForTask(workflowTask, taskInputs[index]);
      return triggerNotificationEvent(payload, store, waits, actor, {
        eventType: 'approval.task.created',
        sourceType: 'workflow_task',
        sourceId: workflowTask.id,
        idempotencyKey: `approval-task:${workflowTask.id}:created`,
        payload: {
          title: workflowTask.title,
          taskId: workflowTask.id,
          instanceId: workflowTask.processInstanceId,
          nodeId: workflowTask.nodeId,
          recipientIds: recipients,
          linkUrl: `/dashboard/workflow/tasks/${workflowTask.id}`,
          priority: 'normal'
        }
      });
    })
  );
}

async function emitCcCreatedNotifications(
  payload: WorkflowInstanceTaskPayload,
  store: WorkflowRuntimeStore,
  waits: WorkflowWaitDriver,
  items: WorkflowCcRecord[],
  actor: RuntimeActor
) {
  await Promise.all(
    items.map((item) => {
      const recipients = recipientIdsForCc(item);
      return triggerNotificationEvent(payload, store, waits, actor, {
        eventType: 'approval.cc.created',
        sourceType: 'workflow_cc',
        sourceId: item.id,
        idempotencyKey: `approval-cc:${item.id}:created`,
        payload: {
          title: item.title,
          ccId: item.id,
          instanceId: item.processInstanceId,
          nodeId: item.nodeId,
          recipientIds: recipients,
          linkUrl: `/dashboard/workflow/instances/${item.processInstanceId}`,
          priority: 'normal'
        }
      });
    })
  );
}

async function triggerNotificationEvent(
  payload: WorkflowInstanceTaskPayload,
  store: WorkflowRuntimeStore,
  waits: WorkflowWaitDriver,
  actor: RuntimeActor,
  input: {
    eventType: string;
    sourceType: string;
    sourceId: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  }
) {
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
      'NOTIFICATION_TRIGGER_FAILED',
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

async function emitWorkflowApprovedNotification(
  payload: WorkflowInstanceTaskPayload,
  store: WorkflowRuntimeStore,
  waits: WorkflowWaitDriver,
  actor: RuntimeActor
) {
  if (!payload.initiatorId?.trim()) return;

  await triggerNotificationEvent(payload, store, waits, actor, {
    eventType: 'approval.instance.approved',
    sourceType: 'workflow_instance',
    sourceId: payload.instanceId,
    idempotencyKey: `approval-instance:${payload.instanceId}:approved`,
    payload: {
      title: payload.title,
      instanceId: payload.instanceId,
      definitionId: payload.definitionId,
      recipientIds: [payload.initiatorId],
      linkUrl: `/dashboard/workflow/instances/${payload.instanceId}`,
      priority: 'normal'
    }
  });
}

function recipientIdsForTask(
  task: WorkflowTaskRecord,
  input: CreateWorkflowTaskInput | undefined
) {
  return [
    ...new Set(
      [
        task.assigneeId,
        ...(input?.candidates ?? [])
          .filter((candidate) => candidate.candidateType === 'user')
          .map((candidate) => candidate.candidateId)
      ]
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter(Boolean)
    )
  ];
}

function recipientIdsForCc(item: WorkflowCcRecord) {
  return [
    ...new Set(
      [
        item.recipientId,
        item.candidateType === 'user' ? item.candidateId : undefined
      ]
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter(Boolean)
    )
  ];
}

async function waitForAnyTaskDecision(
  tasks: WorkflowTaskRecord[],
  waits: WorkflowWaitDriver
): Promise<WorkflowTaskDecision> {
  if (!tasks.length) {
    throw new Error('Human node has no waitable tasks.');
  }

  if (tasks.length === 1) {
    return waitForTaskDecision(tasks[0], waits);
  }

  const decisions = tasks.map((task) => waitForTaskDecision(task, waits));
  return Promise.race(decisions);
}

function waitForTaskDecision(
  task: WorkflowTaskRecord,
  waits: WorkflowWaitDriver
): Promise<WorkflowTaskDecision> {
  if (!task.waitpointTokenId) {
    throw new Error(`Task "${task.id}" has no waitpoint token.`);
  }

  return waits.waitForToken<WorkflowTaskDecision>(task.waitpointTokenId);
}

async function createCcItems(
  payload: WorkflowInstanceTaskPayload,
  store: WorkflowRuntimeStore,
  waits: WorkflowWaitDriver,
  node: WorkflowNodeSnapshot,
  nodeInstance: NodeInstanceRecord,
  actor: RuntimeActor
) {
  const variables = await store.getVariables(payload.instanceId);
  const strategy = isRecord(node.config?.assigneeStrategy)
    ? node.config.assigneeStrategy
    : { type: 'users', userIds: actor.userId ? [actor.userId] : [] };
  const assignees = resolveAssignees(strategy, actor, variables);
  const items = await store.createCcItems(
    assignees.candidates.map((candidate) => ({
      id: randomUUID(),
      tenantId: payload.tenantId,
      processInstanceId: payload.instanceId,
      nodeInstanceId: nodeInstance.id,
      nodeId: node.id,
      title: `${payload.title} - ${node.name}`,
      ...(candidate.type === 'user' ? { recipientId: candidate.id } : {}),
      candidateType: candidate.type,
      candidateId: candidate.id
    }))
  );
  await emitCcCreatedNotifications(payload, store, waits, items, actor);
  await store.recordHistory(
    payload.tenantId,
    payload.instanceId,
    'CC_CREATED',
    actor.userId,
    {
      nodeId: node.id,
      nodeInstanceId: nodeInstance.id,
      recipients: items
    },
    `node:${nodeInstance.id}:cc-created`
  );
}

async function executeServiceTask(
  payload: WorkflowInstanceTaskPayload,
  store: WorkflowRuntimeStore,
  node: WorkflowNodeSnapshot,
  nodeInstance: NodeInstanceRecord,
  actor: RuntimeActor
) {
  const config = node.config ?? {};
  const url = readString(config.url);
  let output: unknown = { handledBy: 'workflow.instance.run' };

  if (url) {
    const variables = await store.getVariables(payload.instanceId);
    const response = await fetchWithTimeout(url, {
      method: readString(config.method, 'POST'),
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        instanceId: payload.instanceId,
        tenantId: payload.tenantId,
        nodeId: node.id,
        nodeInstanceId: nodeInstance.id,
        variables,
        config
      }),
      timeoutSeconds: typeof config.timeoutSeconds === 'number' ? config.timeoutSeconds : 30
    });
    output = await readResponseBody(response);
    if (!response.ok) {
      throw new Error(`Service task "${node.id}" failed with HTTP ${response.status}.`);
    }
  }

  await store.recordHistory(
    payload.tenantId,
    payload.instanceId,
    'SERVICE_TASK_COMPLETED',
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

async function waitForTimer(
  payload: WorkflowInstanceTaskPayload,
  store: WorkflowRuntimeStore,
  waits: WorkflowWaitDriver,
  node: WorkflowNodeSnapshot,
  nodeInstance: NodeInstanceRecord,
  actor: RuntimeActor
) {
  const dueAt = resolveTimerDueAt(node.config);
  await store.recordHistory(
    payload.tenantId,
    payload.instanceId,
    'TIMER_SCHEDULED',
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
    'TIMER_FIRED',
    actor.userId,
    {
      nodeId: node.id,
      nodeInstanceId: nodeInstance.id,
      dueAt: dueAt.toISOString()
    },
    `node:${nodeInstance.id}:timer-fired`
  );
}

function compileRuntimeDefinition(schema: Record<string, unknown>): RuntimeDefinition {
  const nodes = Array.isArray(schema.nodes)
    ? schema.nodes.filter(isRecord).map((node) => ({
        id: readString(node.id),
        type: readString(node.type),
        name: readString(node.name, readString(node.type)),
        ...(isRecord(node.config) ? { config: node.config } : {})
      }))
    : [];
  const edges = Array.isArray(schema.edges)
    ? schema.edges.filter(isRecord).map((edge) => ({
        id: readString(edge.id),
        source: readString(edge.source),
        target: readString(edge.target),
        ...(typeof edge.priority === 'number' ? { priority: edge.priority } : {}),
        ...(isRecord(edge.condition) ? { condition: edge.condition } : {})
      }))
    : [];

  return {
    nodes,
    edges,
    nodeMap: new Map(nodes.map((node) => [node.id, node]))
  };
}

function selectOutgoingEdges(
  definition: RuntimeDefinition,
  sourceNodeId: string,
  variables: Record<string, unknown>
) {
  return definition.edges
    .filter((edge) => edge.source === sourceNodeId)
    .sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0))
    .filter((edge) => matchesCondition(edge.condition, variables));
}

function matchesCondition(condition: Record<string, unknown> | undefined, variables: Record<string, unknown>) {
  if (!condition || condition.type === 'always') return true;
  if (condition.type !== 'field') return false;

  const field = readString(condition.field);
  const operator = readString(condition.operator, 'eq');
  const left = variables[field];
  const right = condition.value;

  switch (operator) {
    case 'eq':
      return left === right;
    case 'ne':
      return left !== right;
    case 'gt':
      return Number(left) > Number(right);
    case 'gte':
      return Number(left) >= Number(right);
    case 'lt':
      return Number(left) < Number(right);
    case 'lte':
      return Number(left) <= Number(right);
    case 'in':
      return Array.isArray(right) && right.includes(left);
    case 'contains':
      return Array.isArray(left) ? left.includes(right) : String(left ?? '').includes(String(right ?? ''));
    default:
      return false;
  }
}

function resolveAssignees(
  strategy: Record<string, unknown>,
  actor: RuntimeActor,
  variables: Record<string, unknown>
) {
  const type = readString(strategy.type, 'initiatorManager');

  if (type === 'users' && Array.isArray(strategy.userIds)) {
    const userIds = strategy.userIds.filter((userId): userId is string => typeof userId === 'string');
    return {
      directAssigneeId: userIds[0],
      candidates: userIds.map((userId) => ({
        type: 'user' as const,
        id: userId,
        snapshot: { id: userId }
      }))
    };
  }

  if (type === 'roles' && Array.isArray(strategy.roleCodes)) {
    const roleCodes = strategy.roleCodes.filter((roleCode): roleCode is string => typeof roleCode === 'string');
    return {
      directAssigneeId: undefined,
      candidates: roleCodes.map((roleCode) => ({
        type: 'role' as const,
        id: roleCode,
        snapshot: { code: roleCode }
      }))
    };
  }

  if (type === 'departments' && Array.isArray(strategy.departmentIds)) {
    const departmentIds = strategy.departmentIds.filter(
      (departmentId): departmentId is string => typeof departmentId === 'string'
    );
    return {
      directAssigneeId: undefined,
      candidates: departmentIds.map((departmentId) => ({
        type: 'department' as const,
        id: departmentId,
        snapshot: { id: departmentId }
      }))
    };
  }

  if (type === 'field') {
    const value = variables[readString(strategy.field)];
    const userIds = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : typeof value === 'string'
        ? [value]
        : [];
    if (userIds.length) {
      return {
        directAssigneeId: userIds[0],
        candidates: userIds.map((userId) => ({
          type: 'user' as const,
          id: userId,
          snapshot: { id: userId, source: 'field' }
        }))
      };
    }
  }

  const fallbackUserId = actor.userId ?? 'initiator-manager';
  return {
    directAssigneeId: fallbackUserId,
    candidates: [
      {
        type: 'user' as const,
        id: fallbackUserId,
        snapshot: { id: fallbackUserId, strategy: type }
      }
    ]
  };
}

function isHumanNodeCompleted(node: WorkflowNodeSnapshot, tasks: WorkflowTaskRecord[]) {
  const humanTasks = tasks.filter((task) => task.status !== 'canceled');
  const completedCount = humanTasks.filter((task) => task.status === 'completed').length;
  if (!humanTasks.length) return false;

  const strategy = completionStrategyForNode(node);
  if (strategy === 'any') return completedCount >= 1;
  if (strategy === 'ratio') {
    const passRatio = typeof node.config?.passRatio === 'number' && node.config.passRatio > 0
      ? node.config.passRatio
      : 1;
    return completedCount / humanTasks.length >= passRatio;
  }
  return completedCount === humanTasks.length;
}

function completionStrategyForNode(node: WorkflowNodeSnapshot) {
  if (node.type === 'orSign') return 'any';
  const strategy = readString(node.config?.completionStrategy, 'all');
  return strategy === 'any' || strategy === 'ratio' ? strategy : 'all';
}

function initialNodeStatus(nodeType: string): NodeInstanceRecord['status'] {
  if (nodeType === 'timer') return 'waiting';
  if (nodeType === 'approval' || nodeType === 'sign' || nodeType === 'orSign') return 'running';
  return 'completed';
}

function resolveTimerDueAt(config: Record<string, unknown> | undefined) {
  const now = Date.now();
  const mode = readString(config?.mode);

  if (mode === 'datetime') {
    const datetime = readString(config?.datetime);
    const dueAt = new Date(datetime);
    if (Number.isNaN(dueAt.getTime())) {
      throw new Error('Timer node datetime is invalid.');
    }
    return dueAt;
  }

  if (mode === 'delay' && typeof config?.duration === 'string') {
    return new Date(now + parseIsoDurationMillis(config.duration));
  }

  if (typeof config?.delaySeconds === 'number') {
    return new Date(now + Math.max(0, config.delaySeconds) * 1000);
  }

  return new Date(now);
}

function readDelaySeconds(config: Record<string, unknown> | undefined) {
  if (typeof config?.delaySeconds === 'number') return Math.max(0, config.delaySeconds);
  if (readString(config?.mode) === 'delay' && typeof config?.duration === 'string') {
    return Math.max(0, Math.ceil(parseIsoDurationMillis(config.duration) / 1000));
  }
  return 0;
}

function parseIsoDurationMillis(duration: string) {
  const match = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) {
    throw new Error('Timer node duration must be an ISO-8601 duration like PT2H.');
  }

  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match;
  return (
    Number(days) * 24 * 60 * 60 * 1000 +
    Number(hours) * 60 * 60 * 1000 +
    Number(minutes) * 60 * 1000 +
    Number(seconds) * 1000
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutSeconds: number }
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutSeconds * 1000);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { body: text };
  }
}

type RuntimeDefinition = {
  nodes: WorkflowNodeSnapshot[];
  edges: WorkflowEdgeSnapshot[];
  nodeMap: Map<string, WorkflowNodeSnapshot>;
};

type ExecutionResult = 'continued' | 'stopped';
