import { Module } from '@nestjs/common';

import { DatabaseModule } from '../workflow/common/database.module';
import { DefinitionModule } from '../workflow/definition/definition.module';
import { HealthModule } from '../workflow/health/health.module';
import { HistoryModule } from '../workflow/history/history.module';
import { IntegrationModule } from '../workflow/integration/integration.module';
import { JobModule } from '../workflow/job/job.module';
import { RuleModule } from '../workflow/rule/rule.module';
import { RuntimeModule } from '../workflow/runtime/runtime.module';
import { TaskModule } from '../workflow/task/task.module';
import { WorkflowRpcController } from './workflow.rpc.controller';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    DefinitionModule,
    RuntimeModule,
    TaskModule,
    HistoryModule,
    RuleModule,
    JobModule,
    IntegrationModule
  ],
  controllers: [WorkflowRpcController]
})
export class AppModule {}
