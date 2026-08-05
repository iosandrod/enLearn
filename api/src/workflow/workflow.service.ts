import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

import {
  BaseService,
  type HookContext,
  type ListItemsHandler,
  type ResourceConfigMap,
  type ServiceHooks
} from '../common/base.service';
import type { ServiceContext } from '../common/interfaces/service-executor';
import { assertAccountUsers } from '../common/utils/account-context';
import {
  getCurrentUser,
  getUserAuthorization,
  hasRequiredPermission
} from '../common/utils/supabase';
import {
  normalizeWorkflowDraftSchema,
  validateWorkflowDraftSchema
} from './workflow.model';
import {
  WORKFLOW_REQUEST_PATTERN,
  WORKFLOW_SERVICE_CLIENT,
  type WorkflowApiEnvelope,
  type WorkflowRequest
} from './workflow.transport';
import { workflowResources } from './workflow.resources';

type PostData = Record<string, unknown>;
type WorkflowHandler = (postData: PostData, context: ServiceContext) => Promise<unknown>;

const WORKFLOW_JOB_TYPES = new Set(['once', 'cron', 'interval', 'manual', 'service_task']);

const RESOURCE_LIST_FIELDS: Record<string, string[]> = {
  wf_model: ['id', 'code', 'name', 'documentType', 'status'],
  wf_model_version: ['id', 'modelId', 'version'],
  wf_process_definition: ['id', 'modelId', 'code', 'name', 'version', 'documentType', 'status'],
  wf_process_instance: [
    'id',
    'definitionId',
    'businessKey',
    'documentType',
    'documentId',
    'status',
    'initiatorId'
  ],
  wf_node_instance: ['id', 'processInstanceId', 'nodeId', 'nodeType', 'status'],
  wf_task: [
    'id',
    'processInstanceId',
    'nodeInstanceId',
    'nodeId',
    'status',
    'assigneeId'
  ],
  wf_job: ['id', 'code', 'name', 'type', 'status'],
  wf_job_run: ['id', 'jobId', 'triggerRunId', 'status']
};

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

function readPositiveInteger(value: unknown, name: string) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  throw new BadRequestException(`${name} must be a positive integer.`);
}

function stripUndefined(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function toSnakeCase(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function toCamelCase(value: string) {
  return value.replace(/_([a-z0-9])/g, (_, character: string) => character.toUpperCase());
}

function toSerializableValue(value: unknown) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapWorkflowRow(resourceName: string, value: unknown) {
  if (!isRecord(value)) return value;

  const row = Object.fromEntries(
    Object.entries(value)
      .filter(([, fieldValue]) => fieldValue !== null)
      .map(([field, fieldValue]) => [toCamelCase(field), toSerializableValue(fieldValue)])
  );

  if (resourceName === 'wf_job' && isRecord(row.payload)) {
    const intervalSeconds = readPositiveInteger(row.payload.intervalSeconds, 'payload.intervalSeconds');
    if (intervalSeconds) row.intervalSeconds = intervalSeconds;
  }

  return row;
}

function mapWorkflowResult(resourceName: string, value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => mapWorkflowRow(resourceName, item))
    : mapWorkflowRow(resourceName, value);
}

function resolveRpcListQuery(postData: PostData) {
  const filters = isRecord(postData.filters) ? postData.filters : {};
  const { tenantId: _tenantId, tenant_id: _tenantIdSnake, ...safePostData } = postData;
  const { tenantId: _filterTenantId, tenant_id: _filterTenantIdSnake, ...safeFilters } = filters;
  return {
    ...safePostData,
    ...safeFilters
  };
}

function normalizeResourceListInput(resourceName: string, postData: PostData) {
  const sourceFilters = isRecord(postData.filters) ? postData.filters : {};
  const filters: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(sourceFilters)) {
    const databaseField = toSnakeCase(field);
    if (databaseField !== 'tenant_id') filters[databaseField] = value;
  }

  for (const field of RESOURCE_LIST_FIELDS[resourceName] ?? []) {
    const databaseField = toSnakeCase(field);
    const value = postData[field] ?? postData[databaseField];
    if (value !== undefined && databaseField !== 'tenant_id') {
      filters[databaseField] = value;
    }
  }

  const sorts = Array.isArray(postData.sorts)
    ? postData.sorts.map((sort) =>
        isRecord(sort) && typeof sort.field === 'string'
          ? { ...sort, field: toSnakeCase(sort.field) }
          : sort
      )
    : postData.sorts;
  const rawSearchFields = postData.searchFields ?? postData.search_fields;
  const searchFields = Array.isArray(rawSearchFields)
    ? rawSearchFields.map((field: unknown) =>
        typeof field === 'string' ? toSnakeCase(field) : field
      )
    : rawSearchFields;
  const orderBy = readOptionalString(postData.orderBy ?? postData.order_by);

  return {
    ...postData,
    resource: resourceName,
    filters,
    ...(sorts ? { sorts } : {}),
    ...(searchFields ? { searchFields } : {}),
    ...(orderBy ? { orderBy: toSnakeCase(orderBy) } : {})
  };
}

@Injectable()
export class WorkflowService extends BaseService {
  private readonly compatibilityHandlers: Record<string, WorkflowHandler> = {
    getModel: (postData, context) => this.getModel(postData, context),
    saveModel: (postData, context) => this.saveModel(postData, context),
    updateModel: (postData, context) => this.updateModel(postData, context),
    disableDefinition: (postData, context) => this.disableDefinition(postData, context),
    createJob: (postData, context) => this.createJob(postData, context),
    getJob: (postData, context) => this.getJob(postData, context)
  };

  private readonly actionHandlers: Record<string, WorkflowHandler> = {
    publishModel: (postData, context) => this.invokeAction({
      method: 'POST',
      path: `/models/${readString(postData.modelId, 'modelId')}/publish`,
      body: readOptionalRecord(postData.body, 'body') ??
        stripUndefined({ remark: postData.remark })
    }, postData, context),
    getDefinitionCapabilities: (postData, context) => this.invokeAction(
      { method: 'GET', path: '/definitions/capabilities' },
      postData,
      context
    ),
    getRuntimeStatus: (postData, context) => this.invokeAction(
      { method: 'GET', path: '/runtime/status' },
      postData,
      context
    ),
    getApprovalConsole: (postData, context) => this.invokeAction(
      {
        method: 'GET',
        path: '/console/instances',
        query: resolveRpcListQuery(postData)
      },
      postData,
      context
    ),
    getApprovalConsoleDetail: (postData, context) => this.invokeAction({
      method: 'GET',
      path: `/console/instances/${readString(postData.instanceId, 'instanceId')}`
    }, postData, context),
    getInstance: (postData, context) => this.invokeAction({
      method: 'GET',
      path: `/instances/${readString(postData.instanceId, 'instanceId')}`
    }, postData, context),
    getInstanceTimeline: (postData, context) => this.invokeAction({
      method: 'GET',
      path: `/instances/${readString(postData.instanceId, 'instanceId')}/timeline`
    }, postData, context),
    startInstance: (postData, context) => this.invokeAction(
      { method: 'POST', path: '/instances', body: postData },
      postData,
      context
    ),
    withdrawInstance: (postData, context) => this.invokeAction({
      method: 'POST',
      path: `/instances/${readString(postData.instanceId, 'instanceId')}/withdraw`,
      body: stripUndefined({ comment: postData.comment })
    }, postData, context),
    terminateInstance: (postData, context) => this.invokeAction({
      method: 'POST',
      path: `/instances/${readString(postData.instanceId, 'instanceId')}/terminate`,
      body: stripUndefined({ comment: postData.comment })
    }, postData, context),
    updateJobStatus: (postData, context) => this.invokeAction({
      method: 'POST',
      path: `/jobs/${readString(postData.jobId, 'jobId')}/status`,
      body: { status: readString(postData.status, 'status') }
    }, postData, context),
    runJob: (postData, context) => this.invokeAction({
      method: 'POST',
      path: `/jobs/${readString(postData.jobId, 'jobId')}/run`,
      body: readOptionalRecord(postData.body, 'body') ??
        stripUndefined({ payload: postData.payload })
    }, postData, context),
    getTask: (postData, context) => this.invokeAction({
      method: 'GET',
      path: `/tasks/${readString(postData.taskId, 'taskId')}`
    }, postData, context),
    claimTask: (postData, context) => this.invokeAction({
      method: 'POST',
      path: `/tasks/${readString(postData.taskId, 'taskId')}/claim`,
      body: {}
    }, postData, context),
    approveTask: (postData, context) => this.invokeAction({
      method: 'POST',
      path: `/tasks/${readString(postData.taskId, 'taskId')}/approve`,
      body: stripUndefined({ comment: postData.comment, variables: postData.variables })
    }, postData, context),
    rejectTask: (postData, context) => this.invokeAction({
      method: 'POST',
      path: `/tasks/${readString(postData.taskId, 'taskId')}/reject`,
      body: stripUndefined({ comment: postData.comment, targetNodeId: postData.targetNodeId })
    }, postData, context),
    transferTask: (postData, context) => this.invokeAction({
      method: 'POST',
      path: `/tasks/${readString(postData.taskId, 'taskId')}/transfer`,
      body: stripUndefined({ targetUserId: postData.targetUserId, comment: postData.comment })
    }, postData, context),
    addSignTask: (postData, context) => this.invokeAction({
      method: 'POST',
      path: `/tasks/${readString(postData.taskId, 'taskId')}/add-sign`,
      body: stripUndefined({ targetUserId: postData.targetUserId, comment: postData.comment })
    }, postData, context),
    getHistoryTimeline: (postData, context) => this.invokeAction({
      method: 'GET',
      path: `/history/instances/${readString(postData.instanceId, 'instanceId')}/timeline`
    }, postData, context)
  };

  constructor(
    @Inject(WORKFLOW_SERVICE_CLIENT)
    private readonly workflowClient: ClientProxy
  ) {
    super();
  }

  protected override resources(): ResourceConfigMap {
    return workflowResources;
  }

  protected override hooks(): ServiceHooks {
    const outputHooks = {
      afterAction: this.normalizeResourceResult
    };

    return {
      wf_model: {
        beforeCreate: this.normalizeModelPayload,
        beforeUpdate: this.normalizeModelPayload,
        ...outputHooks
      },
      wf_model_version: outputHooks,
      wf_process_definition: outputHooks,
      wf_process_instance: outputHooks,
      wf_node_instance: outputHooks,
      wf_task: outputHooks,
      wf_job: {
        beforeCreate: this.normalizeJobPayload,
        beforeUpdate: this.normalizeJobPayload,
        ...outputHooks
      },
      wf_job_run: outputHooks
    };
  }

  protected override listItemHandlers(): Record<string, ListItemsHandler> {
    return {
      models: (postData, context) => this.listResource('wf_model', postData, context),
      definitions: (postData, context) =>
        this.listResource('wf_process_definition', postData, context),
      instances: (postData, context) =>
        this.listResource('wf_process_instance', postData, context),
      nodeInstances: (postData, context) =>
        this.listResource('wf_node_instance', postData, context),
      tasks: (postData, context) => this.listResource('wf_task', postData, context),
      startedInstances: (postData, context) =>
        this.listResource(
          'wf_process_instance',
          {
            ...postData,
            filters: {
              ...(isRecord(postData.filters) ? postData.filters : {}),
              initiatorId: context.userId
            }
          },
          context
        ),
      jobs: (postData, context) => this.listResource('wf_job', postData, context),
      jobRuns: (postData, context) => this.listResource('wf_job_run', postData, context),
      todoTasks: (postData, context) =>
        this.invokeWorkflowList('/tasks/todo', postData, context),
      doneTasks: (postData, context) =>
        this.invokeWorkflowList('/tasks/done', postData, context),
      ccTasks: (postData, context) =>
        this.invokeWorkflowList('/tasks/cc', postData, context),
      startedTasks: (postData, context) =>
        this.invokeWorkflowList('/tasks/started', postData, context)
    };
  }

  protected override async executeAction(
    method: string,
    postData: PostData,
    context: ServiceContext
  ) {
    const compatibilityHandler = this.compatibilityHandlers[method];
    if (compatibilityHandler) return compatibilityHandler(postData, context);

    const actionHandler = this.actionHandlers[method];
    if (!actionHandler) return super.executeAction(method, postData, context);

    await this.assertActionAccess(method, postData, context);
    return actionHandler(postData, context);
  }

  protected override async createItem(postData: PostData, context: ServiceContext) {
    const normalizedPostData = this.normalizeCrudPostData(postData);
    return super.createItem(normalizedPostData, context);
  }

  protected override async updateItem(postData: PostData, context: ServiceContext) {
    const normalizedPostData = this.normalizeCrudPostData(postData);
    return super.updateItem(normalizedPostData, context);
  }

  protected override async saveItem(postData: PostData, context: ServiceContext) {
    const normalizedPostData = this.normalizeCrudPostData(postData);
    return super.saveItem(normalizedPostData, context);
  }

  private normalizeResourceResult = (ctx: HookContext) => {
    ctx.result = mapWorkflowResult(ctx.resourceName, ctx.result);
  };

  private normalizeModelPayload = (ctx: HookContext) => {
    const code = readOptionalString(ctx.data.code);
    const name = readOptionalString(ctx.data.name);
    const documentType = ctx.data.document_type ?? ctx.data.documentType;
    const schema = ctx.data.draft_schema ?? ctx.data.draftSchema ?? ctx.data.schema;

    if (code) ctx.data.code = code;
    if (name) ctx.data.name = name;
    if (documentType !== undefined) {
      ctx.data.document_type = readOptionalString(documentType) || null;
    }
    delete ctx.data.documentType;
    delete ctx.data.draftSchema;
    delete ctx.data.schema;

    if (schema !== undefined) {
      if (!isRecord(schema)) throw new BadRequestException('schema must be an object.');
      if (!code || !name) {
        throw new BadRequestException('code and name are required when updating workflow schema.');
      }
      const dto = {
        code,
        name,
        ...(readOptionalString(documentType)
          ? { documentType: readOptionalString(documentType) }
          : {}),
        schema
      };
      const draftSchema = normalizeWorkflowDraftSchema(dto);
      validateWorkflowDraftSchema(draftSchema, false);
      ctx.data.draft_schema = draftSchema;
    }
  };

  private normalizeJobPayload = (ctx: HookContext) => {
    const type = readOptionalString(ctx.data.type);
    if (type && !WORKFLOW_JOB_TYPES.has(type)) {
      throw new BadRequestException(`Unsupported workflow job type: ${type}`);
    }

    if (ctx.action === 'create') {
      ctx.data.code = readString(ctx.data.code, 'code');
      ctx.data.name = readString(ctx.data.name, 'name');
      ctx.data.type = readString(type, 'type');
    } else if (ctx.data.name !== undefined) {
      ctx.data.name = readString(ctx.data.name, 'name');
    }

    const hasPayload = ctx.data.payload !== undefined;
    const hasInterval =
      ctx.data.intervalSeconds !== undefined || ctx.data.interval_seconds !== undefined;
    if (ctx.action === 'create' || hasPayload || hasInterval) {
      const payload = readOptionalRecord(ctx.data.payload, 'payload') ?? {};
      const intervalSeconds = readPositiveInteger(
        ctx.data.intervalSeconds ?? ctx.data.interval_seconds ?? payload.intervalSeconds,
        'intervalSeconds'
      );
      if (type === 'interval' || (!type && intervalSeconds)) {
        const normalizedInterval = intervalSeconds ?? 60;
        if (normalizedInterval % 60 !== 0 || normalizedInterval / 60 > 59) {
          throw new BadRequestException(
            'Trigger.dev interval jobs must use a whole number of minutes from 1 to 59.'
          );
        }
        payload.intervalSeconds = normalizedInterval;
      }
      ctx.data.payload = payload;
    }

    const cronExpr = readOptionalString(ctx.data.cron_expr ?? ctx.data.cronExpr);
    if (type === 'cron' && !cronExpr) {
      throw new BadRequestException('Cron job requires cronExpr.');
    }
    if (ctx.data.cron_expr !== undefined || ctx.data.cronExpr !== undefined || type === 'cron') {
      ctx.data.cron_expr = cronExpr || null;
    }

    const triggerTaskId = readOptionalString(
      ctx.data.trigger_task_id ?? ctx.data.triggerTaskId
    );
    if (ctx.action === 'create' || triggerTaskId) {
      ctx.data.trigger_task_id = triggerTaskId ||
        (type === 'service_task' ? 'workflow.service.execute' : 'workflow.job.run');
    }

    if (ctx.data.timezone !== undefined || ctx.action === 'create') {
      ctx.data.timezone = readOptionalString(ctx.data.timezone) || 'Asia/Shanghai';
    }
    if (ctx.data.retry_policy !== undefined || ctx.data.retryPolicy !== undefined) {
      ctx.data.retry_policy =
        readOptionalRecord(ctx.data.retry_policy ?? ctx.data.retryPolicy, 'retryPolicy') ??
        { maxAttempts: 3 };
    }
    if (ctx.data.timeout_seconds !== undefined || ctx.data.timeoutSeconds !== undefined) {
      ctx.data.timeout_seconds =
        readPositiveInteger(
          ctx.data.timeout_seconds ?? ctx.data.timeoutSeconds,
          'timeoutSeconds'
        ) ?? null;
    }
    if (ctx.data.concurrency_key !== undefined || ctx.data.concurrencyKey !== undefined) {
      ctx.data.concurrency_key =
        readOptionalString(ctx.data.concurrency_key ?? ctx.data.concurrencyKey) || null;
    }

    delete ctx.data.intervalSeconds;
    delete ctx.data.interval_seconds;
    delete ctx.data.triggerTaskId;
    delete ctx.data.cronExpr;
    delete ctx.data.retryPolicy;
    delete ctx.data.timeoutSeconds;
    delete ctx.data.concurrencyKey;
  };

  private resolveWorkflowResourceName(postData: PostData) {
    return this.tryResolveResource(postData)?.name ?? 'workflow';
  }

  private normalizeCrudPostData(postData: PostData) {
    const resourceName = this.resolveWorkflowResourceName(postData);
    if (resourceName === 'workflow') return postData;

    const rawData = isRecord(postData.data)
      ? postData.data
      : Object.fromEntries(
          Object.entries(postData).filter(([field]) => ![
            'resource',
            'itemType',
            'item_type',
            'tableName',
            'table_name',
            'id',
            'ids',
            'filters',
            'sorts',
            'limit',
            'page',
            'pageSize',
            'page_size',
            'offset'
          ].includes(field))
        );
    const data = Object.fromEntries(
      Object.entries(rawData).map(([field, value]) => [toSnakeCase(field), value])
    );

    return {
      ...postData,
      resource: resourceName,
      data
    };
  }

  private async listResource(
    resourceName: string,
    postData: PostData,
    context: ServiceContext
  ) {
    return super.listItems(normalizeResourceListInput(resourceName, postData), context);
  }

  private async getModel(postData: PostData, context: ServiceContext) {
    const modelId = readString(postData.modelId ?? postData.id, 'modelId');
    const [model] = await this.listResource(
      'wf_model',
      { filters: { id: modelId }, limit: 1 },
      context
    ) as PostData[];
    if (!model) throw new NotFoundException('Workflow model not found.');

    const versions = await this.listResource(
      'wf_model_version',
      { filters: { modelId }, limit: 1000 },
      context
    );
    return { ...model, versions };
  }

  private async saveModel(postData: PostData, context: ServiceContext) {
    const code = readString(postData.code, 'code');
    const explicitId = readOptionalString(postData.modelId ?? postData.id);
    let modelId = explicitId;

    if (!modelId) {
      const [existing] = await this.listResource(
        'wf_model',
        { filters: { code }, limit: 1 },
        context
      ) as PostData[];
      modelId = readOptionalString(existing?.id);
    }

    return this.saveItem({
      resource: 'wf_model',
      ...(modelId ? { id: modelId } : {}),
      data: {
        code,
        name: postData.name,
        documentType: postData.documentType,
        schema: postData.schema
      }
    }, context);
  }

  private updateModel(postData: PostData, context: ServiceContext) {
    return this.updateItem({
      resource: 'wf_model',
      id: readString(postData.modelId ?? postData.id, 'modelId'),
      data: {
        code: postData.code,
        name: postData.name,
        documentType: postData.documentType,
        schema: postData.schema
      }
    }, context);
  }

  private disableDefinition(postData: PostData, context: ServiceContext) {
    return this.updateItem({
      resource: 'wf_process_definition',
      id: readString(postData.definitionId ?? postData.id, 'definitionId'),
      data: { status: 'disabled' }
    }, context);
  }

  private createJob(postData: PostData, context: ServiceContext) {
    return this.createItem({ resource: 'wf_job', data: postData }, context);
  }

  private async getJob(postData: PostData, context: ServiceContext) {
    const jobId = readString(postData.jobId ?? postData.id, 'jobId');
    const [job] = await this.listResource(
      'wf_job',
      { filters: { id: jobId }, limit: 1 },
      context
    ) as PostData[];
    if (!job) throw new NotFoundException('Workflow job not found.');
    return job;
  }

  private invokeWorkflowList(path: string, postData: PostData, context: ServiceContext) {
    return this.invokeWorkflowService(
      { method: 'GET', path, query: resolveRpcListQuery(postData) },
      postData,
      context
    );
  }

  private invokeAction(
    request: WorkflowRequest,
    postData: PostData,
    context: ServiceContext
  ) {
    return this.invokeWorkflowService(request, postData, context);
  }

  private async assertActionAccess(
    method: string,
    postData: PostData,
    context: ServiceContext
  ) {
    if (
      method === 'getRuntimeStatus' ||
      method === 'getApprovalConsole' ||
      method === 'getApprovalConsoleDetail' ||
      method === 'terminateInstance'
    ) {
      await this.assertRuntimeManagementAccess(context);
    }

    if (method !== 'transferTask' && method !== 'addSignTask') return;

    const targetUserId = readString(postData.targetUserId, 'targetUserId');
    await assertAccountUsers(
      context,
      [targetUserId],
      'The workflow target user must belong to the active account set.'
    );
  }

  private async assertRuntimeManagementAccess(context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const authorization = await getUserAuthorization(client, user.id, {
      accountId: context.accountId,
      refresh: true
    });
    if (!hasRequiredPermission(authorization, 'workflow.runtime.manage')) {
      throw new ForbiddenException('Permission required: workflow.runtime.manage');
    }
  }

  private async invokeWorkflowService(
    request: WorkflowRequest,
    postData: PostData,
    context: ServiceContext
  ) {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-tenant-id': context.accountId ?? ''
    };

    if (!headers['x-tenant-id']) {
      throw new BadRequestException('An active account set is required.');
    }

    const authenticatedUserId = context.userId?.trim();
    if (!authenticatedUserId) {
      throw new ForbiddenException('An authenticated workflow user is required.');
    }

    headers['x-user-id'] = authenticatedUserId;
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
