import { Module } from '@nestjs/common';
import { TriggerDevClient } from '../trigger/trigger-dev.client';
import { JobService } from './job.service';

@Module({
  providers: [TriggerDevClient, JobService],
  exports: [JobService]
})
export class JobModule {}
