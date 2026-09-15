import { Module } from '@nestjs/common';
import { DefinitionModule } from '../definition/definition.module';
import { TriggerDevClient } from '../trigger/trigger-dev.client';
import { JobService } from './job.service';
import { WorkflowStartService } from '../runtime/workflow-start.service';

@Module({
  imports: [DefinitionModule],
  providers: [TriggerDevClient, WorkflowStartService, JobService],
  exports: [JobService, WorkflowStartService]
})
export class JobModule {}
