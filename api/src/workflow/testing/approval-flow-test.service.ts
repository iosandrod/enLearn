import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DefinitionService } from '../definition/definition.service';
import type { WorkflowRequestActor } from '../definition/definition.types';
import { RuntimeService } from '../runtime/runtime.service';

type ApprovalFlowTestInput = {
  tenantId?: unknown;
  userId?: unknown;
  approverIds?: unknown;
  schema?: unknown;
  timeoutMs?: unknown;
  intervalMs?: unknown;
};

type ApprovalFlowTestSchema = Record<string, unknown> & {
  code: string;
  name: string;
  documentType: string;
};

@Injectable()
export class ApprovalFlowTestService {
  constructor(
    @Inject(DefinitionService)
    private readonly definitionService: DefinitionService,
    @Inject(RuntimeService)
    private readonly runtimeService: RuntimeService
  ) {}

  async runOneClick(input: ApprovalFlowTestInput, actor: WorkflowRequestActor) {
    const userId = readString(input.userId) || actor.userId?.trim();
    if (!userId) {
      throw new Error('A signed-in user is required to run the approval flow test.');
    }
    if (!isUuid(userId)) {
      throw new Error('Approval flow test requires a real UUID user. Please switch to a database user first.');
    }

    const tenantId = readString(input.tenantId) || actor.tenantId || 'default';
    const testActor = { tenantId, userId };
    const suffix = createTestRunSuffix();
    const businessKey = `approval-flow-test-${suffix}`;
    const requestedApproverIds = readStringArray(input.approverIds).filter(isUuid);
    const schema = prepareApprovalFlowTestSchema(input.schema, suffix, userId, requestedApproverIds);
    const approverIds = collectWorkflowUserAssignees(schema);
    const testData = createApprovalFlowTestData(businessKey, userId, approverIds, schema);
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

    const taskState = await this.waitForPendingTaskState(
      instance.id,
      timeoutMs,
      intervalMs
    );
    const detail = taskState.detail;
    const pendingTasks = taskState.pendingTasks;
    const nextTask = pendingTasks[0];
    const timeline = await this.runtimeService.getTimeline(instance.id);

    return {
      started: true,
      passed: detail.status === 'approved',
      modelId: model.id,
      definitionId: published.definition.id,
      instanceId: detail.id,
      instanceStatus: detail.status,
      triggerRunId: detail.triggerRunId,
      approvedSteps: [],
      pendingTasks,
      ...(nextTask ? { nextTask, nextTaskRoute: `/dashboard/workflow/tasks/${nextTask.id}` } : {}),
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

  private async waitForPendingTaskState(
    instanceId: string,
    timeoutMs: number,
    intervalMs: number
  ) {
    return poll(
      async () => {
        const detail = await this.runtimeService.getInstance(instanceId);
        const pendingTasks = detail.tasks.filter(
          (task) => task.status === 'pending' || task.status === 'claimed'
        );
        if (pendingTasks.length || detail.status !== 'running') {
          return { detail, pendingTasks };
        }
        return undefined;
      },
      timeoutMs,
      intervalMs,
      'pending approval task'
    );
  }
}

function createApprovalFlowTestSchema(suffix: string, requesterId: string, approverIds: string[]) {
  const code = `approval_flow_one_click_test_${suffix}`;
  const route = normalizeApproverRoute(approverIds, requesterId);
  const [departmentApproverId, financeApproverId] = route;

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
            userIds: [departmentApproverId]
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
            userIds: [financeApproverId]
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
  } satisfies ApprovalFlowTestSchema;
}

function prepareApprovalFlowTestSchema(
  inputSchema: unknown,
  suffix: string,
  requesterId: string,
  approverIds: string[]
): ApprovalFlowTestSchema {
  const source = isRecord(inputSchema)
    ? cloneRecord(inputSchema)
    : createApprovalFlowTestSchema(suffix, requesterId, approverIds);
  const route = normalizeApproverRoute(approverIds, requesterId);
  const code = readString(source.code) || 'approval_flow_one_click_test';
  const name = readString(source.name) || '审批流一键测试';

  source.code = `${code.replace(/[^a-zA-Z0-9_]/g, '_')}_one_click_${suffix}`;
  source.name = `${name} 一键测试`;
  source.status = 'draft';
  source.documentType = readString(source.documentType) || 'approval_flow_test';
  replaceInvalidUserAssignees(source, route);
  return source as ApprovalFlowTestSchema;
}

function replaceInvalidUserAssignees(schema: Record<string, unknown>, approverIds: string[]) {
  const nodes = Array.isArray(schema.nodes) ? schema.nodes.filter(isRecord) : [];
  let routeIndex = 0;

  for (const node of nodes) {
    const config = isRecord(node.config) ? node.config : undefined;
    const strategy = isRecord(config?.assigneeStrategy) ? config.assigneeStrategy : undefined;
    if (strategy?.type !== 'users') continue;

    const userIds = Array.isArray(strategy.userIds)
      ? strategy.userIds.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
      : [];
    if (userIds.length && userIds.every(isUuid)) continue;

    strategy.userIds = [approverIds[routeIndex % approverIds.length]];
    routeIndex += 1;
  }
}

function collectWorkflowUserAssignees(schema: Record<string, unknown>) {
  const nodes = Array.isArray(schema.nodes) ? schema.nodes.filter(isRecord) : [];
  const userIds = nodes.flatMap((node) => {
    const config = isRecord(node.config) ? node.config : undefined;
    const strategy = isRecord(config?.assigneeStrategy) ? config.assigneeStrategy : undefined;
    if (strategy?.type !== 'users' || !Array.isArray(strategy.userIds)) return [];
    return strategy.userIds.filter((item): item is string => typeof item === 'string' && isUuid(item.trim()));
  });
  return [...new Set(userIds.map((item) => item.trim()))];
}

function normalizeApproverRoute(approverIds: string[], fallbackUserId: string) {
  const route = [...new Set(approverIds.filter(isUuid))];
  if (!route.length && isUuid(fallbackUserId)) route.push(fallbackUserId);
  while (route.length < 3) route.push(route[0]);
  return route;
}

function createApprovalFlowTestData(
  businessKey: string,
  userId: string,
  approverIds: string[],
  schema: Record<string, unknown>
) {
  return {
    title: `${readString(schema.name) || 'Approval flow one-click test'} ${businessKey}`,
    variables: {
      amount: 68_000,
      applicantId: userId,
      approverIds,
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

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneRecord(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function createTestRunSuffix() {
  return `${Date.now().toString(36)}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
