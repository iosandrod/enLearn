import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { WorkflowSupabaseService } from '../common/workflow-supabase.service';
import { DefinitionService } from '../definition/definition.service';
import { TriggerCredentialsService } from '../trigger/trigger-credentials.service';
import type {
  NodeInstanceRecord,
  ProcessInstanceStatus,
  WorkflowHistoryEventRecord,
  WorkflowTaskCandidateRecord,
  WorkflowTaskRecord
} from './runtime.types';
import { RuntimeService } from './runtime.service';

const INSTANCE_STATUSES: ProcessInstanceStatus[] = [
  'running',
  'approved',
  'rejected',
  'canceled',
  'terminated',
  'failed'
];
const APPROVAL_CONSOLE_RPC = 'workflow_approval_console_command';
type JsonRecord = Record<string, unknown>;

export type ApprovalConsoleQuery = {
  search?: string;
  status?: string;
  definitionId?: string;
  initiatorId?: string;
  startedFrom?: string;
  startedTo?: string;
  limit?: number | string;
  offset?: number | string;
};

type ConsoleNodeStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'rejected'
  | 'skipped'
  | 'failed';

@Injectable()
export class ApprovalConsoleService {
  constructor(
    @Inject(WorkflowSupabaseService)
    private readonly persistence: WorkflowSupabaseService,
    @Inject(RuntimeService) private readonly runtimeService: RuntimeService,
    @Inject(DefinitionService) private readonly definitionService: DefinitionService,
    @Inject(TriggerCredentialsService)
    private readonly triggerCredentials: TriggerCredentialsService
  ) {}

  async listInstances(tenantId: string, query: ApprovalConsoleQuery = {}) {
    const data = assertRecord(
      await this.command('list', {
        account_id: tenantId,
        status: readStatus(query.status) || null,
        definition_id: readString(query.definitionId) || null,
        initiator_id: readString(query.initiatorId) || null,
        started_from: readDate(query.startedFrom) || null,
        started_to: readDate(query.startedTo) || null,
        search: readString(query.search) || null,
        limit: readBoundedInteger(query.limit, 100, 1, 200),
        offset: readBoundedInteger(query.offset, 0, 0, 100_000)
      }),
      'Workflow approval console RPC returned an invalid result.'
    );

    return {
      rows: readRecordArray(data.rows).map(mapConsoleInstance),
      total: readNumber(data.total),
      limit: readNumber(data.limit, 100),
      offset: readNumber(data.offset),
      summary: normalizeSummary(data.summary),
      definitions: readRecordArray(data.definitions).map((row) => ({
        id: readString(row.id),
        code: readString(row.code),
        name: readString(row.name),
        version: readNumber(row.version),
        status: readString(row.status)
      }))
    };
  }

  async getInstanceDetail(instanceId: string, tenantId: string) {
    const instance = await this.runtimeService.getInstance(instanceId, tenantId);
    const userIds = collectUserIds(instance.initiatorId, instance.tasks.map((task) => ({
      ...task,
      candidates: [] as WorkflowTaskCandidateRecord[]
    })), [], instance.comments);
    const [definition, timeline, support] = await Promise.all([
      this.definitionService.getDefinition(instance.definitionId, tenantId),
      this.runtimeService.getTimeline(instanceId, tenantId),
      this.command('detail_support', {
        account_id: tenantId,
        instance_id: instanceId,
        user_ids: userIds
      })
    ]);
    const supportData = assertRecord(
      support,
      'Workflow approval console RPC returned invalid detail support.'
    );
    const candidates = readRecordArray(supportData.candidates).map(mapCandidate);
    const tasks = instance.tasks.map((task) => ({
      ...task,
      candidates: candidates.filter((candidate) => candidate.taskId === task.id)
    }));

    const allUserIds = collectUserIds(instance.initiatorId, tasks, timeline, instance.comments);
    let users = readRecordArray(supportData.users).map(mapConsoleUser);
    if (allUserIds.some((userId) => !users.some((user) => user.id === userId))) {
      const refreshed = assertRecord(
        await this.command('detail_support', {
          account_id: tenantId,
          instance_id: instanceId,
          user_ids: allUserIds
        }),
        'Workflow approval console RPC returned invalid users.'
      );
      users = readRecordArray(refreshed.users).map(mapConsoleUser);
    }

    const consoleInstance = {
      ...instance,
      definitionCode: definition.code,
      definitionName: definition.name,
      initiatorName: users.find((user) => user.id === instance.initiatorId)?.name ?? '',
      initiatorEmail: users.find((user) => user.id === instance.initiatorId)?.email ?? '',
      tasks
    };

    return {
      instance: consoleInstance,
      definition: {
        id: definition.id,
        code: definition.code,
        name: definition.name,
        version: definition.version,
        documentType: definition.documentType,
        schema: definition.schema,
        status: definition.status,
        publishedAt: definition.publishedAt
      },
      nodeStates: buildNodeStates(definition.schema, instance.nodeInstances, tasks),
      timeline,
      users,
      triggerRun: await this.readTriggerRun(instance.triggerRunId, instance.triggerTaskId)
    };
  }

  private async command(action: string, payload: JsonRecord) {
    const { data, error } = await this.persistence.client.rpc(APPROVAL_CONSOLE_RPC, {
      p_action: action,
      p_payload: payload
    });
    if (error?.code === 'P0002') throw new NotFoundException(error.message);
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  private async readTriggerRun(runId?: string, taskIdentifier?: string) {
    if (!runId) return null;

    try {
      const credentials = await this.triggerCredentials.getCredentials();
      const run = await this.triggerCredentials.getRun(credentials.environmentId, runId);
      return run ?? {
        id: runId,
        status: 'UNKNOWN',
        taskIdentifier: taskIdentifier ?? 'workflow.instance.run'
      };
    } catch (error) {
      return {
        id: runId,
        status: 'UNKNOWN',
        taskIdentifier: taskIdentifier ?? 'workflow.instance.run',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

function buildNodeStates(
  schema: Record<string, unknown>,
  nodeInstances: NodeInstanceRecord[],
  tasks: Array<WorkflowTaskRecord & { candidates: WorkflowTaskCandidateRecord[] }>
) {
  const schemaNodes = Array.isArray(schema.nodes) ? schema.nodes.filter(isRecord) : [];

  return schemaNodes.map((schemaNode) => {
    const nodeId = readString(schemaNode.id);
    const executions = nodeInstances
      .filter((item) => item.nodeId === nodeId)
      .sort((left, right) => compareDates(left.startedAt, right.startedAt));
    const nodeTasks = tasks.filter((task) => task.nodeId === nodeId);
    const latest = executions.at(-1);
    const rejectedTask = [...nodeTasks]
      .reverse()
      .find((task) => readString(task.decisionPayload?.action) === 'reject');

    return {
      nodeId,
      name: readString(schemaNode.name) || latest?.name || nodeId,
      nodeType: readString(schemaNode.type) || latest?.nodeType || 'unknown',
      status: resolveNodeStatus(latest, rejectedTask),
      executionCount: executions.length,
      taskCount: nodeTasks.length,
      completedTaskCount: nodeTasks.filter((task) => task.status === 'completed').length,
      activeTaskCount: nodeTasks.filter(
        (task) => task.status === 'pending' || task.status === 'claimed'
      ).length,
      assigneeIds: uniqueStrings(nodeTasks.map((task) => task.assigneeId)),
      ...(latest
        ? {
            latestNodeInstanceId: latest.id,
            startedAt: latest.startedAt,
            endedAt: latest.endedAt
          }
        : {}),
      ...(rejectedTask
        ? {
            decision: 'reject',
            decisionTaskId: rejectedTask.id,
            decisionAt: rejectedTask.completedAt
          }
        : {})
    };
  });
}

function resolveNodeStatus(
  latest: NodeInstanceRecord | undefined,
  rejectedTask: WorkflowTaskRecord | undefined
): ConsoleNodeStatus {
  if (rejectedTask) return 'rejected';
  if (!latest) return 'pending';
  if (latest.status === 'created') return 'pending';
  return latest.status;
}

function collectUserIds(
  initiatorId: string | undefined,
  tasks: Array<WorkflowTaskRecord & { candidates: WorkflowTaskCandidateRecord[] }>,
  timeline: WorkflowHistoryEventRecord[],
  comments: Array<{ operatorId?: string }>
) {
  return uniqueStrings([
    initiatorId,
    ...tasks.flatMap((task) => [
      task.assigneeId,
      ...task.candidates
        .filter((candidate) => candidate.candidateType === 'user')
        .map((candidate) => candidate.candidateId),
      readString(task.decisionPayload?.operatorId)
    ]),
    ...timeline.map((event) => event.operatorId),
    ...comments.map((comment) => comment.operatorId)
  ]);
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.map(readString).filter(Boolean))];
}

function compareDates(left?: string, right?: string) {
  return new Date(left ?? 0).getTime() - new Date(right ?? 0).getTime();
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readStatus(value: unknown) {
  const status = readString(value) as ProcessInstanceStatus;
  return INSTANCE_STATUSES.includes(status) ? status : '';
}

function readDate(value: unknown) {
  const text = readString(value);
  if (!text) return '';
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function readBoundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), minimum), maximum);
}

function readNumber(value: unknown, fallback = 0) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, message: string) {
  if (!isRecord(value)) throw new BadRequestException(message);
  return value;
}

function readRecordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function toIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Workflow approval console RPC returned an invalid timestamp.');
  }
  return date.toISOString();
}

function normalizeSummary(value: unknown) {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(
    ['total', ...INSTANCE_STATUSES].map((status) => [status, readNumber(source[status])])
  ) as Record<'total' | ProcessInstanceStatus, number>;
}

function mapConsoleInstance(row: JsonRecord) {
  return {
    id: readString(row.id),
    definitionId: readString(row.definition_id),
    definitionVersion: readNumber(row.definition_version),
    definitionCode: readString(row.definition_code),
    definitionName: readString(row.definition_name),
    businessKey: readString(row.business_key),
    ...(readString(row.document_type) ? { documentType: readString(row.document_type) } : {}),
    ...(readString(row.document_id) ? { documentId: readString(row.document_id) } : {}),
    title: readString(row.title),
    status: row.status as ProcessInstanceStatus,
    ...(readString(row.initiator_id) ? { initiatorId: readString(row.initiator_id) } : {}),
    initiatorName:
      readString(row.initiator_name) ||
      readString(row.initiator_nickname) ||
      readString(row.initiator_email).split('@')[0] ||
      '',
    initiatorEmail: readString(row.initiator_email),
    ...(readString(row.trigger_run_id) ? { triggerRunId: readString(row.trigger_run_id) } : {}),
    startedAt: toIso(row.started_at),
    ...(row.ended_at ? { endedAt: toIso(row.ended_at) } : {}),
    nodeCount: readNumber(row.node_count),
    completedNodeCount: readNumber(row.completed_node_count),
    currentNodeNames: Array.isArray(row.current_node_names) ? row.current_node_names : [],
    taskCount: readNumber(row.task_count),
    activeTaskCount: readNumber(row.active_task_count)
  };
}

function mapCandidate(row: JsonRecord): WorkflowTaskCandidateRecord {
  return {
    id: readString(row.id),
    taskId: readString(row.task_id),
    candidateType: row.candidate_type as WorkflowTaskCandidateRecord['candidateType'],
    candidateId: readString(row.candidate_id),
    snapshot: isRecord(row.snapshot) ? row.snapshot : {}
  };
}

function mapConsoleUser(row: JsonRecord) {
  return {
    id: readString(row.id),
    name: readString(row.name) || readString(row.id),
    email: readString(row.email)
  };
}
