import { Inject, Injectable } from '@nestjs/common';
import { defer } from 'rxjs';

import type {
  WorkflowApiEnvelope,
  WorkflowRequest
} from '../workflow/workflow.transport';
import { WorkflowRpcController } from '../workflow-service/workflow.rpc.controller';

@Injectable()
export class LocalWorkflowClient {
  constructor(
    @Inject(WorkflowRpcController)
    private readonly workflowRpc: WorkflowRpcController
  ) {}

  send<T = WorkflowApiEnvelope>(_pattern: string, request: WorkflowRequest) {
    return defer(() => this.workflowRpc.handleRequest(request)) as import('rxjs').Observable<T>;
  }
}
