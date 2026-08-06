import { Inject, Injectable } from '@nestjs/common';
import { queues, wait } from '@trigger.dev/sdk';
import type { RuntimeService } from '../runtime/runtime.service';
import type { ProcessInstanceRecord } from '../runtime/runtime.types';
import { TriggerCredentialsService } from './trigger-credentials.service';

const WORKFLOW_TASK_IDENTIFIER_SET = new Set([
  'workflow.instance.run',
  'workflow.job.run',
  'workflow.job.scheduled',
  'notification.dispatch'
]);
const MAX_QUEUES = 500;
const MAX_RUNS = 200;
const MAX_WAITPOINTS = 200;

export const TRIGGER_RUNTIME_STATUS_RUNTIME_SERVICE = Symbol(
  'TRIGGER_RUNTIME_STATUS_RUNTIME_SERVICE'
);
export const TRIGGER_RUNTIME_STATUS_OPERATIONS = Symbol('TRIGGER_RUNTIME_STATUS_OPERATIONS');

type TriggerQueue = {
  id: string;
  name: string;
  type: 'task' | 'custom';
  running: number;
  queued: number;
  paused: boolean;
  concurrencyLimit: number | null;
};

type TriggerRun = {
  id: string;
  status: string;
  taskIdentifier: string;
  tags: string[];
  isQueued: boolean;
  isExecuting: boolean;
  isWaiting: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  workflowInstanceId?: string;
};

type TriggerWaitpoint = {
  id: string;
  status: string;
  tags: string[];
  createdAt: string;
  timeoutAt?: string;
  workflowInstanceId?: string;
  workflowTaskId?: string;
};

export type TriggerRuntimeStatus = {
  generatedAt: string;
  partial: boolean;
  errors: Partial<Record<'credentials' | 'queues' | 'runs' | 'waitpoints' | 'workers', string>>;
  engine: {
    configured: boolean;
    apiUrl: string;
    projectRef: string | null;
    environment: 'dev' | 'prod';
    environmentId: string | null;
    workerConnected: boolean | null;
    activeWorkerCount: number;
    environmentConcurrencyLimit: number | null;
  };
  summary: {
    queueCount: number;
    queuedRuns: number;
    runningRuns: number;
    waitingRuns: number;
    waitingWaitpoints: number;
    runningWorkflowInstances: number;
  };
  queues: TriggerQueue[];
  runs: TriggerRun[];
  waitpoints: TriggerWaitpoint[];
  workers: Array<{
    id: string;
    name: string;
    resourceIdentifier: string;
    lastHeartbeatAt: string;
    lastDequeueAt?: string;
  }>;
  workflows: ProcessInstanceRecord[];
};

export type TriggerRuntimeStatusOperations = {
  listQueues(): Promise<TriggerQueue[]>;
  listWaitpoints(): Promise<TriggerWaitpoint[]>;
  getDevPresence(apiUrl: string, projectRef: string, accessToken: string): Promise<boolean>;
};

type TriggerRuntimeDataSource = Pick<
  TriggerCredentialsService,
  'configureSdk' | 'getCredentials' | 'getStatus' | 'getWorkerStatus' | 'listRecentRuns'
>;

@Injectable()
export class TriggerRuntimeStatusService {
  constructor(
    @Inject(TriggerCredentialsService)
    private readonly credentials: TriggerRuntimeDataSource,
    @Inject(TRIGGER_RUNTIME_STATUS_RUNTIME_SERVICE)
    private readonly runtimeService: Pick<RuntimeService, 'listInstances'>,
    @Inject(TRIGGER_RUNTIME_STATUS_OPERATIONS)
    private readonly operations: TriggerRuntimeStatusOperations
  ) {}

  async getStatus(tenantId: string): Promise<TriggerRuntimeStatus> {
    const workflows = await this.runtimeService.listInstances({ tenantId, status: 'running' });
    const errors: TriggerRuntimeStatus['errors'] = {};
    let configured = false;
    let apiUrl = '';
    let projectRef: string | null = null;
    let environment: 'dev' | 'prod' = 'dev';
    let environmentId: string | null = null;
    let workerConnected: boolean | null = null;
    let activeWorkerCount = 0;
    let environmentConcurrencyLimit: number | null = null;
    let workerRows: TriggerRuntimeStatus['workers'] = [];
    let queuesResult: TriggerQueue[] = [];
    let runsResult: TriggerRun[] = [];
    let waitpointResult: TriggerWaitpoint[] = [];

    try {
      const credential = await this.credentials.getCredentials();
      configured = true;
      apiUrl = credential.apiUrl;
      projectRef = credential.projectRef;
      environment = credential.environment;
      environmentId = credential.environmentId;
      await this.credentials.configureSdk();

      const [queueSection, runSection, waitpointSection, workerSection, presenceSection] =
        await Promise.allSettled([
          this.operations.listQueues(),
          this.credentials.listRecentRuns(
            credential.environmentId,
            [...WORKFLOW_TASK_IDENTIFIER_SET],
            MAX_RUNS
          ).then((runRows) => runRows.map((run) => ({
            ...run,
            ...tagField(run.tags, 'workflow-instance', 'workflowInstanceId')
          }))),
          this.operations.listWaitpoints(),
          this.credentials.getWorkerStatus(credential.environmentId),
          credential.environment === 'dev' && credential.accessToken
            ? this.operations.getDevPresence(
                credential.apiUrl,
                credential.projectRef,
                credential.accessToken
              )
            : Promise.resolve(null)
        ]);

      if (queueSection.status === 'fulfilled') queuesResult = queueSection.value;
      else errors.queues = errorMessage(queueSection.reason);
      if (runSection.status === 'fulfilled') runsResult = runSection.value;
      else errors.runs = errorMessage(runSection.reason);
      if (waitpointSection.status === 'fulfilled') waitpointResult = waitpointSection.value;
      else errors.waitpoints = errorMessage(waitpointSection.reason);
      if (workerSection.status === 'fulfilled') {
        activeWorkerCount = workerSection.value.activeWorkerCount;
        environmentConcurrencyLimit = workerSection.value.environmentConcurrencyLimit;
        workerRows = workerSection.value.workers;
      } else {
        errors.workers = errorMessage(workerSection.reason);
      }
      if (presenceSection.status === 'fulfilled') workerConnected = presenceSection.value;
      else if (!errors.workers) errors.workers = errorMessage(presenceSection.reason);
    } catch (error) {
      errors.credentials = errorMessage(error);
      const engineStatus = await this.credentials.getStatus();
      apiUrl = engineStatus.apiUrl;
      projectRef = engineStatus.projectRef;
      environment = engineStatus.environment;
    }

    const tenantTag = `tenant:${tenantId}`;
    const workflowRunIds = new Set(
      workflows.map((workflow) => workflow.triggerRunId).filter(isNonEmptyString)
    );
    runsResult = runsResult.filter(
      (run) => run.tags.includes(tenantTag) || workflowRunIds.has(run.id)
    );
    waitpointResult = waitpointResult.filter((waitpoint) => waitpoint.tags.includes(tenantTag));

    return {
      generatedAt: new Date().toISOString(),
      partial: Object.keys(errors).length > 0,
      errors,
      engine: {
        configured,
        apiUrl,
        projectRef,
        environment,
        environmentId,
        workerConnected,
        activeWorkerCount,
        environmentConcurrencyLimit
      },
      summary: {
        queueCount: queuesResult.length,
        queuedRuns: queuesResult.reduce((total, queue) => total + queue.queued, 0),
        runningRuns: queuesResult.reduce((total, queue) => total + queue.running, 0),
        waitingRuns: runsResult.filter((run) =>
          ['PENDING_VERSION', 'QUEUED', 'DELAYED', 'WAITING'].includes(run.status)
        ).length,
        waitingWaitpoints: waitpointResult.length,
        runningWorkflowInstances: workflows.length
      },
      queues: queuesResult,
      runs: runsResult,
      waitpoints: waitpointResult,
      workers: workerRows,
      workflows
    };
  }
}

export function createTriggerRuntimeStatusOperations(): TriggerRuntimeStatusOperations {
  return {
    async listQueues() {
      const result: TriggerQueue[] = [];
      for await (const queue of queues.list({ perPage: 100 })) {
        result.push({
          id: queue.id,
          name: queue.name,
          type: queue.type,
          running: queue.running,
          queued: queue.queued,
          paused: queue.paused,
          concurrencyLimit: queue.concurrency?.current ?? queue.concurrencyLimit
        });
        if (result.length >= MAX_QUEUES) break;
      }
      return result;
    },
    async listWaitpoints() {
      const result: TriggerWaitpoint[] = [];
      for await (const token of wait.listTokens({ status: 'WAITING', limit: 100 })) {
        result.push({
          id: token.id,
          status: token.status,
          tags: token.tags,
          createdAt: token.createdAt.toISOString(),
          ...(token.timeoutAt ? { timeoutAt: token.timeoutAt.toISOString() } : {}),
          ...tagField(token.tags, 'workflow-instance', 'workflowInstanceId'),
          ...tagField(token.tags, 'workflow-task', 'workflowTaskId')
        });
        if (result.length >= MAX_WAITPOINTS) break;
      }
      return result;
    },
    async getDevPresence(apiUrl, projectRef, accessToken) {
      const response = await fetch(
        `${apiUrl.replace(/\/+$/, '')}/api/v1/projects/${encodeURIComponent(projectRef)}/dev-status`,
        { headers: { authorization: `Bearer ${accessToken}` } }
      );
      if (!response.ok) {
        throw new Error(`Trigger.dev dev status returned HTTP ${response.status}.`);
      }
      const payload = await response.json() as { isConnected?: unknown };
      return payload.isConnected === true;
    }
  };
}

function tagField<Key extends string>(tags: string[], prefix: string, key: Key) {
  const value = tags.find((tag) => tag.startsWith(`${prefix}:`))?.slice(prefix.length + 1);
  return value ? ({ [key]: value } as Record<Key, string>) : {};
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
