import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';

import {
  BaseService,
  type HookContext,
  type ResourceConfigMap,
  type ServiceHooks
} from '../common/base.service';
import type { ServiceContext } from '../common/interfaces/service-executor';
import { assertAccountUsers } from '../common/utils/account-context';
import {
  getCurrentUser,
} from '../common/utils/supabase';
import { createSupabaseClient } from '../common/utils/supabase';
import type {
  PublishWorkflowModelDto
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
  StartWorkflowDto,
  StartWorkflowInstanceDto,
  TransferTaskDto,
  WorkflowCcQuery,
  WorkflowInstanceQuery,
  WorkflowTaskQuery
} from './runtime/runtime.dto';
import type { RuntimeActor } from './runtime/runtime.types';
import { RuntimeService } from './runtime/runtime.service';
import { TriggerRuntimeStatusService } from './trigger/trigger-runtime-status.service';
import { TaskConsoleService } from './runtime/task-console.service';
import { workflowResources } from './workflow.resources';
import { parseRegisteredCommandFunction, validateRegisteredCommandSource } from './runtime/registered-command.runtime';

type PostData = Record<string, unknown>;

const WORKFLOW_JOB_TYPES = new Set(['once', 'cron', 'interval', 'manual', 'service_task']);
const TRIGGER_WORKFLOW_RUNNER_TASK_ID = 'workflow.trigger-workflow.run';

const RESOURCE_LIST_FIELDS: Record<string, string[]> = {
  wf_task_registry: ['id', 'serviceName', 'commandCode', 'name', 'taskType', 'status', 'version', 'updatedAt'],
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

function readWorkflowEntryType(payload: Record<string, unknown>) {
  const triggerWorkflow = isRecord(payload.triggerWorkflow)
    ? payload.triggerWorkflow
    : undefined;
  const executionPlan = isRecord(triggerWorkflow?.executionPlan)
    ? triggerWorkflow.executionPlan
    : undefined;
  const entryNodeId = typeof executionPlan?.entryNodeId === 'string'
    ? executionPlan.entryNodeId
    : '';
  const operations = Array.isArray(executionPlan?.operations)
    ? executionPlan.operations
    : [];
  const entry = operations.find((rawOperation) =>
    isRecord(rawOperation) && rawOperation.nodeId === entryNodeId
  );
  const type = isRecord(entry) && typeof entry.type === 'string' ? entry.type : '';
  if (type === 'webhook') return 'webhook' as const;
  if (type === 'schedule') return 'schedule' as const;
  if (type === 'entry') return 'start' as const;
  return undefined;
}

function hasMatchingWebhookTrigger(payload: Record<string, unknown>, serviceName: string, serviceMethod: string) {
  const triggerWorkflow = isRecord(payload.triggerWorkflow) ? payload.triggerWorkflow : undefined;
  const executionPlan = isRecord(triggerWorkflow?.executionPlan) ? triggerWorkflow.executionPlan : undefined;
  const operations = Array.isArray(executionPlan?.operations) ? executionPlan.operations : [];
  return operations.some((rawOperation) => {
    if (!isRecord(rawOperation) || rawOperation.type !== 'webhook') return false;
    const options = isRecord(rawOperation.options) ? rawOperation.options : undefined;
    const body = isRecord(options?.body) ? options.body : undefined;
    return body?.serviceName === serviceName && body?.serviceMethod === serviceMethod;
  });
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
  const { tenantId: _tenantId, account_id: _tenantIdSnake, ...safePostData } = postData;
  const { tenantId: _filterTenantId, account_id: _filterTenantIdSnake, ...safeFilters } = filters;
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
    if (databaseField !== 'account_id') filters[databaseField] = value;
  }

  for (const field of RESOURCE_LIST_FIELDS[resourceName] ?? []) {
    const databaseField = toSnakeCase(field);
    const value = postData[field] ?? postData[databaseField];
    if (value !== undefined && databaseField !== 'account_id') {
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
    private readonly triggerRuntimeStatus: TriggerRuntimeStatusService,
    @Inject(TaskConsoleService)
    private readonly taskConsoleService: TaskConsoleService
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
        ...outputHooks
      },
      wf_task_registry: outputHooks,
      wf_model_version: outputHooks,
      wf_process_definition: outputHooks,
      wf_process_instance: outputHooks,
      wf_node_instance: outputHooks,
      wf_task: outputHooks,
      wf_job: {
        ...outputHooks
      },
      wf_job_run: outputHooks
    };
  }

  protected override async executeAction(
    method: string,
    postData: PostData,
    context: ServiceContext
  ) {
    switch (method) {
      case 'getModel': {
        return this.getModelByCrud(readString(postData.modelId ?? postData.id, 'modelId'), context);
      }
      case 'saveModel': {
        return this.saveModelByCrud(postData, context);
      }
      case 'updateModel':
        return this.saveModelByCrud(
          {
            ...postData,
            id: readString(postData.modelId ?? postData.id, 'modelId')
          },
          context
        );
      case 'disableDefinition': {
        return this.disableDefinitionByCrud(
          readString(postData.definitionId ?? postData.id, 'definitionId'),
          context
        );
      }
      case 'publishModel':
        return this.publishModelByRpc(
          readString(postData.modelId, 'modelId'),
          this.readPublishModelDto(postData),
          context
        );
      case 'getDefinitionCapabilities':
        return this.definitionService.getCapabilities();
      case 'getRuntimeStatus':
        return this.triggerRuntimeStatus.getStatus(this.resolveActor(context).tenantId);
      case 'getTaskConsole':
        return this.taskConsoleService.getConsole(
          this.resolveActor(context).tenantId,
          postData.forceRefresh === true
        );
      case 'getTaskConsoleDetail':
        return postData.forceRefresh === true
          ? this.taskConsoleService.refreshDetail(
              this.resolveActor(context).tenantId,
              readString(postData.taskId, 'taskId')
            )
          : this.taskConsoleService.getDetail(
              this.resolveActor(context).tenantId,
              readString(postData.taskId, 'taskId')
            );
      case 'getApprovalConsole':
        return this.approvalConsoleService.listInstances(
          this.resolveActor(context).tenantId,
          resolveListQuery(postData)
        );
      case 'getApprovalConsoleDetail':
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
      case 'startWorkflow':
        return this.runtimeService.startWorkflow(
          this.readStartWorkflowDto(postData),
          this.resolveActor(context)
        );
      case 'withdrawInstance':
        return this.runtimeService.withdrawInstance(
          readString(postData.instanceId, 'instanceId'),
          this.readInstanceActionDto(postData),
          this.resolveActor(context)
        );
      case 'terminateInstance':
        return this.runtimeService.terminateInstance(
          readString(postData.instanceId, 'instanceId'),
          this.readInstanceActionDto(postData),
          this.resolveActor(context)
        );
      case 'createJob': {
        const createJobActor = this.resolveActor(context);
        const job = await this.jobService.createJob(
          this.readCreateJobDto(postData),
          createJobActor
        );
        this.taskConsoleService.invalidate(createJobActor.tenantId);
        return job;
      }
      case 'upsertJob': {
        const upsertJobActor = this.resolveActor(context);
        const job = await this.jobService.upsertJob(
          this.readCreateJobDto(postData),
          upsertJobActor
        );
        this.taskConsoleService.invalidate(upsertJobActor.tenantId);
        return job;
      }
      case 'getJob':
        return this.getJobByCrud(readString(postData.jobId ?? postData.id, 'jobId'), context);
      case 'deleteJob':
        const deleteJobActor = this.resolveActor(context);
        const deletedJob = await this.jobService.deleteJob(
          readString(postData.jobId ?? postData.id, 'jobId'),
          deleteJobActor
        );
        this.taskConsoleService.invalidate(deleteJobActor.tenantId);
        return deletedJob;
      case 'updateJobStatus':
        const updateJobActor = this.resolveActor(context);
        const updatedJob = await this.jobService.updateJobStatus(
          readString(postData.jobId, 'jobId'),
          readString(postData.status, 'status') as WorkflowJobRecord['status'],
          updateJobActor
        );
        this.taskConsoleService.invalidate(updateJobActor.tenantId);
        return updatedJob;
      case 'runJob':
        return this.executeRunJob(postData, context);
      case 'triggerWebhook': {
        // 兼容旧客户端：Webhook 也统一走 runJob，入口类型由作业定义决定。
        return this.executeRunJob(postData, context);
      }
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

  /**
   * 统一的作业入口。开始、Webhook、定时器在执行计划中都属于入口节点，
   * 因此外部只需要调用 runJob；Webhook 调用上下文仅在入口确实为 Webhook
   * 时才会被包装进运行输入。
   */
  private async executeRunJob(postData: PostData, context: ServiceContext) {
    const actor = this.resolveActor(context);
    const jobId = readString(postData.jobId, 'jobId');
    const needsEntryInspection =
      typeof postData.serviceName === 'string' && typeof postData.serviceMethod === 'string';
    const job = needsEntryInspection ? await this.jobService.getJob(jobId, actor) : undefined;
    const entryType = job ? readWorkflowEntryType(job.payload) : undefined;
    const hasWebhookInvocation =
      typeof postData.serviceName === 'string' &&
      typeof postData.serviceMethod === 'string' &&
      (entryType === 'webhook' || entryType === undefined);

    if (hasWebhookInvocation && job && (
      (job.status && job.status !== 'enabled') ||
      (job.triggerTaskId && job.triggerTaskId !== TRIGGER_WORKFLOW_RUNNER_TASK_ID) ||
      !hasMatchingWebhookTrigger(job.payload, postData.serviceName as string, postData.serviceMethod as string)
    )) {
      throw new NotFoundException(
        `Enabled Webhook workflow not found for ${postData.serviceName}.${postData.serviceMethod}.`
      );
    }

    const dto = hasWebhookInvocation
      ? {
          payload: {
            serviceName: readString(postData.serviceName, 'serviceName'),
            serviceMethod: readString(postData.serviceMethod, 'serviceMethod'),
            postData: readRecord(postData.postData, 'postData')
          }
        }
      : this.readRunJobDto(postData);

    const result = await this.jobService.runJob(jobId, dto, actor);
    this.taskConsoleService.invalidate(actor.tenantId);
    return result;
  }

  protected override async createItem(postData: PostData, context: ServiceContext) {
    this.validateRegisteredCommandWrite(postData);
    const normalizedPostData = this.normalizeCrudPostData(postData);
    return super.createItem(normalizedPostData, context);
  }

  protected override async updateItem(postData: PostData, context: ServiceContext) {
    this.validateRegisteredCommandWrite(postData);
    const normalizedPostData = this.normalizeCrudPostData(postData);
    return super.updateItem(normalizedPostData, context);
  }

  protected override async saveItem(postData: PostData, context: ServiceContext) {
    this.validateRegisteredCommandWrite(postData);
    const normalizedPostData = this.normalizeCrudPostData(postData);
    return super.saveItem(normalizedPostData, context);
  }

  private normalizeResourceResult = (ctx: HookContext) => {
    ctx.result = mapWorkflowResult(ctx.resourceName, ctx.result);
  };

  private validateRegisteredCommandWrite(postData: PostData) {
    const resourceName = this.resolveWorkflowResourceName(postData);
    if (resourceName !== 'wf_task_registry') return;
    const raw = isRecord(postData.data) ? postData.data : postData;
    const taskType = readOptionalString(raw.taskType ?? raw.task_type);
    const source = raw.functionSource ?? raw.function_source;
    if (taskType === 'storedProcedure' && (source === undefined || source === null || source === '')) {
      return;
    }
    if (source !== undefined) {
      validateRegisteredCommandSource(readString(source, 'functionSource'));
      parseRegisteredCommandFunction(readString(source, 'functionSource'));
    }
  }

  private async saveModelByCrud(postData: PostData, context: ServiceContext) {
    this.resolveActor(context);
    const modelId = readOptionalString(postData.modelId ?? postData.id);
    if (modelId) {
      const result = await this.updateItem({
        ...postData,
        resource: 'wf_model',
        id: modelId
      }, context);
      if (!result) throw new NotFoundException('Workflow model not found.');
      return result;
    }

    const code = readString(postData.code, 'code');
    const [existing] = await this.listItems({
      resource: 'wf_model',
      filters: { code },
      limit: 1
    }, context) as Array<Record<string, unknown>>;

    if (existing?.id) {
      const result = await this.updateItem({
        ...postData,
        resource: 'wf_model',
        id: existing.id
      }, context);
      if (!result) throw new NotFoundException('Workflow model not found.');
      return result;
    }

    return this.createItem({
      ...postData,
      resource: 'wf_model'
    }, context);
  }

  private async getModelByCrud(modelId: string, context: ServiceContext) {
    this.resolveActor(context);
    const [model] = (await this.listResource(
      'wf_model',
      {
        filters: { id: modelId },
        limit: 1
      },
      context
    )) as Array<Record<string, unknown>>;

    if (!model) {
      throw new NotFoundException('Workflow model not found.');
    }

    const versions = (await this.listResource(
      'wf_model_version',
      {
        filters: { modelId },
        sorts: [{ field: 'version', direction: 'asc' }],
        limit: 1000
      },
      context
    )) as Array<Record<string, unknown>>;

    return {
      ...model,
      versions
    };
  }

  private async disableDefinitionByCrud(definitionId: string, context: ServiceContext) {
    const result = await this.updateItem(
      {
        resource: 'wf_process_definition',
        id: definitionId,
        status: 'disabled'
      },
      context
    );
    if (!result) throw new NotFoundException('Workflow definition not found.');
    return result;
  }

  private async publishModelByRpc(
    modelId: string,
    dto: PublishWorkflowModelDto,
    context: ServiceContext
  ) {
    const actor = this.resolveActor(context);
    const adminClient = createSupabaseClient('admin', context);
    const { data, error } = await adminClient.rpc('publish_workflow_model', {
      p_model_id: modelId,
      p_account_id: actor.tenantId,
      p_user_id: actor.userId,
      p_remark: dto.remark ?? null
    });

    if (error) {
      if (error.code === 'P0002') throw new NotFoundException(error.message);
      if (error.code === '42501') throw new ForbiddenException(error.message);
      throw new BadRequestException(error.message);
    }

    const result = isRecord(data) ? data : {};
    return {
      model: mapWorkflowResult('wf_model', result.model),
      version: mapWorkflowResult('wf_model_version', result.version),
      definition: mapWorkflowResult('wf_process_definition', result.definition)
    };
  }

  private async getJobByCrud(jobId: string, context: ServiceContext) {
    const [job] = (await this.listResource(
      'wf_job',
      {
        filters: { id: jobId },
        limit: 1
      },
      context
    )) as Array<Record<string, unknown>>;

    if (!job) {
      throw new NotFoundException('Workflow job not found.');
    }
    return job;
  }

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
    const hookInputFields = new Set(
      workflowResources[resourceName]?.databaseHookInputFields ?? []
    );

    return {
      ...postData,
      resource: resourceName,
      ...Object.fromEntries(
        Object.entries(rawData).filter(
          ([field]) => hookInputFields.has(field) && postData[field] === undefined
        )
      ),
      data
    };
  }

  private async listResource(
    resourceName: string,
    postData: PostData,
    context: ServiceContext
  ) {
    return this.listItems(normalizeResourceListInput(resourceName, postData), context);
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

  private readStartWorkflowDto(postData: PostData): StartWorkflowDto {
    const workflowId = readOptionalString(postData.workflowId);
    const definitionId = readOptionalString(postData.definitionId);
    if (!workflowId && !definitionId) {
      throw new BadRequestException('Missing required field: workflowId');
    }
    const documentType = readOptionalString(postData.documentType);
    const documentId = readOptionalString(postData.documentId);
    const variables = readOptionalRecord(postData.variables, 'variables');
    return {
      ...(workflowId ? { workflowId } : {}),
      ...(definitionId ? { definitionId } : {}),
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
