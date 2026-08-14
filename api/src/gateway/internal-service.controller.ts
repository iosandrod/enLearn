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
import { ServiceRouterService } from './service-router.service';

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
    const expectedKey = String(getEnv().SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
    if (!expectedKey || !constantTimeEqual(internalKey ?? '', expectedKey)) {
      throw new ForbiddenException('Invalid workflow internal service key.');
    }

    const serviceName = readString(body.serviceName);
    const serviceMethod = readString(body.serviceMethod);
    if (!isPublicServiceName(serviceName) || !serviceMethod) {
      throw new ForbiddenException('Invalid internal service request.');
    }
    const context = isRecord(body.context) ? body.context as ServiceContext : {};
    if (!readString(context.accountId) || !readString(context.userId)) {
      throw new ForbiddenException('Internal workflow service context is incomplete.');
    }

    return {
      success: true,
      data: await this.router.invoke(
        serviceName,
        serviceMethod,
        isRecord(body.postData) ? body.postData : {},
        context
      )
    };
  }
}

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
