import { Module } from '@nestjs/common';
import { TriggerDevClient } from '../trigger/trigger-dev.client';
import { JobController } from './job.controller';
import { JobService } from './job.service';

@Module({
  controllers: [JobController],
  providers: [TriggerDevClient, JobService],
  exports: [JobService]
})
export class JobModule {}
