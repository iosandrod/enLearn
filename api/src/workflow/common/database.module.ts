import { Global, Module } from '@nestjs/common';
import { TriggerCredentialsService } from '../trigger/trigger-credentials.service';
import { WorkflowSupabaseService } from './workflow-supabase.service';

@Global()
@Module({
  providers: [WorkflowSupabaseService, TriggerCredentialsService],
  exports: [WorkflowSupabaseService, TriggerCredentialsService]
})
export class DatabaseModule {}

