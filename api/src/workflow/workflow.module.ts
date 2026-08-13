import { Module } from '@nestjs/common';

import { DatabaseModule } from './common/database.module';
import { DefinitionModule } from './definition/definition.module';
import { JobModule } from './job/job.module';
import { RuntimeModule } from './runtime/runtime.module';
import { WorkflowService } from './workflow.service';
import { FrontendCommandModule } from '../frontend-command/frontend-command.module';

@Module({
  imports: [DatabaseModule, DefinitionModule, RuntimeModule, JobModule, FrontendCommandModule],
  providers: [WorkflowService],
  exports: [WorkflowService]
})
export class WorkflowModule {}
