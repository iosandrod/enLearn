import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import {
  SERVICE_EXECUTE_PATTERN,
  type ServiceBusRequest,
  type ServiceBusResponse
} from '../common/service-bus';
import { DomainServiceRouter } from './service-router.service';

function readErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return 'Service request failed.';
}

@Controller()
export class ServiceRpcController {
  constructor(private readonly router: DomainServiceRouter) {}

  @MessagePattern(SERVICE_EXECUTE_PATTERN)
  async execute(@Payload() request: ServiceBusRequest): Promise<ServiceBusResponse> {
    try {
      return {
        success: true,
        data: await this.router.invoke(
          request.serviceName,
          request.serviceMethod,
          request.postData,
          request.context
        )
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: readErrorMessage(error)
        }
      };
    }
  }
}
