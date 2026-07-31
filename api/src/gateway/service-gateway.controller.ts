import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Inject,
  Logger,
  Post,
  UnauthorizedException
} from '@nestjs/common';
import { ServiceInvokeDto } from '../common/dto/service-invoke.dto';
import { ServiceRouterService } from './service-router.service';

type NormalizedServiceInvoke = {
  serviceName:
    | 'account'
    | 'payment'
    | 'user'
    | 'lowcode'
    | 'admin'
    | 'posts'
    | 'notification'
    | 'workflow'
    | 'entityDesign'
    | 'files'
    | 'chat';
  serviceMethod: string;
  postData: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeBody(body: ServiceInvokeDto): NormalizedServiceInvoke {
  if (!isRecord(body)) {
    throw new BadRequestException('Request body must be an object.');
  }

  const serviceName =
    typeof body.serviceName === 'string' ? body.serviceName.trim() : '';
  if (
    serviceName !== 'account' &&
    serviceName !== 'payment' &&
    serviceName !== 'user' &&
    serviceName !== 'lowcode' &&
    serviceName !== 'admin' &&
    serviceName !== 'posts' &&
    serviceName !== 'notification' &&
    serviceName !== 'workflow' &&
    serviceName !== 'entityDesign' &&
    serviceName !== 'files' &&
    serviceName !== 'chat'
  ) {
    throw new BadRequestException(
      'serviceName must be either "account", "payment", "user", "lowcode", "admin", "posts", "notification", "workflow", "entityDesign", "files", or "chat".'
    );
  }

  const serviceMethod =
    typeof body.serviceMethod === 'string' ? body.serviceMethod.trim() : '';
  if (!serviceMethod) {
    throw new BadRequestException('serviceMethod is required.');
  }

  const postData = body.postData ?? {};
  if (!isRecord(postData)) {
    throw new BadRequestException('postData must be an object.');
  }

  return { serviceName, serviceMethod, postData };
}

function stringifyErrorMessage(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(stringifyErrorMessage).filter(Boolean).join(' ');

  if (isRecord(value)) {
    return [
      stringifyErrorMessage(value.message),
      stringifyErrorMessage(value.error),
      stringifyErrorMessage(value.statusMessage)
    ]
      .filter(Boolean)
      .join(' ');
  }

  return '';
}

function readErrorMessage(error: unknown) {
  const response =
    isRecord(error) && typeof error.getResponse === 'function'
      ? error.getResponse()
      : undefined;

  return [
    error instanceof Error ? error.message : '',
    stringifyErrorMessage(response)
  ]
    .filter(Boolean)
    .join(' ');
}

function isAuthTokenError(error: unknown) {
  const message = readErrorMessage(error).toLowerCase();
  return (
    message.includes('jwt expired') ||
    message.includes('invalid jwt') ||
    message.includes('invalid token') ||
    message.includes('authentication required')
  );
}

@Controller()
export class ServiceGatewayController {
  private readonly logger = new Logger(ServiceGatewayController.name);

  constructor(
    @Inject(ServiceRouterService)
    private readonly router: ServiceRouterService
  ) {}

  @Post('service')
  async service(
    @Body() body: ServiceInvokeDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-request-id') requestId?: string
  ) {
    const { serviceName, serviceMethod, postData } = normalizeBody(body);
    const serviceLabel = `${serviceName}.${serviceMethod}`;
    const startedAt = Date.now();
    const accessToken =
      typeof postData.accessToken === 'string' ? postData.accessToken : undefined;
    const contextAuthorization = authorization ?? (accessToken ? `Bearer ${accessToken}` : undefined);

    let data: unknown;
    try {
      data = await this.router.invoke(
        serviceName,
        serviceMethod,
        postData,
        {
          authorization: contextAuthorization,
          requestId
        }
      );
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const requestIdSuffix = requestId
        ? ` requestId=${requestId}`
        : '';
      this.logger.warn(
        `[service] ${serviceLabel} failed ${elapsedMs}ms${requestIdSuffix}: ${
          readErrorMessage(error) || 'Unknown error'
        }`
      );

      if (isAuthTokenError(error)) {
        throw new UnauthorizedException('Authentication required.');
      }

      throw error;
    }

    const elapsedMs = Date.now() - startedAt;
    const requestIdSuffix = requestId
      ? ` requestId=${requestId}`
      : '';
    this.logger.log(`[service] ${serviceLabel} ok ${elapsedMs}ms${requestIdSuffix}`);

    return {
      success: true,
      serviceName,
      serviceMethod,
      data
    };
  }
}
