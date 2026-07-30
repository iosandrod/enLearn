import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { getWorkflowEnv } from '../common/env';
import { DatabaseService } from '../common/database.service';
import { JobService } from './job.service';

function isMissingWorkflowJobTableError(error: unknown) {
  const databaseError = error as { code?: string; message?: string };
  return (
    databaseError.code === '42P01' &&
    typeof databaseError.message === 'string' &&
    (databaseError.message.includes('wf_job') || databaseError.message.includes('wf_job_run'))
  );
}

@Injectable()
export class JobSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobSchedulerService.name);
  private readonly inFlightJobIds = new Set<string>();
  private timer?: NodeJS.Timeout;
  private isTicking = false;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(JobService) private readonly jobService: JobService
  ) {}

  onModuleInit() {
    const env = getWorkflowEnv();
    if (env.WORKFLOW_INTERVAL_SCHEDULER_ENABLED === 'false') {
      this.logger.log('Workflow interval scheduler disabled.');
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, 1_000);
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (!this.database.isConfigured) return;
    if (this.isTicking) return;

    try {
      this.isTicking = true;
      const dueJobs = await this.findDueIntervalJobs();
      for (const job of dueJobs) {
        if (this.inFlightJobIds.has(job.id)) continue;
        this.inFlightJobIds.add(job.id);
        void this.jobService
          .runJob(
            job.id,
            {
              payload: {
                scheduled: true,
                scheduledAt: new Date().toISOString()
              }
            },
            {
              tenantId: job.tenantId,
              ...(job.createdBy ? { userId: job.createdBy } : {})
            }
          )
          .catch((error) => {
            this.logger.error(
              `Failed to run interval job ${job.code}: ${error instanceof Error ? error.message : String(error)}`
            );
          })
          .finally(() => this.inFlightJobIds.delete(job.id));
      }
    } catch (error) {
      if (isMissingWorkflowJobTableError(error)) return;

      this.logger.error(
        `Workflow interval scheduler tick failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.isTicking = false;
    }
  }

  private async findDueIntervalJobs() {
    const result = await this.database.query<{
      id: string;
      tenant_id: string;
      code: string;
      created_by: string | null;
    }>(
      `select job.id, job.tenant_id, job.code, job.created_by
      from public.wf_job job
      where job.type = 'interval'
        and job.status = 'enabled'
        and greatest(coalesce(nullif(job.payload->>'intervalSeconds', '')::integer, 60), 1) > 0
        and not exists (
          select 1
          from public.wf_job_run run
          where run.job_id = job.id
            and run.created_at > timezone('utc'::text, now())
              - greatest(coalesce(nullif(job.payload->>'intervalSeconds', '')::integer, 60), 1) * interval '1 second'
        )
      order by job.updated_at asc
      limit 20`
    );

    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      code: row.code,
      ...(row.created_by ? { createdBy: row.created_by } : {})
    }));
  }
}
