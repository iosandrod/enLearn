import { runs } from '@trigger.dev/sdk';
import { getWorkflowEnv } from '../src/common/env';

const actorUserId = process.env.SMOKE_WORKFLOW_USER_ID ?? '5efcd1fd-5448-4f7b-9b75-9b60fbcf1c08';
const tenantId = process.env.SMOKE_WORKFLOW_TENANT_ID ?? 'default';
const workflowApiBase =
  process.env.SMOKE_WORKFLOW_API_BASE ?? 'http://127.0.0.1:3010/api/workflow';

getWorkflowEnv();

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const suffix = Date.now().toString(36);
  const code = `smoke_minimal_approval_${suffix}`;
  const businessKey = `smoke-minimal-${suffix}`;
  const schema = createMinimalApprovalWorkflow(code, actorUserId);

  const model = await workflowApi<Record<string, unknown>>('/models', {
    method: 'POST',
    body: {
      tenantId,
      code,
      name: `Smoke minimal approval ${suffix}`,
      documentType: 'minimal_approval',
      schema
    }
  });

  const published = await workflowApi<PublishResult>(`/models/${readId(model, 'model')}/publish`, {
    method: 'POST',
    body: { remark: 'Smoke test minimal approval' }
  });

  const instance = await workflowApi<WorkflowInstance>('/instances', {
    method: 'POST',
    body: {
      definitionId: published.definition.id,
      businessKey,
      documentType: 'minimal_approval',
      documentId: businessKey,
      title: `Smoke minimal approval ${suffix}`,
      variables: {
        applicantId: actorUserId,
        businessKey,
        currentUserId: actorUserId,
        documentId: businessKey,
        initiatorId: actorUserId,
        minimalApproval: true,
        userId: actorUserId
      }
    }
  });

  const pendingTask = await poll(
    async () => {
      const tasks = await workflowApi<WorkflowTask[]>('/tasks/todo?status=pending', {
        method: 'GET'
      });
      return tasks.find(
        (task) => task.processInstanceId === instance.id && task.assigneeId === actorUserId
      );
    },
    { timeoutMs: 30_000, intervalMs: 1_000, label: 'pending task' }
  );

  await workflowApi<WorkflowInstance>(`/tasks/${pendingTask.id}/approve`, {
    method: 'POST',
    body: {
      comment: 'Smoke approved',
      variables: { smokeApproved: true }
    }
  });

  const completed = await poll(
    async () => {
      const current = await workflowApi<WorkflowInstance>(`/instances/${instance.id}`, {
        method: 'GET'
      });
      return current.status === 'approved' ? current : undefined;
    },
    { timeoutMs: 30_000, intervalMs: 1_000, label: 'approved instance' }
  );

  const finalTask = await workflowApi<WorkflowTask>(`/tasks/${pendingTask.id}`, {
    method: 'GET'
  });

  const triggerRun =
    typeof completed.triggerRunId === 'string' && completed.triggerRunId
      ? await poll(
          async () => {
            const run = await runs.retrieve(completed.triggerRunId!);
            return run.status === 'COMPLETED' ? run : undefined;
          },
          { timeoutMs: 30_000, intervalMs: 1_000, label: 'completed Trigger.dev run' }
        )
      : undefined;

  console.log(
    JSON.stringify(
      {
        passed: true,
        modelId: readId(model, 'model'),
        definitionId: published.definition.id,
        instanceId: completed.id,
        instanceStatus: completed.status,
        taskId: pendingTask.id,
        taskStatus: finalTask.status,
        triggerRunId: completed.triggerRunId,
        triggerRunStatus: triggerRun?.status
      },
      null,
      2
    )
  );
}

async function workflowApi<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: Record<string, unknown> }
): Promise<T> {
  const response = await fetch(`${workflowApiBase}${path}`, {
    method: init.method,
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': tenantId,
      'x-user-id': actorUserId
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {})
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok || parsed.success === false) {
    throw new Error(`Workflow API ${init.method} ${path} failed: ${response.status} ${text}`);
  }
  return parsed.data as T;
}

async function poll<T>(
  resolver: () => Promise<T | undefined>,
  options: { timeoutMs: number; intervalMs: number; label: string }
) {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() <= deadline) {
    const value = await resolver();
    if (value) return value;
    await delay(options.intervalMs);
  }
  throw new Error(`Timed out waiting for ${options.label}.`);
}

function createMinimalApprovalWorkflow(code: string, userId: string) {
  return {
    schemaVersion: 1,
    code,
    name: 'Smoke minimal approval',
    documentType: 'minimal_approval',
    status: 'draft',
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: 'Start',
        position: { x: 360, y: 48 }
      },
      {
        id: 'approval',
        type: 'approval',
        name: 'Approve',
        position: { x: 360, y: 258 },
        config: {
          assigneeStrategy: {
            type: 'users',
            userIds: [userId]
          },
          allowReject: true
        }
      },
      {
        id: 'end',
        type: 'end',
        name: 'End',
        position: { x: 360, y: 468 }
      }
    ],
    edges: [
      {
        id: 'edge_start_approval',
        source: 'start',
        target: 'approval'
      },
      {
        id: 'edge_approval_end',
        source: 'approval',
        target: 'end'
      }
    ],
    settings: {
      allowCancel: true,
      allowWithdraw: true,
      duplicateSubmitPolicy: 'reject',
      historyLevel: 'full'
    }
  };
}

function readId(value: Record<string, unknown>, label: string) {
  if (typeof value.id === 'string') return value.id;
  throw new Error(`Missing ${label} id.`);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

type PublishResult = {
  definition: {
    id: string;
  };
};

type WorkflowInstance = {
  id: string;
  status: string;
  triggerRunId?: string;
};

type WorkflowTask = {
  id: string;
  processInstanceId: string;
  assigneeId?: string;
  status: string;
};
