import { Injectable } from '@nestjs/common';
import { runs, tasks, wait } from '@trigger.dev/sdk';
import type {
  WorkflowInstanceTaskPayload,
  WorkflowTaskDecision,
  WorkflowTriggerClient
} from '../runtime/runtime.engine.types';
import {
  WORKFLOW_INSTANCE_TASK_ID
} from '../runtime/runtime.engine.types';
import type { workflowInstanceTask } from './workflow-instance.task';
import { assertTriggerEngineConfigured } from './trigger-engine.config';

@Injectable()
export class TriggerDevClient implements WorkflowTriggerClient {
  async triggerWorkflow(payload: WorkflowInstanceTaskPayload) {
    this.assertTriggerDevConfigured();

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
    this.assertTriggerDevConfigured();
    return tasks.trigger(taskId, payload, options);
  }

  async createWaitpoint(options: { idempotencyKey: string; tags: string[] }) {
    this.assertTriggerDevConfigured();
    return wait.createToken(options);
  }

  async completeWaitpoint(tokenId: string, decision: WorkflowTaskDecision) {
    this.assertTriggerDevConfigured();
    await this.completeTriggerWaitpoint(tokenId, decision);
  }

  async cancelRun(runId: string) {
    this.assertTriggerDevConfigured();
    await runs.cancel(runId);
  }

  private assertTriggerDevConfigured() {
    assertTriggerEngineConfigured();
  }

  private async completeTriggerWaitpoint(tokenId: string, decision: WorkflowTaskDecision) {
    try {
      const token = await wait.retrieveToken<WorkflowTaskDecision>(tokenId);
      const response = await fetch(token.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(decision)
      });

      if (!response.ok) {
        throw new Error(`Trigger.dev waitpoint callback failed with HTTP ${response.status}.`);
      }
      return;
    } catch {
      await wait.completeToken(tokenId, decision);
    }
  }
}
