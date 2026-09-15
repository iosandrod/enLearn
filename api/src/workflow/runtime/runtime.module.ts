import { Module } from '@nestjs/common';
import { WorkflowSupabaseService } from '../common/workflow-supabase.service';
import { DefinitionModule } from '../definition/definition.module';
import { TriggerDevClient } from '../trigger/trigger-dev.client';
import {
  createTriggerRuntimeStatusOperations,
  TRIGGER_RUNTIME_STATUS_OPERATIONS,
  TRIGGER_RUNTIME_STATUS_RUNTIME_SERVICE,
  TriggerRuntimeStatusService
} from '../trigger/trigger-runtime-status.service';
import { ApprovalConsoleService } from './approval-console.service';
import { TASK_CONSOLE_JOB_SERVICE, TaskConsoleService } from './task-console.service';
import { JobModule } from '../job/job.module';
import { JobService } from '../job/job.service';
import { WORKFLOW_RUNTIME_STORE } from './runtime.engine.types';
import { SupabaseWorkflowRuntimeStore } from './runtime.supabase-store';
import { RuntimeService } from './runtime.service';

@Module({
  imports: [DefinitionModule, JobModule],
  providers: [
    TriggerDevClient,
    {
      provide: WORKFLOW_RUNTIME_STORE,
      useFactory: (persistence: WorkflowSupabaseService) =>
        new SupabaseWorkflowRuntimeStore(persistence),
      inject: [WorkflowSupabaseService]
    },
    RuntimeService,
    ApprovalConsoleService,
    {
      provide: TASK_CONSOLE_JOB_SERVICE,
      useExisting: JobService
    },
    TaskConsoleService,
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
  exports: [RuntimeService, ApprovalConsoleService, TaskConsoleService, TriggerRuntimeStatusService]
})
export class RuntimeModule {}
