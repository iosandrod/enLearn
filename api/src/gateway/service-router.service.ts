import {
  BadGatewayException,
  GatewayTimeoutException,
  Inject,
  Injectable
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, TimeoutError } from 'rxjs';

import { WorkflowService } from '../workflow/workflow.service';
import {
  DOMAIN_SERVICE_CLIENT,
  SERVICE_EXECUTE_PATTERN,
  type ServiceBusResponse
} from '../common/service-bus';
import type { ServiceContext } from '../common/interfaces/service-executor';

const DOMAIN_SERVICE_TIMEOUT_MS = 20_000;

@Injectable()
export class ServiceRouterService {
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
      return this.workflowService.execute(serviceMethod, postData, context);
    }

    const response = await firstValueFrom(
      this.domainClient
        .send<ServiceBusResponse>(SERVICE_EXECUTE_PATTERN, {
          serviceName,
          serviceMethod,
          postData,
          context
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
      throw new BadGatewayException(
        response?.error?.message ?? 'Domain service request failed.'
      );
    }

    return response.data;
  }
}
