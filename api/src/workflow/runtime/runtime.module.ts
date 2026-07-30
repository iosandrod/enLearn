import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { DefinitionModule } from '../definition/definition.module';
import { TriggerDevClient } from '../trigger/trigger-dev.client';
import { RuntimeController } from './runtime.controller';
import { WORKFLOW_RUNTIME_STORE } from './runtime.engine.types';
import { PostgresWorkflowRuntimeStore } from './runtime.postgres-store';
import { RuntimeService } from './runtime.service';

@Module({
  imports: [DefinitionModule],
  controllers: [RuntimeController],
  providers: [
    TriggerDevClient,
    {
      provide: WORKFLOW_RUNTIME_STORE,
      useFactory: (database: DatabaseService) => new PostgresWorkflowRuntimeStore(database),
      inject: [DatabaseService]
    },
    RuntimeService
  ],
  exports: [RuntimeService]
})
export class RuntimeModule {}
