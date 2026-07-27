import { Module } from '@nestjs/common';
import { TriggerDevClient } from '../trigger/trigger-dev.client';
import { JobController } from './job.controller';
import { JobLocalExecutorService } from './job-local-executor.service';
import { JobSchedulerService } from './job-scheduler.service';
import { JobService } from './job.service';

@Module({
  controllers: [JobController],
  providers: [TriggerDevClient, JobLocalExecutorService, JobService, JobSchedulerService],
  exports: [JobService]
})
export class JobModule {}
