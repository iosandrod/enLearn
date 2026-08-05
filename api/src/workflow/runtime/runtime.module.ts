import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { DefinitionModule } from '../definition/definition.module';
import { TriggerDevClient } from '../trigger/trigger-dev.client';
import {
  createTriggerRuntimeStatusOperations,
  TRIGGER_RUNTIME_STATUS_OPERATIONS,
  TRIGGER_RUNTIME_STATUS_RUNTIME_SERVICE,
  TriggerRuntimeStatusService
} from '../trigger/trigger-runtime-status.service';
import { ApprovalConsoleService } from './approval-console.service';
import { WORKFLOW_RUNTIME_STORE } from './runtime.engine.types';
import { PostgresWorkflowRuntimeStore } from './runtime.postgres-store';
import { RuntimeService } from './runtime.service';

@Module({
  imports: [DefinitionModule],
  providers: [
    TriggerDevClient,
    {
      provide: WORKFLOW_RUNTIME_STORE,
      useFactory: (database: DatabaseService) => new PostgresWorkflowRuntimeStore(database),
      inject: [DatabaseService]
    },
    RuntimeService,
    ApprovalConsoleService,
    {
      provide: TRIGGER_RUNTIME_STATUS_RUNTIME_SERVICE,
      useExisting: RuntimeService
    },
    {
      provide: TRIGGER_RUNTIME_STATUS_OPERATIONS,
      useFactory: createTriggerRuntimeStatusOperations
    },
    TriggerRuntimeStatusService
  ],
  exports: [RuntimeService, ApprovalConsoleService, TriggerRuntimeStatusService]
})
export class RuntimeModule {}
