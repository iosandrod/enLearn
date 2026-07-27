import { Injectable } from '@nestjs/common';
import { runs, tasks, wait } from '@trigger.dev/sdk/v3';
import type {
  WorkflowInstanceTaskPayload,
  WorkflowTaskDecision,
  WorkflowTriggerClient
} from '../runtime/runtime.engine.types';
import {
  WORKFLOW_INSTANCE_TASK_ID
} from '../runtime/runtime.engine.types';
import type { workflowInstanceTask } from './workflow-instance.task';

@Injectable()
export class TriggerDevClient implements WorkflowTriggerClient {
  async triggerWorkflow(payload: WorkflowInstanceTaskPayload) {
    return tasks.trigger<typeof workflowInstanceTask>(
      WORKFLOW_INSTANCE_TASK_ID,
      payload,
      {
        idempotencyKey: `workflow-instance:${payload.instanceId}`,
        tags: [
          `tenant:${payload.tenantId}`,
          `workflow-instance:${payload.instanceId}`,
          `definition:${payload.definitionId}`
        ]
      }
    );
  }

  async triggerTask(
    taskId: string,
    payload: Record<string, unknown>,
    options: Record<string, unknown> = {}
  ) {
    return tasks.trigger(taskId, payload, options);
  }

  async createWaitpoint(options: { idempotencyKey: string; tags: string[] }) {
    return wait.createToken(options);
  }

  async completeWaitpoint(tokenId: string, decision: WorkflowTaskDecision) {
    await wait.completeToken(tokenId, decision);
  }

  async cancelRun(runId: string) {
    await runs.cancel(runId);
  }
}
