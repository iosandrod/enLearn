import { BadGatewayException, BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

import type { ServiceContext, ServiceExecutor } from '../common/interfaces/service-executor';
import {
  WORKFLOW_REQUEST_PATTERN,
  WORKFLOW_SERVICE_CLIENT,
  type WorkflowApiEnvelope,
  type WorkflowRequest
} from './workflow.transport';

type PostData = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, name: string) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new BadRequestException(`Missing required field: ${name}`);
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function readOptionalRecord(value: unknown, name: string) {
  if (value === undefined || value === null) return undefined;
  if (isRecord(value)) return value;
  throw new BadRequestException(`${name} must be an object.`);
}

function stripUndefined(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

@Injectable()
export class WorkflowService implements ServiceExecutor {
  constructor(
    @Inject(WORKFLOW_SERVICE_CLIENT)
    private readonly workflowClient: ClientProxy
  ) {}

  async execute(method: string, postData: PostData, context: ServiceContext) {
    const request = this.resolveRequest(method, postData);
    return this.invokeWorkflowService(request, postData, context);
  }

  private resolveRequest(method: string, postData: PostData): WorkflowRequest {
    switch (method) {
      case 'listItems':
        return this.resolveListItemsRequest(postData);
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
      case 'getDefinitionCapabilities':
        return { method: 'GET', path: '/definitions/capabilities' };
      case 'disableDefinition':
        return {
          method: 'POST',
          path: `/definitions/${readString(postData.definitionId, 'definitionId')}/disable`,
          body: {}
        };
      case 'getInstance':
        return { method: 'GET', path: `/instances/${readString(postData.instanceId, 'instanceId')}` };
      case 'getInstanceTimeline':
        return {
          method: 'GET',
          path: `/instances/${readString(postData.instanceId, 'instanceId')}/timeline`
        };
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
      case 'getTask':
        return { method: 'GET', path: `/tasks/${readString(postData.taskId, 'taskId')}` };
      case 'claimTask':
        return {
          method: 'POST',
          path: `/tasks/${readString(postData.taskId, 'taskId')}/claim`,
          body: {}
        };
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
        return {
          method: 'GET',
          path: `/history/instances/${readString(postData.instanceId, 'instanceId')}/timeline`
        };
      case 'runApprovalFlowTest':
        return {
          method: 'POST',
          path: '/tests/approval-flow/run',
          body: stripUndefined({
            tenantId: postData.tenantId,
            userId: postData.userId,
            approverIds: postData.approverIds,
            schema: postData.schema,
            timeoutMs: postData.timeoutMs,
            intervalMs: postData.intervalMs
          })
        };
      default:
        throw new BadRequestException(`Unsupported workflow method: ${method}`);
    }
  }

  private resolveListItemsRequest(postData: PostData): WorkflowRequest {
    switch (readOptionalString(postData.itemType ?? postData.item_type ?? postData.type)) {
      case 'models':
        return { method: 'GET', path: '/models', query: postData };
      case 'definitions':
        return { method: 'GET', path: '/definitions', query: postData };
      case 'instances':
        return { method: 'GET', path: '/instances', query: postData };
      case 'startedInstances':
        return { method: 'GET', path: '/instances/started', query: postData };
      case 'jobs':
        return { method: 'GET', path: '/jobs', query: postData };
      case 'jobRuns':
        return { method: 'GET', path: '/jobs/runs', query: postData };
      case 'todoTasks':
        return { method: 'GET', path: '/tasks/todo', query: postData };
      case 'doneTasks':
        return { method: 'GET', path: '/tasks/done', query: postData };
      case 'ccTasks':
        return { method: 'GET', path: '/tasks/cc', query: postData };
      case 'startedTasks':
        return { method: 'GET', path: '/tasks/started', query: postData };
      default:
        throw new BadRequestException('Unsupported workflow listItems itemType.');
    }
  }

  private async invokeWorkflowService(
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

    let payload: WorkflowApiEnvelope;
    try {
      payload = await firstValueFrom(
        this.workflowClient.send<WorkflowApiEnvelope>(WORKFLOW_REQUEST_PATTERN, {
          ...request,
          headers
        })
      );
    } catch (error) {
      throw new BadGatewayException(
        error instanceof Error && error.message
          ? error.message
          : 'Workflow service request failed.'
      );
    }

    if (!payload || payload.success === false) {
      throw new BadGatewayException(
        payload?.error?.message ?? 'Workflow service request failed.'
      );
    }

    return payload.data;
  }
}
