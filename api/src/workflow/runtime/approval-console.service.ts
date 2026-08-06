import { Inject, Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '../common/database.service';
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
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(RuntimeService) private readonly runtimeService: RuntimeService,
    @Inject(DefinitionService) private readonly definitionService: DefinitionService,
    @Inject(TriggerCredentialsService)
    private readonly triggerCredentials: TriggerCredentialsService
  ) {}

  async listInstances(tenantId: string, query: ApprovalConsoleQuery = {}) {
    const values: unknown[] = [tenantId];
    const conditions = ['instances.account_id = $1'];
    const status = readStatus(query.status);
    const definitionId = readString(query.definitionId);
    const initiatorId = readString(query.initiatorId);
    const startedFrom = readDate(query.startedFrom);
    const startedTo = readDate(query.startedTo);
    const search = readString(query.search);

    if (status) addCondition(conditions, values, 'instances.status', status);
    if (definitionId) addCondition(conditions, values, 'instances.definition_id', definitionId);
    if (initiatorId) addCondition(conditions, values, 'instances.initiator_id', initiatorId);
    if (startedFrom) {
      values.push(startedFrom);
      conditions.push(`instances.started_at >= $${values.length}::timestamptz`);
    }
    if (startedTo) {
      values.push(startedTo);
      conditions.push(`instances.started_at < $${values.length}::timestamptz`);
    }
    if (search) {
      values.push(`%${search}%`);
      const index = values.length;
      conditions.push(`(
        instances.title ilike $${index}
        or instances.business_key ilike $${index}
        or coalesce(instances.document_id, '') ilike $${index}
        or definitions.name ilike $${index}
        or definitions.code ilike $${index}
        or coalesce(profiles.full_name, '') ilike $${index}
        or coalesce(auth_users.email, '') ilike $${index}
      )`);
    }

    const limit = readBoundedInteger(query.limit, 100, 1, 200);
    const offset = readBoundedInteger(query.offset, 0, 0, 100_000);
    values.push(limit, offset);
    const limitIndex = values.length - 1;
    const offsetIndex = values.length;

    const [instancesResult, statusResult, definitionsResult] = await Promise.all([
      this.database.query<ConsoleInstanceRow>(
        `select
          instances.*,
          definitions.code as definition_code,
          definitions.name as definition_name,
          profiles.full_name as initiator_name,
          profiles.nickname as initiator_nickname,
          auth_users.email as initiator_email,
          coalesce(node_stats.node_count, 0)::integer as node_count,
          coalesce(node_stats.completed_node_count, 0)::integer as completed_node_count,
          coalesce(node_stats.current_node_names, '{}'::text[]) as current_node_names,
          coalesce(task_stats.task_count, 0)::integer as task_count,
          coalesce(task_stats.active_task_count, 0)::integer as active_task_count,
          count(*) over()::integer as total_count
        from public.wf_process_instance instances
        join public.wf_process_definition definitions on definitions.id = instances.definition_id
        left join public.users profiles on profiles.id = instances.initiator_id
        left join auth.users auth_users on auth_users.id = instances.initiator_id
        left join lateral (
          select
            count(*) as node_count,
            count(*) filter (where nodes.status = 'completed') as completed_node_count,
            array_agg(distinct nodes.name) filter (
              where nodes.status in ('running', 'waiting')
            ) as current_node_names
          from public.wf_node_instance nodes
          where nodes.process_instance_id = instances.id
        ) node_stats on true
        left join lateral (
          select
            count(*) as task_count,
            count(*) filter (where tasks.status in ('pending', 'claimed')) as active_task_count
          from public.wf_task tasks
          where tasks.process_instance_id = instances.id
        ) task_stats on true
        where ${conditions.join(' and ')}
        order by instances.started_at desc
        limit $${limitIndex} offset $${offsetIndex}`,
        values
      ),
      this.database.query<{ status: ProcessInstanceStatus; count: number }>(
        `select status, count(*)::integer as count
        from public.wf_process_instance
        where account_id = $1
        group by status`,
        [tenantId]
      ),
      this.database.query<ConsoleDefinitionRow>(
        `select id, code, name, version, status
        from public.wf_process_definition
        where account_id = $1
        order by name, version desc`,
        [tenantId]
      )
    ]);

    const statusCounts = Object.fromEntries(INSTANCE_STATUSES.map((item) => [item, 0])) as Record<
      ProcessInstanceStatus,
      number
    >;
    for (const row of statusResult.rows) statusCounts[row.status] = Number(row.count);

    return {
      rows: instancesResult.rows.map(mapConsoleInstance),
      total: Number(instancesResult.rows[0]?.total_count ?? 0),
      limit,
      offset,
      summary: {
        total: Object.values(statusCounts).reduce((total, count) => total + count, 0),
        ...statusCounts
      },
      definitions: definitionsResult.rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        version: row.version,
        status: row.status
      }))
    };
  }

  async getInstanceDetail(instanceId: string, tenantId: string) {
    const instance = await this.runtimeService.getInstance(instanceId, tenantId);
    const [definition, timeline, candidateResult] = await Promise.all([
      this.definitionService.getDefinition(instance.definitionId, tenantId),
      this.runtimeService.getTimeline(instanceId, tenantId),
      this.database.query<ConsoleCandidateRow>(
        `select candidates.*
        from public.wf_task_candidate candidates
        join public.wf_task tasks on tasks.id = candidates.task_id
        where tasks.process_instance_id = $1 and tasks.account_id = $2
        order by tasks.created_at, candidates.id`,
        [instanceId, tenantId]
      )
    ]);

    const candidates = candidateResult.rows.map(mapCandidate);
    const tasks = instance.tasks.map((task) => ({
      ...task,
      candidates: candidates.filter((candidate) => candidate.taskId === task.id)
    }));
    const users = await this.readUsers(
      tenantId,
      collectUserIds(instance.initiatorId, tasks, timeline, instance.comments)
    );
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

  private async readUsers(tenantId: string, userIds: string[]) {
    if (!userIds.length) return [];

    const result = await this.database.query<ConsoleUserRow>(
      `select
        memberships.user_id::text as id,
        profiles.full_name,
        profiles.nickname,
        auth_users.email::text as email
      from basejump.account_user memberships
      left join public.users profiles on profiles.id = memberships.user_id
      left join auth.users auth_users on auth_users.id = memberships.user_id
      where memberships.account_id::text = $1
        and memberships.user_id::text = any($2::text[])
      order by coalesce(profiles.full_name, auth_users.email, memberships.user_id::text)`,
      [tenantId, userIds]
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.full_name?.trim() || row.nickname?.trim() || row.email?.split('@')[0] || row.id,
      email: row.email ?? ''
    }));
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
  const schemaNodes = Array.isArray(schema.nodes)
    ? schema.nodes.filter(isRecord)
    : [];

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
    const status = resolveNodeStatus(latest, rejectedTask);

    return {
      nodeId,
      name: readString(schemaNode.name) || latest?.name || nodeId,
      nodeType: readString(schemaNode.type) || latest?.nodeType || 'unknown',
      status,
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

function addCondition(
  conditions: string[],
  values: unknown[],
  field: string,
  value: string
) {
  values.push(value);
  conditions.push(`${field} = $${values.length}`);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapConsoleInstance(row: ConsoleInstanceRow) {
  return {
    id: row.id,
    definitionId: row.definition_id,
    definitionVersion: row.definition_version,
    definitionCode: row.definition_code,
    definitionName: row.definition_name,
    businessKey: row.business_key,
    ...(row.document_type ? { documentType: row.document_type } : {}),
    ...(row.document_id ? { documentId: row.document_id } : {}),
    title: row.title,
    status: row.status,
    ...(row.initiator_id ? { initiatorId: row.initiator_id } : {}),
    initiatorName:
      row.initiator_name?.trim() ||
      row.initiator_nickname?.trim() ||
      row.initiator_email?.split('@')[0] ||
      '',
    initiatorEmail: row.initiator_email ?? '',
    ...(row.trigger_run_id ? { triggerRunId: row.trigger_run_id } : {}),
    startedAt: row.started_at.toISOString(),
    ...(row.ended_at ? { endedAt: row.ended_at.toISOString() } : {}),
    nodeCount: Number(row.node_count),
    completedNodeCount: Number(row.completed_node_count),
    currentNodeNames: row.current_node_names ?? [],
    taskCount: Number(row.task_count),
    activeTaskCount: Number(row.active_task_count)
  };
}

function mapCandidate(row: ConsoleCandidateRow): WorkflowTaskCandidateRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    candidateType: row.candidate_type,
    candidateId: row.candidate_id,
    snapshot: row.snapshot ?? {}
  };
}

type ConsoleInstanceRow = QueryResultRow & {
  id: string;
  definition_id: string;
  definition_version: number;
  definition_code: string;
  definition_name: string;
  business_key: string;
  document_type: string | null;
  document_id: string | null;
  title: string;
  status: ProcessInstanceStatus;
  initiator_id: string | null;
  trigger_run_id: string | null;
  started_at: Date;
  ended_at: Date | null;
  initiator_name: string | null;
  initiator_nickname: string | null;
  initiator_email: string | null;
  node_count: number;
  completed_node_count: number;
  current_node_names: string[] | null;
  task_count: number;
  active_task_count: number;
  total_count: number;
};

type ConsoleDefinitionRow = QueryResultRow & {
  id: string;
  code: string;
  name: string;
  version: number;
  status: string;
};

type ConsoleCandidateRow = QueryResultRow & {
  id: string;
  task_id: string;
  candidate_type: WorkflowTaskCandidateRecord['candidateType'];
  candidate_id: string;
  snapshot: Record<string, unknown>;
};

type ConsoleUserRow = QueryResultRow & {
  id: string;
  full_name: string | null;
  nickname: string | null;
  email: string | null;
};
