import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { JobService } from '../job/job.service';
import type {
  WorkflowJobRecord,
  WorkflowJobRunRecord,
  WorkflowJobRunStatus,
  WorkflowJobStatus,
  WorkflowJobType
} from '../job/job.types';
import {
  TriggerRuntimeStatusService,
  type TriggerQueue,
  type TriggerRun,
  type TriggerRuntimeStatus,
  type TriggerSchedule
} from '../trigger/trigger-runtime-status.service';
import {
  TRIGGER_TASK_CATALOG,
  TRIGGER_TASK_IDENTIFIERS,
  type TriggerTaskCatalogItem
} from '../trigger/trigger-task-catalog';

const RECENT_RUN_LIMIT = 200;
const SNAPSHOT_CACHE_TTL_MS = 10_000;

export const TASK_CONSOLE_JOB_SERVICE = Symbol('TASK_CONSOLE_JOB_SERVICE');

export type TaskConsoleRow = {
  id: string;
  source: 'job' | 'system';
  name: string;
  code: string;
  description: string;
  category: TriggerTaskCatalogItem['category'] | 'custom';
  type: WorkflowJobType | 'system';
  status: WorkflowJobStatus | 'registered';
  triggerTaskId: string;
  scheduleId?: string;
  scheduleActive?: boolean;
  scheduleText: string;
  timezone?: string;
  nextRunAt?: string;
  lastRun?: TaskConsoleRun;
  runCounts: Record<WorkflowJobRunStatus, number>;
  queuedCount: number;
  runningCount: number;
  queuePaused: boolean;
  workerConnected: boolean | null;
  updatedAt?: string;
};

export type TaskConsoleRun = {
  id: string;
  source: 'database' | 'trigger';
  status: string;
  statusLabel: string;
  attempt?: number;
  triggerRunId?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  errorMessage?: string;
  taskIdentifier?: string;
};

export type TaskConsoleResponse = {
  generatedAt: string;
  partial: boolean;
  errors: TriggerRuntimeStatus['errors'];
  summary: {
    taskCount: number;
    jobCount: number;
    enabledJobCount: number;
    activeScheduleCount: number;
    queuedRuns: number;
    runningRuns: number;
    failedRuns: number;
    workerConnected: boolean | null;
  };
  engine: TriggerRuntimeStatus['engine'];
  rows: TaskConsoleRow[];
  queues: TriggerQueue[];
  schedules: TriggerSchedule[];
  workers: TriggerRuntimeStatus['workers'];
};

export type TaskConsoleDetail = {
  task: TaskConsoleRow;
  job?: WorkflowJobRecord;
  schedule?: TriggerSchedule;
  queues: TriggerQueue[];
  runs: TaskConsoleRun[];
  engine: TriggerRuntimeStatus['engine'];
  partial: boolean;
  errors: TriggerRuntimeStatus['errors'];
};

type TaskConsoleSnapshot = {
  response: TaskConsoleResponse;
  jobs: WorkflowJobRecord[];
  runs: WorkflowJobRunRecord[];
  runtime: TriggerRuntimeStatus;
};

@Injectable()
export class TaskConsoleService {
  private readonly snapshots = new Map<
    string,
    { expiresAt: number; promise: Promise<TaskConsoleSnapshot> }
  >();

  constructor(
    @Inject(TASK_CONSOLE_JOB_SERVICE)
    private readonly jobs: Pick<JobService, 'listJobs' | 'listRuns'>,
    @Inject(TriggerRuntimeStatusService)
    private readonly runtimeStatus: TriggerRuntimeStatusService
  ) {}

  async getConsole(tenantId: string, forceRefresh = false): Promise<TaskConsoleResponse> {
    return (await this.getSnapshot(tenantId, forceRefresh)).response;
  }

  async refreshDetail(tenantId: string, taskId: string): Promise<TaskConsoleDetail> {
    await this.getSnapshot(tenantId, true);
    return this.getDetail(tenantId, taskId);
  }

  invalidate(tenantId: string) {
    this.snapshots.delete(tenantId);
  }

  private async getSnapshot(
    tenantId: string,
    forceRefresh = false
  ): Promise<TaskConsoleSnapshot> {
    const cached = this.snapshots.get(tenantId);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.promise;

    const promise = this.loadSnapshot(tenantId)
      .then((snapshot) => {
        const current = this.snapshots.get(tenantId);
        if (current?.promise === promise) {
          current.expiresAt = Date.now() + SNAPSHOT_CACHE_TTL_MS;
        }
        return snapshot;
      })
      .catch((error) => {
        if (this.snapshots.get(tenantId)?.promise === promise) this.snapshots.delete(tenantId);
        throw error;
      });
    this.snapshots.set(tenantId, {
      expiresAt: Number.POSITIVE_INFINITY,
      promise
    });
    return promise;
  }

  private async loadSnapshot(tenantId: string): Promise<TaskConsoleSnapshot> {
    const actor = { tenantId };
    const [jobs, runs] = await Promise.all([
      this.jobs.listJobs({}, actor),
      this.jobs.listRuns({ limit: RECENT_RUN_LIMIT }, actor)
    ]);
    const taskIdentifiers = [...new Set([
      ...TRIGGER_TASK_IDENTIFIERS,
      ...jobs.map((job) => job.triggerTaskId)
    ])];
    const runtime = await this.runtimeStatus.getStatus(tenantId, {
      includeSchedules: true,
      scheduleIds: jobs.map((job) => job.scheduleId).filter(isNonEmptyString),
      scheduleExternalIds: jobs.map((job) => job.id),
      scheduleDeduplicationKeys: jobs.map((job) => `workflow-job:${job.id}`),
      taskIdentifiers
    });
    const rows = buildRows(jobs, runs, runtime);

    const response: TaskConsoleResponse = {
      generatedAt: runtime.generatedAt,
      partial: runtime.partial,
      errors: runtime.errors,
      summary: {
        taskCount: rows.length,
        jobCount: jobs.filter((job) => job.status !== 'archived').length,
        enabledJobCount: jobs.filter((job) => job.status === 'enabled').length,
        activeScheduleCount: runtime.schedules.filter((schedule) => schedule.active).length,
        queuedRuns: runtime.summary.queuedRuns,
        runningRuns: runtime.summary.runningRuns,
        failedRuns: runs.filter((run) => run.status === 'failed').length,
        workerConnected: runtime.engine.workerConnected
      },
      engine: runtime.engine,
      rows,
      queues: runtime.queues,
      schedules: runtime.schedules,
      workers: runtime.workers
    };
    return { response, jobs, runs, runtime };
  }

  async getDetail(tenantId: string, taskId: string): Promise<TaskConsoleDetail> {
    const snapshot = await this.getSnapshot(tenantId);
    const consoleData = snapshot.response;
    const task = consoleData.rows.find((row) => row.id === taskId);
    if (!task) throw new NotFoundException('Task console item not found.');

    const job = snapshot.jobs.find((row) => row.id === task.id);
    const databaseRuns = job
      ? snapshot.runs.filter((run) => run.jobId === job.id)
      : [];
    const triggerRuns = task.source === 'system'
      ? consoleDataRowsTriggerRuns(task, snapshot.runtime)
      : [];
    const schedule = consoleData.schedules.find((row) =>
      row.id === task.scheduleId || row.externalId === task.id
    );

    return {
      task,
      ...(job ? { job } : {}),
      ...(schedule ? { schedule } : {}),
      queues: queuesForTask(task, consoleData.queues),
      runs: [
        ...databaseRuns.map(mapDatabaseRun),
        ...triggerRuns
      ].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      engine: consoleData.engine,
      partial: consoleData.partial,
      errors: consoleData.errors
    };
  }
}

function buildRows(
  jobs: WorkflowJobRecord[],
  runs: WorkflowJobRunRecord[],
  runtime: TriggerRuntimeStatus
) {
  const catalogById = new Map(TRIGGER_TASK_CATALOG.map((task) => [task.id, task]));
  const schedulesById = new Map(runtime.schedules.map((schedule) => [schedule.id, schedule]));
  const schedulesByExternalId = new Map(
    runtime.schedules
      .filter((schedule) => schedule.externalId)
      .map((schedule) => [schedule.externalId!, schedule])
  );
  const jobTaskIds = new Set(jobs.map((job) => job.triggerTaskId));
  const knownTaskIds = new Set([
    ...TRIGGER_TASK_IDENTIFIERS,
    ...jobTaskIds
  ]);
  const jobRows = jobs
    .filter((job) => job.status !== 'archived')
    .map((job) => {
      const schedule = (job.scheduleId ? schedulesById.get(job.scheduleId) : undefined)
        ?? schedulesByExternalId.get(job.id);
      const jobRuns = runs
        .filter((run) => run.jobId === job.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      const catalog = catalogById.get(job.triggerTaskId);
      return buildJobRow(job, jobRuns, runtime, schedule, catalog);
    });
  const discoveredTasks = discoverRuntimeTasks(runtime, knownTaskIds);
  const systemRows = [...TRIGGER_TASK_CATALOG, ...discoveredTasks]
    .filter((task) => !jobTaskIds.has(task.id))
    .map((task) => buildSystemRow(task, runtime));
  return [...jobRows, ...systemRows].sort(taskRowSort);
}

function buildJobRow(
  job: WorkflowJobRecord,
  runs: WorkflowJobRunRecord[],
  runtime: TriggerRuntimeStatus,
  schedule: TriggerSchedule | undefined,
  catalog: TriggerTaskCatalogItem | undefined
): TaskConsoleRow {
  const queues = queuesForIdentifiers(
    [job.triggerTaskId, 'workflow.job.scheduled'],
    runtime.queues,
    catalog?.queueNames
  );
  return {
    id: job.id,
    source: 'job',
    name: job.name,
    code: job.code,
    description: catalog?.description ?? '由作业定义配置并通过 Trigger.dev 执行。',
    category: catalog?.category ?? 'custom',
    type: job.type,
    status: job.status,
    triggerTaskId: job.triggerTaskId,
    ...(job.scheduleId ? { scheduleId: job.scheduleId } : {}),
    ...(schedule ? { scheduleActive: schedule.active } : {}),
    scheduleText: jobScheduleText(job, schedule),
    timezone: schedule?.timezone ?? job.timezone,
    ...(schedule?.nextRunAt ? { nextRunAt: schedule.nextRunAt } : {}),
    ...(runs[0] ? { lastRun: mapDatabaseRun(runs[0]) } : {}),
    runCounts: countDatabaseRuns(runs),
    queuedCount: queues.reduce((total, queue) => total + queue.queued, 0),
    runningCount: queues.reduce((total, queue) => total + queue.running, 0),
    queuePaused: queues.some((queue) => queue.paused),
    workerConnected: runtime.engine.workerConnected,
    updatedAt: job.updatedAt
  };
}

function buildSystemRow(
  task: TriggerTaskCatalogItem,
  runtime: TriggerRuntimeStatus
): TaskConsoleRow {
  const runs = runtime.runs
    .filter((run) => run.taskIdentifier === task.id)
    .sort(triggerRunSort);
  const queues = queuesForIdentifiers([task.id], runtime.queues, task.queueNames);
  const schedule = runtime.schedules.find((row) => row.task === task.id);
  return {
    id: `system:${task.id}`,
    source: 'system',
    name: task.name,
    code: task.id,
    description: task.description,
    category: task.category,
    type: 'system',
    status: 'registered',
    triggerTaskId: task.id,
    ...(schedule ? { scheduleId: schedule.id, scheduleActive: schedule.active } : {}),
    scheduleText: schedule ? scheduleText(schedule) : '事件或手动触发',
    ...(schedule ? { timezone: schedule.timezone } : {}),
    ...(schedule?.nextRunAt ? { nextRunAt: schedule.nextRunAt } : {}),
    ...(runs[0] ? { lastRun: mapTriggerRun(runs[0]) } : {}),
    runCounts: emptyRunCounts(),
    queuedCount: queues.reduce((total, queue) => total + queue.queued, 0),
    runningCount: queues.reduce((total, queue) => total + queue.running, 0),
    queuePaused: queues.some((queue) => queue.paused),
    workerConnected: runtime.engine.workerConnected
  };
}

function consoleDataRowsTriggerRuns(task: TaskConsoleRow, runtime: TriggerRuntimeStatus) {
  return runtime.runs
    .filter((run) => run.taskIdentifier === task.triggerTaskId)
    .map(mapTriggerRun);
}

function queuesForTask(task: TaskConsoleRow, queues: TriggerQueue[]) {
  const catalog = TRIGGER_TASK_CATALOG.find((item) => item.id === task.triggerTaskId);
  return queuesForIdentifiers(
    task.source === 'job'
      ? [task.triggerTaskId, 'workflow.job.scheduled']
      : [task.triggerTaskId],
    queues,
    catalog?.queueNames
  );
}

function queuesForIdentifiers(
  taskIdentifiers: string[],
  queues: TriggerQueue[],
  aliases: string[] = []
) {
  const names = new Set([...taskIdentifiers, ...aliases].map(normalizeQueueKey));
  return queues.filter((queue) => names.has(normalizeQueueKey(queue.name)));
}

function discoverRuntimeTasks(
  runtime: TriggerRuntimeStatus,
  knownTaskIds: Set<string>
): TriggerTaskCatalogItem[] {
  const discovered = new Set([
    ...runtime.runs.map((run) => run.taskIdentifier),
    ...runtime.schedules.map((schedule) => schedule.task)
  ].filter(isNonEmptyString));
  const knownQueueKeys = new Set([
    ...knownTaskIds,
    ...TRIGGER_TASK_CATALOG.flatMap((task) => task.queueNames ?? [])
  ].map(normalizeQueueKey));
  for (const queue of runtime.queues) {
    if (queue.type !== 'task' || knownQueueKeys.has(normalizeQueueKey(queue.name))) continue;
    discovered.add(queue.name);
  }

  return [...discovered]
    .filter((taskId) => !knownTaskIds.has(taskId))
    .map((taskId) => ({
      id: taskId,
      name: taskId,
      category: 'workflow',
      description: '从 Trigger.dev 运行状态自动发现的后台任务。'
    }));
}

function normalizeQueueKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mapDatabaseRun(run: WorkflowJobRunRecord): TaskConsoleRun {
  return {
    id: run.id,
    source: 'database',
    status: run.status,
    statusLabel: runStatusLabel(run.status),
    attempt: run.attempt,
    ...(run.triggerRunId ? { triggerRunId: run.triggerRunId } : {}),
    createdAt: run.createdAt,
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    ...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
    ...(durationMs(run.startedAt, run.finishedAt) !== undefined
      ? { durationMs: durationMs(run.startedAt, run.finishedAt) }
      : {}),
    ...(run.errorMessage ? { errorMessage: run.errorMessage } : {})
  };
}

function mapTriggerRun(run: TriggerRun): TaskConsoleRun {
  return {
    id: run.id,
    source: 'trigger',
    status: run.status,
    statusLabel: triggerRunStatusLabel(run.status),
    triggerRunId: run.id,
    createdAt: run.createdAt,
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    ...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
    ...(durationMs(run.startedAt, run.finishedAt) !== undefined
      ? { durationMs: durationMs(run.startedAt, run.finishedAt) }
      : {}),
    taskIdentifier: run.taskIdentifier
  };
}

function countDatabaseRuns(runs: WorkflowJobRunRecord[]) {
  return runs.reduce((counts, run) => {
    counts[run.status] += 1;
    return counts;
  }, emptyRunCounts());
}

function emptyRunCounts(): Record<WorkflowJobRunStatus, number> {
  return { queued: 0, running: 0, succeeded: 0, failed: 0, canceled: 0 };
}

function jobScheduleText(job: WorkflowJobRecord, schedule?: TriggerSchedule) {
  if (schedule) return scheduleText(schedule);
  if (job.type === 'cron') return job.cronExpr ?? 'Cron 未配置';
  if (job.type === 'interval') return `每 ${job.intervalSeconds ?? 60} 秒`;
  if (job.type === 'once') return '单次执行';
  if (job.type === 'service_task') return '服务事件触发';
  return '手动触发';
}

function scheduleText(schedule: TriggerSchedule) {
  return `${schedule.cron} · ${schedule.timezone}`;
}

function durationMs(startedAt?: string, finishedAt?: string) {
  if (!startedAt || !finishedAt) return undefined;
  const value = Date.parse(finishedAt) - Date.parse(startedAt);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function runStatusLabel(status: WorkflowJobRunStatus) {
  return ({
    queued: '排队中',
    running: '运行中',
    succeeded: '成功',
    failed: '失败',
    canceled: '已取消'
  } as const)[status];
}

function triggerRunStatusLabel(status: string) {
  return ({
    PENDING_VERSION: '等待版本',
    QUEUED: '排队中',
    DEQUEUED: '已出队',
    EXECUTING: '运行中',
    WAITING: '等待中',
    COMPLETED: '成功',
    FAILED: '失败',
    CANCELED: '已取消',
    CRASHED: '异常退出',
    SYSTEM_FAILURE: '系统失败',
    TIMED_OUT: '超时'
  } as Record<string, string>)[status] ?? status;
}

function taskRowSort(left: TaskConsoleRow, right: TaskConsoleRow) {
  if (left.source !== right.source) return left.source === 'job' ? -1 : 1;
  if (left.status !== right.status) {
    const order = ['enabled', 'draft', 'disabled', 'registered', 'archived'];
    return order.indexOf(left.status) - order.indexOf(right.status);
  }
  return left.name.localeCompare(right.name, 'zh-CN');
}

function triggerRunSort(left: TriggerRun, right: TriggerRun) {
  return right.createdAt.localeCompare(left.createdAt);
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}
