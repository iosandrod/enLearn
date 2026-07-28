import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import type { ServiceContext, ServiceExecutor } from '../common/interfaces/service-executor';
import { getEnv } from '../common/utils/env';

type HttpMethod = 'GET' | 'POST' | 'PUT';
type PostData = Record<string, unknown>;

type WorkflowApiEnvelope<T = unknown> = {
  success?: boolean;
  data?: T;
  error?: {
    message?: string;
  };
};

type WorkflowRequest = {
  method: HttpMethod;
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, name: string) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new BadRequestException(`Missing required field: ${name}`);
}

function readOptionalRecord(value: unknown, name: string) {
  if (value === undefined || value === null) return undefined;
  if (isRecord(value)) return value;
  throw new BadRequestException(`${name} must be an object.`);
}

function stripUndefined(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function buildQueryString(query: Record<string, unknown> | undefined) {
  if (!query) return '';

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }

  const value = params.toString();
  return value ? `?${value}` : '';
}

@Injectable()
export class WorkflowService implements ServiceExecutor {
  private readonly workflowApiBaseUrl: string;

  constructor() {
    const env = getEnv();
    this.workflowApiBaseUrl = String(
      env.WORKFLOW_API_BASE_URL ??
        `http://localhost:${env.WORKFLOW_API_PORT ?? '3010'}/api/workflow`
    ).replace(/\/+$/, '');
  }

  async execute(method: string, postData: PostData, context: ServiceContext) {
    const request = this.resolveRequest(method, postData);
    return this.invokeWorkflowApi(request, postData, context);
  }

  private resolveRequest(method: string, postData: PostData): WorkflowRequest {
    switch (method) {
      case 'listModels':
        return { method: 'GET', path: '/models', query: postData };
      case 'getModel':
        return { method: 'GET', path: `/models/${readString(postData.modelId, 'modelId')}` };
      case 'saveModel':
        return { method: 'POST', path: '/models', body: postData };
      case 'updateModel': {
        const modelId = readString(postData.modelId, 'modelId');
        const { modelId: _modelId, ...body } = postData;
        return { method: 'PUT', path: `/models/${modelId}`, body };
      }
      case 'publishModel':
        return {
          method: 'POST',
          path: `/models/${readString(postData.modelId, 'modelId')}/publish`,
          body: readOptionalRecord(postData.body, 'body') ?? stripUndefined({ remark: postData.remark })
        };
      case 'listDefinitions':
        return { method: 'GET', path: '/definitions', query: postData };
      case 'getDefinitionCapabilities':
        return { method: 'GET', path: '/definitions/capabilities' };
      case 'disableDefinition':
        return {
          method: 'POST',
          path: `/definitions/${readString(postData.definitionId, 'definitionId')}/disable`,
          body: {}
        };
      case 'listInstances':
        return { method: 'GET', path: '/instances', query: postData };
      case 'listStartedInstances':
        return { method: 'GET', path: '/instances/started', query: postData };
      case 'getInstance':
        return { method: 'GET', path: `/instances/${readString(postData.instanceId, 'instanceId')}` };
      case 'getInstanceTimeline':
        return { method: 'GET', path: `/instances/${readString(postData.instanceId, 'instanceId')}/timeline` };
      case 'startInstance':
        return { method: 'POST', path: '/instances', body: postData };
      case 'withdrawInstance':
        return {
          method: 'POST',
          path: `/instances/${readString(postData.instanceId, 'instanceId')}/withdraw`,
          body: stripUndefined({ comment: postData.comment })
        };
      case 'terminateInstance':
        return {
          method: 'POST',
          path: `/instances/${readString(postData.instanceId, 'instanceId')}/terminate`,
          body: stripUndefined({ comment: postData.comment })
        };
      case 'listJobs':
        return { method: 'GET', path: '/jobs', query: postData };
      case 'createJob':
        return { method: 'POST', path: '/jobs', body: postData };
      case 'getJob':
        return { method: 'GET', path: `/jobs/${readString(postData.jobId, 'jobId')}` };
      case 'updateJobStatus':
        return {
          method: 'POST',
          path: `/jobs/${readString(postData.jobId, 'jobId')}/status`,
          body: { status: readString(postData.status, 'status') }
        };
      case 'runJob':
        return {
          method: 'POST',
          path: `/jobs/${readString(postData.jobId, 'jobId')}/run`,
          body: readOptionalRecord(postData.body, 'body') ?? stripUndefined({ payload: postData.payload })
        };
      case 'listJobRuns':
        return { method: 'GET', path: '/jobs/runs', query: postData };
      case 'listTodoTasks':
        return { method: 'GET', path: '/tasks/todo', query: postData };
      case 'listDoneTasks':
        return { method: 'GET', path: '/tasks/done', query: postData };
      case 'listCcTasks':
        return { method: 'GET', path: '/tasks/cc', query: postData };
      case 'listStartedTasks':
        return { method: 'GET', path: '/tasks/started', query: postData };
      case 'getTask':
        return { method: 'GET', path: `/tasks/${readString(postData.taskId, 'taskId')}` };
      case 'claimTask':
        return { method: 'POST', path: `/tasks/${readString(postData.taskId, 'taskId')}/claim`, body: {} };
      case 'approveTask':
        return {
          method: 'POST',
          path: `/tasks/${readString(postData.taskId, 'taskId')}/approve`,
          body: stripUndefined({ comment: postData.comment, variables: postData.variables })
        };
      case 'rejectTask':
        return {
          method: 'POST',
          path: `/tasks/${readString(postData.taskId, 'taskId')}/reject`,
          body: stripUndefined({ comment: postData.comment, targetNodeId: postData.targetNodeId })
        };
      case 'transferTask':
        return {
          method: 'POST',
          path: `/tasks/${readString(postData.taskId, 'taskId')}/transfer`,
          body: stripUndefined({ targetUserId: postData.targetUserId, comment: postData.comment })
        };
      case 'addSignTask':
        return {
          method: 'POST',
          path: `/tasks/${readString(postData.taskId, 'taskId')}/add-sign`,
          body: stripUndefined({ targetUserId: postData.targetUserId, comment: postData.comment })
        };
      case 'getHistoryTimeline':
        return { method: 'GET', path: `/history/instances/${readString(postData.instanceId, 'instanceId')}/timeline` };
      default:
        throw new BadRequestException(`Unsupported workflow method: ${method}`);
    }
  }

  private async invokeWorkflowApi(
    request: WorkflowRequest,
    postData: PostData,
    context: ServiceContext
  ) {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-tenant-id': typeof postData.tenantId === 'string' ? postData.tenantId : 'default'
    };

    const userId = typeof postData.userId === 'string' ? postData.userId.trim() : '';
    if (userId) headers['x-user-id'] = userId;
    if (context.authorization) headers.authorization = context.authorization;
    if (context.requestId) headers['x-request-id'] = context.requestId;

    const response = await fetch(
      `${this.workflowApiBaseUrl}${request.path}${buildQueryString(request.query)}`,
      {
        method: request.method,
        headers,
        ...(request.method === 'GET' ? {} : { body: JSON.stringify(request.body ?? {}) })
      }
    );
    const payload = (await response.json().catch(() => ({}))) as WorkflowApiEnvelope;

    if (!response.ok || payload.success === false) {
      throw new BadGatewayException(
        payload.error?.message ?? `Workflow API request failed: ${response.status}`
      );
    }

    return payload.data;
  }
}
