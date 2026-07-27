import { Module } from '@nestjs/common';
import { DatabaseModule } from './common/database.module';
import { DefinitionModule } from './definition/definition.module';
import { HealthModule } from './health/health.module';
import { HistoryModule } from './history/history.module';
import { IntegrationModule } from './integration/integration.module';
import { JobModule } from './job/job.module';
import { RuleModule } from './rule/rule.module';
import { RuntimeModule } from './runtime/runtime.module';
import { TaskModule } from './task/task.module';

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
  ]
})
export class AppModule {}
