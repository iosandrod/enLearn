import {
  BadRequestException,
  Controller,
  Inject,
  type Type
} from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import type { ServiceExecutor } from './interfaces/service-executor';
import { readHttpErrorStatus } from './utils/http-error';
import {
  getServiceExecutePattern,
  type DomainServiceName,
  type ServiceBusRequest,
  type ServiceBusResponse
} from './service-bus';

type ServiceConstructor<T extends ServiceExecutor> = Type<T>;

function readErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return fallback;
}

export function createServiceRpcController<T extends ServiceExecutor>(
  serviceName: DomainServiceName,
  serviceProvider: ServiceConstructor<T>
) {
  @Controller()
  class ServiceRpcController {
    constructor(
      @Inject(serviceProvider)
      private readonly service: T
    ) {}

    @MessagePattern(getServiceExecutePattern(serviceName))
    async execute(@Payload() request: ServiceBusRequest): Promise<ServiceBusResponse> {
      try {
        if (request.serviceName !== serviceName) {
          throw new BadRequestException(
            `Service request for ${request.serviceName} reached ${serviceName}-service.`
          );
        }

        return {
          success: true,
          data: await this.service.execute(
            request.serviceMethod,
            request.postData,
            {
              ...request.context,
              serviceName
            }
          )
        };
      } catch (error) {
        return {
          success: false,
          error: {
            message: readErrorMessage(error, `${serviceName} service request failed.`),
            statusCode: readHttpErrorStatus(error)
          }
        };
      }
    }
  }

  Object.defineProperty(ServiceRpcController, 'name', {
    value: `${serviceName[0].toUpperCase()}${serviceName.slice(1)}RpcController`
  });

  return ServiceRpcController;
}
