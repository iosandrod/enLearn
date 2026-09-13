import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { getEnv } from '../../common/utils/env';
import { RuntimeService } from './runtime.service';
import { WORKFLOW_RUNTIME_STORE, type WorkflowRuntimeStore } from './runtime.engine.types';
import { Inject } from '@nestjs/common';

/**
 * Coordinates restart recovery from the application lifecycle. Database lease
 * ownership is authoritative, so multiple API replicas may safely run this
 * worker when enabled.
 */
@Injectable()
export class WorkflowRecoveryWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly runtimeService: RuntimeService,
    @Inject(WORKFLOW_RUNTIME_STORE) private readonly store: WorkflowRuntimeStore
  ) {}

  async onModuleInit() {
    const env = getEnv();
    if (String(env.WORKFLOW_RECOVERY_ENABLED ?? '').toLowerCase() !== 'true') return;
    const intervalSeconds = positiveInteger(env.WORKFLOW_RECOVERY_INTERVAL_SECONDS, 30);
    await this.scan();
    this.timer = setInterval(() => void this.scan(), intervalSeconds * 1000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async scan() {
    if (this.running) return { skipped: true };
    this.running = true;
    try {
      const env = getEnv();
      const batchSize = positiveInteger(env.WORKFLOW_RECOVERY_BATCH_SIZE, 100);
      const leaseSeconds = positiveInteger(env.WORKFLOW_RECOVERY_LEASE_SECONDS, 120);
      const candidates = (await this.store.listInstances({ status: 'running' }))
        .filter((instance) => !instance.triggerRunId)
        .slice(0, batchSize);
      const recovered: string[] = [];
      const skipped: string[] = [];
      const failed: Array<{ instanceId: string; error: string }> = [];

      for (const instance of candidates) {
        if (this.store.claimRecoveryCandidate && !(await this.store.claimRecoveryCandidate({ instanceId: instance.id, leaseSeconds }))) {
          skipped.push(instance.id);
          continue;
        }
        try {
          const result = await this.runtimeService.recoverOrphanedInstances(instance.tenantId, instance.id);
          if (result.recovered.includes(instance.id)) recovered.push(instance.id);
          else if (result.failed.some((item) => item.instanceId === instance.id)) {
            const failure = result.failed.find((item) => item.instanceId === instance.id)!;
            failed.push(failure);
          } else skipped.push(instance.id);
          await this.store.releaseRecoveryLease?.(instance.id, recovered.includes(instance.id), failed.find((item) => item.instanceId === instance.id)?.error);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failed.push({ instanceId: instance.id, error: message });
          await this.store.releaseRecoveryLease?.(instance.id, false, message);
        }
      }
      return { recovered, skipped, failed };
    } finally {
      this.running = false;
    }
  }
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
