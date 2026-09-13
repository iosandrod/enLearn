import { randomUUID } from 'node:crypto';
import type {
  CreateWorkflowTaskInput,
  HumanTaskAdapterInput,
  HumanTaskAdapterResult,
  WorkflowRuntimeStore,
  WorkflowTaskDecision
} from './runtime.engine.types';

export type HumanTaskWaitDriver = {
  createToken(input: { idempotencyKey: string; tags: string[] }): Promise<{ id: string }>;
  waitForToken<T>(tokenId: string): Promise<T>;
  waitFor?(input: { seconds: number; idempotencyKey: string }): Promise<void>;
  triggerTask?(taskId: string, payload: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
};

/** Shared durable human-task adapter used by approval and Trigger workflows. */
export async function executeHumanTaskAdapter(
  input: HumanTaskAdapterInput,
  store: WorkflowRuntimeStore,
  waits: HumanTaskWaitDriver
): Promise<HumanTaskAdapterResult> {
  let tasks = await store.listNodeTasks(input.nodeInstanceId);
  if (!tasks.length) {
    const taskInputs: CreateWorkflowTaskInput[] = [];
    for (const [index, candidate] of input.candidates.entries()) {
      const taskId = randomUUID();
      const token = await waits.createToken({
        idempotencyKey: `human-task:${input.processInstanceId}:${input.nodeInstanceId}:${index}:${candidate.type}:${candidate.id}`,
        tags: [
          `tenant:${input.tenantId}`,
          `workflow-instance:${input.processInstanceId}`,
          `workflow-task:${taskId}`,
          `node:${input.nodeId}`,
          `node-instance:${input.nodeInstanceId}`
        ]
      });
      taskInputs.push({
        id: taskId,
        tenantId: input.tenantId,
        processInstanceId: input.processInstanceId,
        nodeInstanceId: input.nodeInstanceId,
        nodeId: input.nodeId,
        title: input.title,
        assigneeId: candidate.type === 'user' ? candidate.id : undefined,
        waitpointTokenId: token.id,
        candidates: [{
          id: randomUUID(),
          candidateType: candidate.type,
          candidateId: candidate.id,
          snapshot: candidate.snapshot ?? { id: candidate.id }
        }]
      });
    }
    tasks = await store.createTasks(taskInputs);
    await store.recordHistory(
      input.tenantId,
      input.processInstanceId,
      'HUMAN_TASK_CREATED',
      undefined,
      {
        nodeId: input.nodeId,
        nodeInstanceId: input.nodeInstanceId,
        taskIds: tasks.map((task) => task.id),
        completionStrategy: input.completionStrategy,
        candidateCount: input.candidates.length
      },
      `human-task:${input.nodeInstanceId}:created`
    );
    if (waits.triggerTask) {
      await Promise.all(tasks.map((task) => waits.triggerTask!(
        'notification.dispatch',
        {
          tenantId: input.tenantId,
          event: {
            tenantId: input.tenantId,
            eventType: 'approval.task.created',
            sourceType: 'workflow_task',
            sourceId: task.id,
            payload: { title: task.title, taskId: task.id, instanceId: input.processInstanceId, nodeId: input.nodeId },
            idempotencyKey: `human-task:${task.id}:notification`
          }
        },
        { idempotencyKey: `human-task:${task.id}:notification` }
      )));
    }
  }

  const waitable = tasks.filter((task) => task.status === 'pending' || task.status === 'claimed');
  if (!waitable.length) {
    const completed = tasks.filter((task) => task.status === 'completed');
    return { status: completed.length ? 'continued' : 'stopped', decisions: [], completedTaskIds: completed.map((task) => task.id) };
  }
  const decisions = await waitForPolicy(
    waitable,
    input.completionStrategy,
    input.passRatio ?? 1,
    waits,
    input.timeoutSeconds,
    input.onTimeout
  );
  const rejected = decisions.some((decision) => decision.action === 'reject');
  for (const decision of decisions) await store.markWaitpointCompleted(decision.taskId);
  if (input.completionStrategy !== 'all' && store.cancelActiveNodeTasks) {
    const winner = decisions.at(-1)?.taskId;
    await store.cancelActiveNodeTasks(input.nodeInstanceId, winner);
  }
  if (rejected) {
    await store.recordHistory(input.tenantId, input.processInstanceId, 'HUMAN_TASK_REJECTED', undefined, { nodeId: input.nodeId, decisions }, `human-task:${input.nodeInstanceId}:rejected`);
    return { status: 'stopped', decisions, completedTaskIds: decisions.map((decision) => decision.taskId) };
  }
  await store.recordHistory(input.tenantId, input.processInstanceId, 'HUMAN_TASK_COMPLETED', undefined, { nodeId: input.nodeId, decisions }, `human-task:${input.nodeInstanceId}:completed`);
  return { status: 'continued', decisions, completedTaskIds: decisions.map((decision) => decision.taskId) };
}

async function waitForPolicy(
  tasks: Array<{ id: string; waitpointTokenId?: string }>,
  strategy: HumanTaskAdapterInput['completionStrategy'],
  ratio: number,
  waits: HumanTaskWaitDriver,
  timeoutSeconds?: number,
  onTimeout: HumanTaskAdapterInput['onTimeout'] = 'fail'
) {
  const wait = tasks.map((task) => {
    if (!task.waitpointTokenId) throw new Error(`Human task "${task.id}" has no waitpoint token.`);
    const pending = waits.waitForToken<WorkflowTaskDecision>(task.waitpointTokenId);
    if (!timeoutSeconds || timeoutSeconds <= 0 || !waits.waitFor) return pending;
    return Promise.race([
      pending,
      waits.waitFor({ seconds: timeoutSeconds, idempotencyKey: `human-task-timeout:${task.id}` })
        .then(() => {
          if (onTimeout === 'fail') throw new Error(`Human task "${task.id}" timed out.`);
          return {
            action: onTimeout === 'autoReject' ? 'reject' : 'approve',
            taskId: task.id,
            nodeId: '',
            comment: 'Timed out'
          } as WorkflowTaskDecision;
        })
    ]);
  });
  if (strategy === 'any') return [await Promise.race(wait)];
  if (strategy === 'all') return Promise.all(wait);
  const required = Math.max(1, Math.ceil(tasks.length * Math.min(1, Math.max(0, ratio))));
  const decisions: WorkflowTaskDecision[] = [];
  while (decisions.length < required) decisions.push(await Promise.race(wait.filter((_, index) => !decisions.some((decision) => decision.taskId === tasks[index].id))));
  return decisions;
}
