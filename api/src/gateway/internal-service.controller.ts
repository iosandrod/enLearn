import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Inject,
  Post
} from '@nestjs/common';
import type { ServiceContext } from '../common/interfaces/service-executor';
import { isPublicServiceName } from '../common/service-bus';
import { getEnv } from '../common/utils/env';
import {
  WORKFLOW_INTERNAL_PRINCIPAL,
  assertWorkflowInternalServiceRequest
} from '../common/workflow-internal-capabilities';
import { ServiceRouterService } from './service-router.service';
import { createSupabaseClient } from '../common/utils/supabase';

type InternalServiceBody = {
  serviceName?: unknown;
  serviceMethod?: unknown;
  postData?: unknown;
  context?: unknown;
};

@Controller('internal')
export class InternalServiceController {
  constructor(
    @Inject(ServiceRouterService)
    private readonly router: ServiceRouterService
  ) {}

  @Post('service')
  async service(
    @Body() body: InternalServiceBody,
    @Headers('x-workflow-internal-key') internalKey?: string
  ) {
    const expectedKey = String(getEnv().WORKFLOW_INTERNAL_KEY ?? '').trim();
    if (!expectedKey || !constantTimeEqual(internalKey ?? '', expectedKey)) {
      throw new ForbiddenException('Invalid workflow internal service key.');
    }

    const serviceName = readString(body.serviceName);
    const serviceMethod = readString(body.serviceMethod);
    if (!isPublicServiceName(serviceName) || !serviceMethod) {
      throw new ForbiddenException('Invalid internal service request.');
    }
    const postData = isRecord(body.postData) ? body.postData : {};
    const capability = assertWorkflowInternalServiceRequest(
      serviceName,
      serviceMethod,
      postData
    );
    const suppliedContext = isRecord(body.context) ? body.context : {};
    const accountId = readString(suppliedContext.accountId);
    const userId = readString(suppliedContext.userId);
    const requestId = readString(suppliedContext.requestId);
    if (!accountId) {
      throw new ForbiddenException('Internal workflow service context is incomplete.');
    }
    const context: ServiceContext = {
      accountId,
      ...(userId ? { userId } : {}),
      ...(requestId ? { requestId } : {}),
      internal: {
        principal: WORKFLOW_INTERNAL_PRINCIPAL,
        capability
      }
    };

    return {
      success: true,
      data: await this.router.invoke(
        serviceName,
        serviceMethod,
        postData,
        context
      )
    };
  }

  @Post('workflow-command')
  async workflowCommand(
    @Body() body: InternalWorkflowCommandBody,
    @Headers('x-workflow-internal-key') internalKey?: string
  ) {
    this.assertInternalKey(internalKey);
    const accountId = readString(isRecord(body.context) ? body.context.accountId : undefined);
    const commandCode = readString(body.commandCode);
    if (!accountId || !isUuid(accountId) || !commandCode) {
      throw new ForbiddenException('Workflow command context is incomplete.');
    }
    const registry = createSupabaseClient('admin');
    const { data: task, error: taskError } = await registry
      .from('wf_task_registry')
      .select('service_name, command_code, task_type')
      .eq('command_code', commandCode)
      .eq('task_type', 'backendCommand')
      .eq('status', 'enabled')
      .or(`account_id.eq.${accountId},account_id.is.null`)
      .order('account_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (taskError) {
      throw new ForbiddenException(`Unable to load workflow task registry: ${taskError.message}`);
    }
    const command = task;
    if (!command) throw new ForbiddenException(`Registered workflow command not found: ${commandCode}`);
    const suppliedContext = isRecord(body.context) ? body.context : {};
    return {
      success: true,
      data: await this.router.invokeRegisteredCommand(
        String(command.service_name),
        String(command.command_code),
        isRecord(body.postData) ? body.postData : {},
        {
          accountId,
          ...(readString(suppliedContext.userId) ? { userId: readString(suppliedContext.userId) } : {}),
          ...(readString(suppliedContext.requestId) ? { requestId: readString(suppliedContext.requestId) } : {}),
          internal: { principal: WORKFLOW_INTERNAL_PRINCIPAL, capability: 'workflow.registered-command' }
        }
      )
    };
  }

  private assertInternalKey(internalKey?: string) {
    const expectedKey = String(getEnv().WORKFLOW_INTERNAL_KEY ?? '').trim();
    if (!expectedKey || !constantTimeEqual(internalKey ?? '', expectedKey)) {
      throw new ForbiddenException('Invalid workflow internal service key.');
    }
  }
}

type InternalWorkflowCommandBody = {
  commandCode?: unknown;
  postData?: unknown;
  context?: unknown;
};

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
