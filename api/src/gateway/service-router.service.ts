import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  Inject,
  Injectable
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, TimeoutError } from 'rxjs';

import { WorkflowService } from '../workflow/workflow.service';
import {
  DOMAIN_SERVICE_CLIENT,
  isDomainServiceName,
  parseIndependentServiceNames,
  resolveServiceExecutePattern,
  type ServiceBusResponse
} from '../common/service-bus';
import type { ServiceContext } from '../common/interfaces/service-executor';
import { getEnv } from '../common/utils/env';

const DOMAIN_SERVICE_TIMEOUT_MS = 20_000;

@Injectable()
export class ServiceRouterService {
  private readonly independentServices = parseIndependentServiceNames(
    getEnv().INDEPENDENT_SERVICES ?? getEnv().API_INDEPENDENT_SERVICES
  );

  constructor(
    @Inject(DOMAIN_SERVICE_CLIENT)
    private readonly domainClient: ClientProxy,
    @Inject(WorkflowService)
    private readonly workflowService: WorkflowService
  ) {}

  async invoke(
    serviceName: string,
    serviceMethod: string,
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    if (serviceName === 'workflow') {
      return this.workflowService.execute(serviceMethod, postData, {
        ...context,
        serviceName
      });
    }

    if (!isDomainServiceName(serviceName)) {
      throw new BadRequestException(`Unsupported serviceName: ${serviceName}`);
    }

    const pattern = resolveServiceExecutePattern(serviceName, this.independentServices);

    const response = await firstValueFrom(
      this.domainClient
        .send<ServiceBusResponse>(pattern, {
          serviceName,
          serviceMethod,
          postData,
          context: {
            ...context,
            serviceName
          }
        })
        .pipe(timeout(DOMAIN_SERVICE_TIMEOUT_MS))
    ).catch((error: unknown) => {
      if (error instanceof TimeoutError) {
        throw new GatewayTimeoutException(
          `Domain service did not respond within ${DOMAIN_SERVICE_TIMEOUT_MS}ms.`
        );
      }

      throw new BadGatewayException(
        error instanceof Error && error.message
          ? error.message
          : 'Domain service request failed.'
      );
    });

    if (!response || response.success === false) {
      const message = response?.error?.message ?? 'Domain service request failed.';
      const statusCode = response?.error?.statusCode;
      if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
        throw new HttpException(message, statusCode);
      }
      throw new BadGatewayException(message);
    }

    return response.data;
  }
}
