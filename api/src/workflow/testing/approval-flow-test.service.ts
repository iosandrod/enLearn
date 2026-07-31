import { Injectable } from '@nestjs/common';
import { DefinitionService } from '../definition/definition.service';
import type { WorkflowRequestActor } from '../definition/definition.types';
import { RuntimeService } from '../runtime/runtime.service';
import type { WorkflowTaskRecord } from '../runtime/runtime.types';

type ApprovalFlowTestInput = {
  tenantId?: unknown;
  userId?: unknown;
  timeoutMs?: unknown;
  intervalMs?: unknown;
};

type ApprovalFlowTestStep = {
  taskId: string;
  nodeId: string;
  assigneeId?: string;
  status: string;
  comment: string;
};

@Injectable()
export class ApprovalFlowTestService {
  constructor(
    private readonly definitionService: DefinitionService,
    private readonly runtimeService: RuntimeService
  ) {}

  async runOneClick(input: ApprovalFlowTestInput, actor: WorkflowRequestActor) {
    const userId = readString(input.userId) || actor.userId?.trim();
    if (!userId) {
      throw new Error('A signed-in user is required to run the approval flow test.');
    }

    const tenantId = readString(input.tenantId) || actor.tenantId || 'default';
    const testActor = { tenantId, userId };
    const suffix = Date.now().toString(36);
    const businessKey = `approval-flow-test-${suffix}`;
    const schema = createApprovalFlowTestSchema(suffix, userId);
    const testData = createApprovalFlowTestData(businessKey, userId);
    const timeoutMs = clampNumber(input.timeoutMs, 10_000, 180_000, 90_000);
    const intervalMs = clampNumber(input.intervalMs, 500, 10_000, 2_000);

    const model = await this.definitionService.saveModel(
      {
        tenantId,
        code: schema.code,
        name: schema.name,
        documentType: schema.documentType,
        schema
      },
      testActor
    );

    const published = await this.definitionService.publishModel(
      model.id,
      { remark: 'One-click approval flow test data' },
      testActor
    );

    const instance = await this.runtimeService.startInstance(
      {
        definitionId: published.definition.id,
        businessKey,
        documentType: schema.documentType,
        documentId: businessKey,
        title: testData.title,
        variables: testData.variables
      },
      testActor
    );

    const approvedSteps: ApprovalFlowTestStep[] = [];
    let currentInstance = instance;

    while (currentInstance.status === 'running') {
      const task = await this.waitForPendingTask(
        currentInstance.id,
        testActor,
        timeoutMs,
        intervalMs
      );

      const comment = `One-click approved ${task.nodeId}`;
      await this.runtimeService.completeTask(
        task.id,
        {
          comment,
          variables: {
            [`${task.nodeId}Approved`]: true,
            lastApprovedTaskId: task.id,
            lastApproverId: userId
          }
        },
        testActor
      );

      approvedSteps.push({
        taskId: task.id,
        nodeId: task.nodeId,
        ...(task.assigneeId ? { assigneeId: task.assigneeId } : {}),
        status: 'completed',
        comment
      });

      currentInstance = await this.waitForInstanceProgress(
        currentInstance.id,
        approvedSteps.length,
        testActor,
        timeoutMs,
        intervalMs
      );
    }

    const detail = await this.runtimeService.getInstance(currentInstance.id);
    const timeline = await this.runtimeService.getTimeline(currentInstance.id);

    return {
      passed: currentInstance.status === 'approved',
      modelId: model.id,
      definitionId: published.definition.id,
      instanceId: currentInstance.id,
      instanceStatus: currentInstance.status,
      triggerRunId: currentInstance.triggerRunId,
      approvedSteps,
      finalTasks: detail.tasks,
      timeline,
      testData: {
        tenantId,
        userId,
        businessKey,
        documentType: schema.documentType,
        schema,
        variables: testData.variables
      }
    };
  }

  private async waitForPendingTask(
    instanceId: string,
    actor: { tenantId: string; userId: string },
    timeoutMs: number,
    intervalMs: number
  ) {
    return poll(
      async () => {
        const detail = await this.runtimeService.getInstance(instanceId);
        if (detail.status !== 'running') {
          throw new Error(`Workflow ended before the next approval task was created: ${detail.status}.`);
        }

        const tasks = await this.runtimeService.listTodoTasks(actor, {
          tenantId: actor.tenantId,
          status: 'pending'
        });
        return tasks.find((task) => task.processInstanceId === instanceId);
      },
      timeoutMs,
      intervalMs,
      'pending approval task'
    );
  }

  private async waitForInstanceProgress(
    instanceId: string,
    approvedCount: number,
    actor: { tenantId: string; userId: string },
    timeoutMs: number,
    intervalMs: number
  ) {
    return poll(
      async () => {
        const detail = await this.runtimeService.getInstance(instanceId);
        if (detail.status !== 'running') return detail;

        const nextTask = await this.findPendingTask(instanceId, actor);
        if (nextTask) return detail;

        const completedCount = detail.tasks.filter((task) => task.status === 'completed').length;
        return completedCount > approvedCount ? detail : undefined;
      },
      timeoutMs,
      intervalMs,
      'workflow progress after approval'
    );
  }

  private async findPendingTask(
    instanceId: string,
    actor: { tenantId: string; userId: string }
  ): Promise<WorkflowTaskRecord | undefined> {
    const tasks = await this.runtimeService.listTodoTasks(actor, {
      tenantId: actor.tenantId,
      status: 'pending'
    });
    return tasks.find((task) => task.processInstanceId === instanceId);
  }
}

function createApprovalFlowTestSchema(suffix: string, approverId: string) {
  const code = `approval_flow_one_click_test_${suffix}`;

  return {
    schemaVersion: 1,
    code,
    name: `Approval flow one-click test ${suffix}`,
    documentType: 'approval_flow_test',
    status: 'draft',
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: 'Start',
        position: { x: 360, y: 40 }
      },
      {
        id: 'department_approval',
        type: 'approval',
        name: 'Department approval',
        position: { x: 360, y: 210 },
        config: {
          assigneeStrategy: {
            type: 'users',
            userIds: [approverId]
          },
          allowReject: true
        }
      },
      {
        id: 'finance_approval',
        type: 'approval',
        name: 'Finance approval',
        position: { x: 360, y: 380 },
        config: {
          assigneeStrategy: {
            type: 'users',
            userIds: [approverId]
          },
          allowReject: true
        }
      },
      {
        id: 'end',
        type: 'end',
        name: 'End',
        position: { x: 360, y: 550 }
      }
    ],
    edges: [
      {
        id: 'edge_start_department',
        source: 'start',
        target: 'department_approval'
      },
      {
        id: 'edge_department_finance',
        source: 'department_approval',
        target: 'finance_approval'
      },
      {
        id: 'edge_finance_end',
        source: 'finance_approval',
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

function createApprovalFlowTestData(businessKey: string, userId: string) {
  return {
    title: `Approval flow one-click test ${businessKey}`,
    variables: {
      amount: 68_000,
      applicantId: userId,
      approverIds: [userId, userId],
      businessKey,
      currentUserId: userId,
      documentId: businessKey,
      expenseCategory: 'software',
      initiatorId: userId,
      requesterId: userId,
      summary: 'One-click test data based on the runnable Trigger.dev approval sample.',
      testSource: 'approval-flow-trigger-vue',
      userId
    }
  };
}

async function poll<T>(
  resolver: () => Promise<T | undefined>,
  timeoutMs: number,
  intervalMs: number,
  label: string
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const value = await resolver();
    if (value) return value;
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}. Check the workflow service and Trigger.dev worker.`);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
