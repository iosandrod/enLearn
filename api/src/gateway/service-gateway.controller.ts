import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Inject,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException
} from '@nestjs/common';
import { ServiceInvokeDto } from '../common/dto/service-invoke.dto';
import { isPublicServiceName, type PublicServiceName } from '../common/service-bus';
import type { ServiceContext } from '../common/interfaces/service-executor';
import { ServiceRouterService } from './service-router.service';
import { requireActiveAccount } from '../common/utils/account-context';
import {
  executeDurableIdempotentServiceWrite,
  isIdempotentServiceWrite
} from '../common/request-idempotency';

type NormalizedServiceInvoke = {
  serviceName: PublicServiceName;
  serviceMethod: string;
  postData: Record<string, unknown>;
};

const DEFAULT_ANONYMOUS_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const ANONYMOUS_OPTION_ITEMS_METHODS = new Set([
  'resolveOptionItemsBatch',
  'listOptionItemsBatch',
  'listDropdownOptionsBatch'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeBody(body: ServiceInvokeDto): NormalizedServiceInvoke {
  if (!isRecord(body)) {
    throw new BadRequestException('Request body must be an object.');
  }

  const serviceName =
    typeof body.serviceName === 'string' ? body.serviceName.trim() : '';
  if (!isPublicServiceName(serviceName)) {
    throw new BadRequestException(
      'serviceName must be either "account", "payment", "user", "lowcode", "admin", "posts", "notification", "workflow", "entityDesign", "files", "chat", "planning", or "mes".'
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
  @HttpCode(200)
  async service(
    @Body() body: ServiceInvokeDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-request-id') requestId?: string,
    @Headers('x-account-id') accountId?: string
  ) {
    // 校验并标准化统一服务调用协议：serviceName、serviceMethod、postData。
    const { serviceName, serviceMethod, postData } = normalizeBody(body);
    const serviceLabel = `${serviceName}.${serviceMethod}`;
    const startedAt = Date.now();
    // 优先使用请求头中的 JWT；兼容旧调用方时才从 postData.accessToken 中读取。
    const accessToken =
      typeof postData.accessToken === 'string' ? postData.accessToken : undefined;
    const contextAuthorization = authorization ?? (accessToken ? `Bearer ${accessToken}` : undefined);
    const allowAnonymousLowCodeRead =
      serviceName === 'lowcode' && serviceMethod === 'listItems' &&
      !contextAuthorization && !accountId;
    const allowAnonymousOptionItemsRead =
      serviceName === 'admin' && ANONYMOUS_OPTION_ITEMS_METHODS.has(serviceMethod) &&
      !contextAuthorization && !accountId;

    let data: unknown;
    try {
      // 除公开的低代码和选项读取外，验证用户、账套成员关系和账套状态。
      const resolvedContext: ServiceContext = allowAnonymousLowCodeRead || allowAnonymousOptionItemsRead
        ? {
            authorization: contextAuthorization,
            requestId,
            serviceName,
            accountId: DEFAULT_ANONYMOUS_ACCOUNT_ID
          }
        : (await requireActiveAccount(
            { authorization: contextAuthorization, requestId, serviceName },
            accountId
          )).context;
      // 将业务参数与可信上下文交给路由器，由其分发至 workflow 或对应领域服务。
      const invoke = () => this.router.invoke(
          serviceName,
          serviceMethod,
          postData,
          resolvedContext
        );
      // 对带请求 ID 的写操作执行持久化幂等控制，防止网络重试造成重复写入。
      data = requestId && resolvedContext.userId && resolvedContext.accountId &&
        isIdempotentServiceWrite(serviceMethod, postData)
        ? await executeDurableIdempotentServiceWrite(
            {
              userId: resolvedContext.userId,
              accountId: resolvedContext.accountId,
              requestId
            },
            { serviceName, serviceMethod, postData },
            invoke
          )
        : await invoke();
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const requestIdSuffix = requestId
        ? ` requestId=${requestId}`
        : '';
      // 统一记录失败日志，便于按服务方法、耗时和请求 ID 排查问题。
      this.logger.warn(
        `[service] ${serviceLabel} failed ${elapsedMs}ms${requestIdSuffix}: ${
          readErrorMessage(error) || 'Unknown error'
        }`
      );

      // 将 JWT 相关的底层错误统一转换为 401，避免泄露认证实现细节。
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

    // 统一包装成功响应，保留实际调用的服务与方法，便于调用方识别结果来源。
    return {
      success: true,
      serviceName,
      serviceMethod,
      data
    };
  }
}
