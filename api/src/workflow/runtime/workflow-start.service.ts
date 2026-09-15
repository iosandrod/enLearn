import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { WorkflowSupabaseService } from '../common/workflow-supabase.service';
import { DefinitionService } from '../definition/definition.service';
import type { WorkflowProcessDefinitionRecord } from '../definition/definition.types';
import type { WorkflowJobRecord } from '../job/job.types';
import type { RuntimeActor } from './runtime.types';
import type { StartWorkflowDto, StartWorkflowInstanceDto } from './runtime.dto';
import { TriggerDevClient } from '../trigger/trigger-dev.client';
import { TRIGGER_WORKFLOW_RUNNER_TASK_ID } from '../trigger/trigger-workflow.types';
import { assertTriggerWorkflowJobPayload } from '../trigger/trigger-workflow-policy';

const WORKFLOW_RUNTIME_RPC = 'workflow_runtime_command';
const WORKFLOW_JOB_RPC = 'workflow_job_command';

type JsonRecord = Record<string, unknown>;

export type WorkflowStartResult = {
  instanceId: string;
  jobRunId: string;
  triggerRunId: string;
};

/**
 * The single submission boundary for workflow executions.
 *
 * A published process definition is projected to one Trigger workflow run.
 * Human tasks are only a node in that run; they are not a second execution
 * engine. JobService uses submitJob(), while the public startWorkflow API uses
 * startWorkflow().
 */
@Injectable()
export class WorkflowStartService {
  constructor(
    @Inject(WorkflowSupabaseService)
    private readonly persistence: WorkflowSupabaseService,
    @Inject(DefinitionService)
    private readonly definitionService: DefinitionService,
    @Inject(TriggerDevClient)
    private readonly triggerClient: TriggerDevClient
  ) {}

  async startWorkflow(
    dto: StartWorkflowDto | StartWorkflowInstanceDto,
    actor: RuntimeActor
  ): Promise<WorkflowStartResult> {
    const definition = 'workflowId' in dto && !dto.definitionId
      ? await this.resolveDefinitionByModel(dto.workflowId ?? '', actor.tenantId)
      : await this.resolveDefinition(dto.definitionId ?? '', actor.tenantId);
    const job = await this.findWorkflowJob(definition.modelId, actor.tenantId);
    if (job.status === 'archived' || job.triggerTaskId !== TRIGGER_WORKFLOW_RUNNER_TASK_ID) {
      throw new BadRequestException(
        `Workflow job must use ${TRIGGER_WORKFLOW_RUNNER_TASK_ID}.`
      );
    }
    const triggerWorkflow = readRecord(job.payload.triggerWorkflow);

    return this.submit({
      definition,
      triggerWorkflow,
      actor,
      title: dto.title.trim(),
      businessKey: dto.businessKey.trim(),
      documentType: dto.documentType,
      documentId: dto.documentId,
      variables: dto.variables ?? {},
      payload: {
        variables: dto.variables ?? {}
      },
      jobId: job.id
    });
  }

  async submitJob(
    job: WorkflowJobRecord,
    input: JsonRecord,
    actor: RuntimeActor
  ): Promise<WorkflowStartResult> {
    const triggerWorkflow = readRecord(input.triggerWorkflow);
    const modelId = readString(triggerWorkflow.modelId);
    if (!modelId) {
      throw new BadRequestException('Trigger workflow job is missing triggerWorkflow.modelId.');
    }

    const definition = await this.resolveDefinitionByModel(modelId, actor.tenantId);
    assertTriggerWorkflowJobPayload(job.triggerTaskId, { triggerWorkflow });
    return this.submit({
      definition,
      triggerWorkflow,
      actor,
      title: readString(triggerWorkflow.modelName) || job.name,
      businessKey: `workflow-job-instance:${randomUUID()}`,
      variables: isRecord(input.variables) ? input.variables : {},
      payload: input,
      jobId: job.id
    });
  }

  private async submit(input: {
    definition: WorkflowProcessDefinitionRecord;
    triggerWorkflow: JsonRecord;
    actor: RuntimeActor;
    title: string;
    businessKey: string;
    variables: JsonRecord;
    payload: JsonRecord;
    documentType?: string;
    documentId?: string;
    jobId?: string;
  }): Promise<WorkflowStartResult> {
    assertTriggerWorkflowJobPayload(TRIGGER_WORKFLOW_RUNNER_TASK_ID, {
      triggerWorkflow: input.triggerWorkflow
    });

    const instanceId = randomUUID();
    await this.command(WORKFLOW_RUNTIME_RPC, 'create_instance', {
      id: instanceId,
      account_id: input.actor.tenantId,
      definition_id: input.definition.id,
      definition_version: input.definition.version,
      business_key: input.businessKey,
      document_type: input.documentType ?? null,
      document_id: input.documentId ?? null,
      title: input.title,
      initiator_id: input.actor.userId ?? null,
      variables: input.variables,
      variable_types: {}
    });

    let jobRunId: string;
    try {
      const run = await this.command(WORKFLOW_JOB_RPC, 'create_run', {
        account_id: input.actor.tenantId,
        job_id: input.jobId ?? null,
        trigger_run_id: null,
        status: 'queued',
        attempt: 1,
        input: {
          ...input.payload,
          ...(input.jobId ? { jobId: input.jobId } : {}),
          tenantId: input.actor.tenantId,
          ...(input.actor.userId ? { userId: input.actor.userId } : {}),
          instanceId,
          triggerWorkflow: input.triggerWorkflow
        }
      });
      jobRunId = readString(isRecord(run) ? run.id : undefined);
      if (!jobRunId) throw new BadGatewayException('Workflow job RPC returned an invalid run.');
    } catch (error) {
      await this.failInstance(instanceId, error);
      throw error;
    }

    const triggerPayload = {
      ...input.payload,
      runId: jobRunId,
      ...(input.jobId ? { jobId: input.jobId } : {}),
      tenantId: input.actor.tenantId,
      ...(input.actor.userId ? { userId: input.actor.userId } : {}),
      instanceId,
      triggerWorkflow: input.triggerWorkflow
    };

    let triggerRunId: string;
    try {
      const handle = await this.triggerClient.triggerTask(
        TRIGGER_WORKFLOW_RUNNER_TASK_ID,
        triggerPayload,
        {
          idempotencyKey: `workflow-job-run:${jobRunId}`,
          tags: [
            `tenant:${input.actor.tenantId}`,
            `workflow-instance:${instanceId}`,
            `workflow-job-run:${jobRunId}`
          ]
        }
      );
      triggerRunId = handle.id;
    } catch (error) {
      await this.failRun(jobRunId, error);
      await this.failInstance(instanceId, error);
      throw normalizeTriggerInvocationError(error);
    }

    try {
      const projected = await this.command(WORKFLOW_JOB_RPC, 'project_trigger_run', {
        account_id: input.actor.tenantId,
        run_id: jobRunId,
        trigger_run_id: triggerRunId
      });
      if (!projected) throw new NotFoundException('Workflow job run not found.');
      await this.command(WORKFLOW_RUNTIME_RPC, 'set_trigger_run', {
        instance_id: instanceId,
        trigger_run_id: triggerRunId
      });
    } catch (error) {
      await this.failRun(jobRunId, error);
      await this.failInstance(instanceId, error);
      try {
        await this.triggerClient.cancelRun(triggerRunId);
      } catch {
        // Keep the projection error as the request error.
      }
      throw error;
    }

    return { instanceId, jobRunId, triggerRunId };
  }

  private async resolveDefinition(definitionId: string, tenantId: string) {
    const definition = await this.definitionService.getDefinition(definitionId, tenantId);
    if (definition.status !== 'active') {
      throw new BadRequestException('Workflow definition is not active.');
    }
    return definition;
  }

  private async resolveDefinitionByModel(modelId: string, tenantId: string) {
    const [definition] = await this.definitionService.listDefinitions({
      tenantId,
      status: 'active'
    }).then((definitions) => definitions
      .filter((item) => item.modelId === modelId)
      .sort((left, right) => right.version - left.version));
    if (!definition) {
      throw new BadRequestException(
        `Workflow model "${modelId}" must be published before it can run.`
      );
    }
    return definition;
  }

  private async findWorkflowJob(modelId: string, tenantId: string) {
    if (!this.persistence.isConfigured) {
      throw new BadRequestException(
        'Supabase service-role configuration is required for workflow job persistence.'
      );
    }
    const { data, error } = await this.persistence.client
      .from('wf_job')
      .select('id,name,status,trigger_task_id,payload')
      .eq('account_id', tenantId)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) throw new BadGatewayException(error.message);
    const row = (Array.isArray(data) ? data : []).find((candidate) => {
      if (!isRecord(candidate)) return false;
      const payload = readRecord(candidate.payload);
      const triggerWorkflow = readRecord(payload.triggerWorkflow);
      return readString(triggerWorkflow.modelId) === modelId;
    });
    if (!row) {
      throw new NotFoundException(
        `No published Trigger workflow job exists for model "${modelId}".`
      );
    }
    return {
      id: readString(row.id),
      name: readString(row.name),
      status: readString(row.status),
      triggerTaskId: readString(row.trigger_task_id),
      payload: readRecord(row.payload)
    };
  }

  private async command(functionName: string, action: string, payload: JsonRecord) {
    if (!this.persistence.isConfigured) {
      throw new BadRequestException(
        'Supabase service-role configuration is required for workflow runtime persistence.'
      );
    }
    const { data, error } = await this.persistence.client.rpc(functionName, {
      p_action: action,
      p_payload: payload
    });
    if (error) throw new BadGatewayException(error.message);
    return data;
  }

  private async failRun(runId: string, error: unknown) {
    try {
      await this.command(WORKFLOW_JOB_RPC, 'finish_run', {
        run_id: runId,
        status: 'failed',
        output: {},
        error_message: error instanceof Error ? error.message : String(error)
      });
    } catch {
      // Preserve the original error.
    }
  }

  private async failInstance(instanceId: string, error: unknown) {
    try {
      await this.command(WORKFLOW_RUNTIME_RPC, 'set_instance_status', {
        instance_id: instanceId,
        status: 'failed',
        payload: { message: error instanceof Error ? error.message : String(error) }
      });
    } catch {
      // Preserve the original error.
    }
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown) {
  return isRecord(value) ? value : {};
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeTriggerInvocationError(error: unknown) {
  if (error instanceof BadGatewayException || error instanceof BadRequestException || error instanceof NotFoundException) {
    return error;
  }
  const detail = error instanceof Error ? error.message.trim() : String(error).trim();
  const normalized = detail.toLowerCase();
  const isTransportError = [
    'connection error',
    'fetch failed',
    'econnrefused',
    'enotfound',
    'etimedout',
    'socket hang up'
  ].some((marker) => normalized.includes(marker));
  if (!isTransportError) return error;
  return new BadGatewayException(
    `Workflow runtime is unavailable. Start Trigger.dev and verify TRIGGER_API_URL${detail ? ` (${detail})` : ''}`
  );
}
