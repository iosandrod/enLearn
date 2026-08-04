import { Controller, HttpException, Inject, NotFoundException } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { ok } from '../workflow/common/api-response';
import { DefinitionService } from '../workflow/definition/definition.service';
import type {
  PublishWorkflowModelDto,
  SaveWorkflowModelDto,
  WorkflowDefinitionQuery,
  WorkflowModelQuery
} from '../workflow/definition/definition.dto';
import { TriggerCredentialsService } from '../workflow/trigger/trigger-credentials.service';
import { RuntimeService } from '../workflow/runtime/runtime.service';
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
} from '../workflow/runtime/runtime.dto';
import { JobService } from '../workflow/job/job.service';
import type {
  CreateJobDto,
  JobQueryDto,
  JobRunQueryDto,
  RunJobDto,
  UpdateJobStatusDto
} from '../workflow/job/job.dto';
import {
  WORKFLOW_REQUEST_PATTERN,
  type WorkflowApiEnvelope,
  type WorkflowRequest
} from '../workflow/workflow.transport';
import { ApprovalFlowTestService } from '../workflow/testing/approval-flow-test.service';

@Controller()
export class WorkflowRpcController {
  constructor(
    @Inject(DefinitionService)
    private readonly definitionService: DefinitionService,
    @Inject(RuntimeService)
    private readonly runtimeService: RuntimeService,
    @Inject(JobService)
    private readonly jobService: JobService,
    @Inject(ApprovalFlowTestService)
    private readonly approvalFlowTestService: ApprovalFlowTestService,
    @Inject(TriggerCredentialsService)
    private readonly triggerCredentials: TriggerCredentialsService
  ) {}

  @MessagePattern(WORKFLOW_REQUEST_PATTERN)
  async handleRequest(
    @Payload() request: WorkflowRequest
  ): Promise<WorkflowApiEnvelope> {
    try {
      return ok(await this.dispatch(request));
    } catch (error) {
      return {
        success: false,
        error: {
          code: error instanceof HttpException ? String(error.getStatus()) : 'WORKFLOW_RPC_ERROR',
          message: error instanceof Error ? error.message : 'Workflow service request failed.'
        }
      };
    }
  }

  private async dispatch(request: WorkflowRequest) {
    const [resource, idOrAction, action] = this.getPathParts(request.path);
    const body = request.body ?? {};
    const query = request.query ?? {};

    if (resource === 'health' && request.method === 'GET') {
      return {
        service: 'workflow-service',
        status: 'ok',
        triggerEngine: await this.triggerCredentials.getStatus(),
        timestamp: new Date().toISOString()
      };
    }

    const actor = this.resolveActor(request.headers);

    if (resource === 'models') {
      if (request.method === 'GET' && !idOrAction) {
        return this.definitionService.listModels({ ...query, tenantId: actor.tenantId } as WorkflowModelQuery);
      }
      if (request.method === 'GET' && idOrAction) {
        return this.definitionService.getModel(idOrAction, actor.tenantId);
      }
      if (request.method === 'POST' && !idOrAction) {
        return this.definitionService.saveModel(
          this.asDto<SaveWorkflowModelDto>(body),
          actor
        );
      }
      if (request.method === 'PUT' && idOrAction) {
        return this.definitionService.saveModel(
          this.asDto<SaveWorkflowModelDto>(body),
          actor,
          idOrAction
        );
      }
      if (request.method === 'POST' && idOrAction && action === 'publish') {
        return this.definitionService.publishModel(
          idOrAction,
          body as PublishWorkflowModelDto,
          actor
        );
      }
    }

    if (resource === 'definitions') {
      if (request.method === 'GET' && idOrAction === 'capabilities') {
        return this.definitionService.getCapabilities();
      }
      if (request.method === 'GET' && !idOrAction) {
        return this.definitionService.listDefinitions({ ...query, tenantId: actor.tenantId } as WorkflowDefinitionQuery);
      }
      if (request.method === 'POST' && idOrAction && action === 'disable') {
        return this.definitionService.disableDefinition(idOrAction, actor.tenantId);
      }
    }

    if (resource === 'instances') {
      if (request.method === 'GET' && !idOrAction) {
        return this.runtimeService.listInstances(this.withActorTenant(query, actor.tenantId));
      }
      if (request.method === 'GET' && idOrAction === 'started') {
        return this.runtimeService.listStarted(actor, query as WorkflowInstanceQuery);
      }
      if (request.method === 'GET' && idOrAction && !action) {
        return this.runtimeService.getInstance(idOrAction, actor.tenantId);
      }
      if (request.method === 'GET' && idOrAction && action === 'timeline') {
        return this.runtimeService.getTimeline(idOrAction, actor.tenantId);
      }
      if (request.method === 'POST' && !idOrAction) {
        return this.runtimeService.startInstance(this.asDto<StartWorkflowInstanceDto>(body), actor);
      }
      if (request.method === 'POST' && idOrAction && action === 'withdraw') {
        return this.runtimeService.withdrawInstance(idOrAction, body as InstanceActionDto, actor);
      }
      if (request.method === 'POST' && idOrAction && action === 'terminate') {
        return this.runtimeService.terminateInstance(idOrAction, body as InstanceActionDto, actor);
      }
    }

    if (resource === 'tasks') {
      if (request.method === 'GET' && idOrAction === 'todo') {
        return this.runtimeService.listTodoTasks(actor, query as WorkflowTaskQuery);
      }
      if (request.method === 'GET' && idOrAction === 'done') {
        return this.runtimeService.listDoneTasks(actor, query as WorkflowTaskQuery);
      }
      if (request.method === 'GET' && idOrAction === 'cc') {
        return this.runtimeService.listCc(actor, query as WorkflowCcQuery);
      }
      if (request.method === 'GET' && idOrAction === 'started') {
        return this.runtimeService.listStarted(actor);
      }
      if (request.method === 'GET' && idOrAction && !action) {
        return this.runtimeService.getTask(idOrAction, actor.tenantId);
      }
      if (request.method === 'POST' && idOrAction && action === 'claim') {
        return this.runtimeService.claimTask(idOrAction, actor);
      }
      if (request.method === 'POST' && idOrAction && action === 'approve') {
        return this.runtimeService.completeTask(idOrAction, body as CompleteTaskDto, actor);
      }
      if (request.method === 'POST' && idOrAction && action === 'reject') {
        return this.runtimeService.rejectTask(idOrAction, body as RejectTaskDto, actor);
      }
      if (request.method === 'POST' && idOrAction && action === 'transfer') {
        return this.runtimeService.transferTask(idOrAction, this.asDto<TransferTaskDto>(body), actor);
      }
      if (request.method === 'POST' && idOrAction && action === 'add-sign') {
        return this.runtimeService.addSignTask(idOrAction, this.asDto<AddSignTaskDto>(body), actor);
      }
    }

    if (resource === 'history' && request.method === 'GET') {
      const [, , instanceId, historyAction] = this.getPathParts(request.path);
      if (idOrAction === 'instances' && instanceId && historyAction === 'timeline') {
        return this.runtimeService.getTimeline(instanceId, actor.tenantId);
      }
    }

    if (resource === 'jobs') {
      if (request.method === 'GET' && !idOrAction) {
        return this.jobService.listJobs(query as JobQueryDto, actor);
      }
      if (request.method === 'POST' && !idOrAction) {
        return this.jobService.createJob(this.asDto<CreateJobDto>(body), actor);
      }
      if (request.method === 'GET' && idOrAction === 'runs') {
        return this.jobService.listRuns(query as JobRunQueryDto, actor);
      }
      if (request.method === 'GET' && idOrAction && !action) {
        return this.jobService.getJob(idOrAction, actor);
      }
      if (request.method === 'POST' && idOrAction && action === 'status') {
        return this.jobService.updateJobStatus(
          idOrAction,
          this.asDto<UpdateJobStatusDto>(body).status,
          actor
        );
      }
      if (request.method === 'POST' && idOrAction && action === 'run') {
        return this.jobService.runJob(idOrAction, body as RunJobDto, actor);
      }
    }

    if (resource === 'tests') {
      if (request.method === 'POST' && idOrAction === 'approval-flow' && action === 'run') {
        return this.approvalFlowTestService.runOneClick(
          body,
          actor
        );
      }
    }

    throw new NotFoundException(`Unsupported workflow route: ${request.method} ${request.path}`);
  }

  private getPathParts(path: string) {
    return path
      .split('/')
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
  }

  private resolveActor(headers: Record<string, string> | undefined) {
    const headerTenantId = headers?.['x-tenant-id']?.trim();
    const headerUserId = headers?.['x-user-id']?.trim();

    if (!headerTenantId) {
      throw new NotFoundException('An active account set is required.');
    }

    return {
      tenantId: headerTenantId,
      ...(headerUserId ? { userId: headerUserId } : {})
    };
  }

  private readString(value: unknown) {
    return typeof value === 'string' ? value : undefined;
  }

  private withActorTenant<T extends Record<string, unknown>>(query: T, tenantId: string) {
    return { ...query, tenantId } as T & { tenantId: string };
  }

  private asDto<T>(value: Record<string, unknown>) {
    return value as unknown as T;
  }
}
