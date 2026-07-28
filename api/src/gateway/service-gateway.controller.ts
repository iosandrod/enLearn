import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Inject,
  Post
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
    | 'entityDesign';
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
    serviceName !== 'entityDesign'
  ) {
    throw new BadRequestException(
      'serviceName must be either "account", "payment", "user", "lowcode", "admin", "posts", "notification", "workflow", or "entityDesign".'
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

@Controller()
export class ServiceGatewayController {
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
    const accessToken =
      typeof postData.accessToken === 'string' ? postData.accessToken : undefined;
    const contextAuthorization = authorization ?? (accessToken ? `Bearer ${accessToken}` : undefined);

    const data = await this.router.invoke(
      serviceName,
      serviceMethod,
      postData,
      {
        authorization: contextAuthorization,
        requestId
      }
    );

    return {
      success: true,
      serviceName,
      serviceMethod,
      data
    };
  }
}
