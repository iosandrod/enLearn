import { Injectable, type Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { ServiceContext } from '../common/interfaces/service-executor';
import { ServiceRouterService } from '../gateway/service-router.service';
import { StandaloneServiceRouter } from '../standalone/standalone-service-router.service';

export const AI_SERVICE_ROUTER = Symbol('AI_SERVICE_ROUTER');

export interface AiServiceRouter {
  invoke(
    serviceName: string,
    serviceMethod: string,
    postData: Record<string, unknown>,
    context: ServiceContext
  ): Promise<unknown>;
}

@Injectable()
export class LazyAiServiceRouter implements AiServiceRouter {
  private router?: AiServiceRouter;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly routerType: Type<AiServiceRouter>
  ) {}

  invoke(
    serviceName: string,
    serviceMethod: string,
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    this.router ??= this.moduleRef.get(this.routerType, { strict: false });
    return this.router.invoke(serviceName, serviceMethod, postData, context);
  }
}

export function resolveAiRouterType(mode: 'gateway' | 'standalone') {
  return mode === 'standalone' ? StandaloneServiceRouter : ServiceRouterService;
}

