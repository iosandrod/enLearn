import { Inject, Injectable } from '@nestjs/common';

import type { ServiceContext } from '../common/interfaces/service-executor';
import { DomainServiceRouter } from '../domain-service/service-router.service';
import { WorkflowService } from '../workflow/workflow.service';

@Injectable()
export class StandaloneServiceRouter {
  constructor(
    @Inject(DomainServiceRouter)
    private readonly domainRouter: DomainServiceRouter,
    @Inject(WorkflowService)
    private readonly workflowService: WorkflowService
  ) {}

  invoke(
    serviceName: string,
    serviceMethod: string,
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    if (serviceName === 'workflow') {
      return this.workflowService.execute(serviceMethod, postData, context);
    }

    return this.domainRouter.invoke(serviceName, serviceMethod, postData, context);
  }
}
