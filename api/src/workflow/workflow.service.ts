import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable
} from '@nestjs/common';

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
import type {
  PublishWorkflowModelDto,
  SaveWorkflowModelDto
} from './definition/definition.dto';
import { DefinitionService } from './definition/definition.service';
import type { CreateJobDto, RunJobDto } from './job/job.dto';
import type { WorkflowJobRecord } from './job/job.types';
import { JobService } from './job/job.service';
import { ApprovalConsoleService } from './runtime/approval-console.service';
import type {
  AddSignTaskDto,
  CompleteTaskDto,
  InstanceActionDto,
  RejectTaskDto,
  StartWorkflowInstanceDto,
  TransferTaskDto,
  WorkflowCcQuery,
  WorkflowInstanceQuery,
  WorkflowTaskQuery
} from './runtime/runtime.dto';
import type { RuntimeActor } from './runtime/runtime.types';
import { RuntimeService } from './runtime/runtime.service';
import { TriggerRuntimeStatusService } from './trigger/trigger-runtime-status.service';
import {
  normalizeWorkflowDraftSchema,
  validateWorkflowDraftSchema
} from './workflow.model';
import { workflowResources } from './workflow.resources';

type PostData = Record<string, unknown>;

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

function readRecord(value: unknown, name: string) {
  const record = readOptionalRecord(value, name);
  if (record) return record;
  throw new BadRequestException(`Missing required field: ${name}`);
}

function readPositiveInteger(value: unknown, name: string) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  throw new BadRequestException(`${name} must be a positive integer.`);
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

function resolveListQuery(postData: PostData) {
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
  constructor(
    @Inject(DefinitionService)
    private readonly definitionService: DefinitionService,
    @Inject(RuntimeService)
    private readonly runtimeService: RuntimeService,
    @Inject(ApprovalConsoleService)
    private readonly approvalConsoleService: ApprovalConsoleService,
    @Inject(JobService)
    private readonly jobService: JobService,
    @Inject(TriggerRuntimeStatusService)
    private readonly triggerRuntimeStatus: TriggerRuntimeStatusService
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
        this.runtimeService.listTodoTasks(
          this.resolveActor(context),
          resolveListQuery(postData) as WorkflowTaskQuery
        ),
      doneTasks: (postData, context) =>
        this.runtimeService.listDoneTasks(
          this.resolveActor(context),
          resolveListQuery(postData) as WorkflowTaskQuery
        ),
      ccTasks: (postData, context) =>
        this.runtimeService.listCc(
          this.resolveActor(context),
          resolveListQuery(postData) as WorkflowCcQuery
        ),
      startedTasks: (postData, context) =>
        this.runtimeService.listStarted(
          this.resolveActor(context),
          resolveListQuery(postData) as WorkflowInstanceQuery
        )
    };
  }

  protected override async executeAction(
    method: string,
    postData: PostData,
    context: ServiceContext
  ) {
    switch (method) {
      case 'getModel': {
        const actor = this.resolveActor(context);
        return this.definitionService.getModel(
          readString(postData.modelId ?? postData.id, 'modelId'),
          actor.tenantId
        );
      }
      case 'saveModel': {
        const actor = this.resolveActor(context);
        const modelId = readOptionalString(postData.modelId ?? postData.id);
        return this.definitionService.saveModel(
          this.readSaveModelDto(postData),
          actor,
          modelId || undefined
        );
      }
      case 'updateModel':
        return this.definitionService.saveModel(
          this.readSaveModelDto(postData),
          this.resolveActor(context),
          readString(postData.modelId ?? postData.id, 'modelId')
        );
      case 'disableDefinition': {
        const actor = this.resolveActor(context);
        return this.definitionService.disableDefinition(
          readString(postData.definitionId ?? postData.id, 'definitionId'),
          actor.tenantId
        );
      }
      case 'publishModel':
        return this.definitionService.publishModel(
          readString(postData.modelId, 'modelId'),
          this.readPublishModelDto(postData),
          this.resolveActor(context)
        );
      case 'getDefinitionCapabilities':
        return this.definitionService.getCapabilities();
      case 'getRuntimeStatus':
        await this.assertRuntimeManagementAccess(context);
        return this.triggerRuntimeStatus.getStatus(this.resolveActor(context).tenantId);
      case 'getApprovalConsole':
        await this.assertRuntimeManagementAccess(context);
        return this.approvalConsoleService.listInstances(
          this.resolveActor(context).tenantId,
          resolveListQuery(postData)
        );
      case 'getApprovalConsoleDetail':
        await this.assertRuntimeManagementAccess(context);
        return this.approvalConsoleService.getInstanceDetail(
          readString(postData.instanceId, 'instanceId'),
          this.resolveActor(context).tenantId
        );
      case 'getInstance':
        return this.runtimeService.getInstance(
          readString(postData.instanceId, 'instanceId'),
          this.resolveActor(context).tenantId
        );
      case 'getInstanceTimeline':
      case 'getHistoryTimeline':
        return this.runtimeService.getTimeline(
          readString(postData.instanceId, 'instanceId'),
          this.resolveActor(context).tenantId
        );
      case 'startInstance':
        return this.runtimeService.startInstance(
          this.readStartInstanceDto(postData),
          this.resolveActor(context)
        );
      case 'withdrawInstance':
        return this.runtimeService.withdrawInstance(
          readString(postData.instanceId, 'instanceId'),
          this.readInstanceActionDto(postData),
          this.resolveActor(context)
        );
      case 'terminateInstance':
        await this.assertRuntimeManagementAccess(context);
        return this.runtimeService.terminateInstance(
          readString(postData.instanceId, 'instanceId'),
          this.readInstanceActionDto(postData),
          this.resolveActor(context)
        );
      case 'createJob':
        return this.jobService.createJob(
          this.readCreateJobDto(postData),
          this.resolveActor(context)
        );
      case 'getJob':
        return this.jobService.getJob(
          readString(postData.jobId ?? postData.id, 'jobId'),
          this.resolveActor(context)
        );
      case 'updateJobStatus':
        return this.jobService.updateJobStatus(
          readString(postData.jobId, 'jobId'),
          readString(postData.status, 'status') as WorkflowJobRecord['status'],
          this.resolveActor(context)
        );
      case 'runJob':
        return this.jobService.runJob(
          readString(postData.jobId, 'jobId'),
          this.readRunJobDto(postData),
          this.resolveActor(context)
        );
      case 'getTask':
        return this.runtimeService.getTask(
          readString(postData.taskId, 'taskId'),
          this.resolveActor(context).tenantId
        );
      case 'claimTask':
        return this.runtimeService.claimTask(
          readString(postData.taskId, 'taskId'),
          this.resolveActor(context)
        );
      case 'approveTask':
        return this.runtimeService.completeTask(
          readString(postData.taskId, 'taskId'),
          this.readCompleteTaskDto(postData),
          this.resolveActor(context)
        );
      case 'rejectTask':
        return this.runtimeService.rejectTask(
          readString(postData.taskId, 'taskId'),
          this.readRejectTaskDto(postData),
          this.resolveActor(context)
        );
      case 'transferTask':
        await this.assertTargetAccountUser(postData, context);
        return this.runtimeService.transferTask(
          readString(postData.taskId, 'taskId'),
          this.readTransferTaskDto(postData),
          this.resolveActor(context)
        );
      case 'addSignTask':
        await this.assertTargetAccountUser(postData, context);
        return this.runtimeService.addSignTask(
          readString(postData.taskId, 'taskId'),
          this.readAddSignTaskDto(postData),
          this.resolveActor(context)
        );
      default:
        return super.executeAction(method, postData, context);
    }
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

  private async assertTargetAccountUser(
    postData: PostData,
    context: ServiceContext
  ) {
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

  private resolveActor(context: ServiceContext): RuntimeActor {
    const tenantId = context.accountId?.trim();
    if (!tenantId) {
      throw new BadRequestException('An active account set is required.');
    }

    const userId = context.userId?.trim();
    if (!userId) {
      throw new ForbiddenException('An authenticated workflow user is required.');
    }

    return { tenantId, userId };
  }

  private readSaveModelDto(postData: PostData): SaveWorkflowModelDto {
    const documentType = readOptionalString(postData.documentType);
    return {
      code: readString(postData.code, 'code'),
      name: readString(postData.name, 'name'),
      ...(documentType ? { documentType } : {}),
      schema: readRecord(postData.schema, 'schema')
    };
  }

  private readPublishModelDto(postData: PostData): PublishWorkflowModelDto {
    const body = readOptionalRecord(postData.body, 'body');
    const remark = body?.remark ?? postData.remark;
    return typeof remark === 'string' ? { remark } : {};
  }

  private readInstanceActionDto(postData: PostData): InstanceActionDto {
    return typeof postData.comment === 'string' ? { comment: postData.comment } : {};
  }

  private readStartInstanceDto(postData: PostData): StartWorkflowInstanceDto {
    const documentType = readOptionalString(postData.documentType);
    const documentId = readOptionalString(postData.documentId);
    const variables = readOptionalRecord(postData.variables, 'variables');
    return {
      definitionId: readString(postData.definitionId, 'definitionId'),
      businessKey: readString(postData.businessKey, 'businessKey'),
      title: readString(postData.title, 'title'),
      ...(documentType ? { documentType } : {}),
      ...(documentId ? { documentId } : {}),
      ...(variables ? { variables } : {})
    };
  }

  private readCompleteTaskDto(postData: PostData): CompleteTaskDto {
    const comment = readOptionalString(postData.comment);
    const variables = readOptionalRecord(postData.variables, 'variables');
    return {
      ...(comment ? { comment } : {}),
      ...(variables ? { variables } : {})
    };
  }

  private readRejectTaskDto(postData: PostData): RejectTaskDto {
    const comment = readOptionalString(postData.comment);
    const targetNodeId = readOptionalString(postData.targetNodeId);
    return {
      ...(comment ? { comment } : {}),
      ...(targetNodeId ? { targetNodeId } : {})
    };
  }

  private readTransferTaskDto(postData: PostData): TransferTaskDto {
    const comment = readOptionalString(postData.comment);
    return {
      targetUserId: readString(postData.targetUserId, 'targetUserId'),
      ...(comment ? { comment } : {})
    };
  }

  private readAddSignTaskDto(postData: PostData): AddSignTaskDto {
    const comment = readOptionalString(postData.comment);
    return {
      targetUserId: readString(postData.targetUserId, 'targetUserId'),
      ...(comment ? { comment } : {})
    };
  }

  private readCreateJobDto(postData: PostData): CreateJobDto {
    const type = readString(postData.type, 'type');
    if (!WORKFLOW_JOB_TYPES.has(type)) {
      throw new BadRequestException(`Unsupported workflow job type: ${type}`);
    }

    const triggerTaskId = readOptionalString(postData.triggerTaskId);
    const cronExpr = readOptionalString(postData.cronExpr);
    const timezone = readOptionalString(postData.timezone);
    const intervalSeconds = readPositiveInteger(postData.intervalSeconds, 'intervalSeconds');
    const payload = readOptionalRecord(postData.payload, 'payload');
    const retryPolicy = readOptionalRecord(postData.retryPolicy, 'retryPolicy');
    const timeoutSeconds = readPositiveInteger(postData.timeoutSeconds, 'timeoutSeconds');
    const concurrencyKey = readOptionalString(postData.concurrencyKey);

    return {
      code: readString(postData.code, 'code'),
      name: readString(postData.name, 'name'),
      type: type as CreateJobDto['type'],
      ...(triggerTaskId ? { triggerTaskId } : {}),
      ...(cronExpr ? { cronExpr } : {}),
      ...(timezone ? { timezone } : {}),
      ...(intervalSeconds ? { intervalSeconds } : {}),
      ...(payload ? { payload } : {}),
      ...(retryPolicy ? { retryPolicy } : {}),
      ...(timeoutSeconds ? { timeoutSeconds } : {}),
      ...(concurrencyKey ? { concurrencyKey } : {})
    };
  }

  private readRunJobDto(postData: PostData): RunJobDto {
    const body = readOptionalRecord(postData.body, 'body');
    const payload = body?.payload ?? postData.payload;
    if (payload === undefined) return {};
    return { payload: readOptionalRecord(payload, 'payload') ?? {} };
  }
}
