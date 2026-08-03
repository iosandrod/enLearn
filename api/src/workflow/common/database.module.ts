import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { TriggerCredentialsService } from '../trigger/trigger-credentials.service';

@Global()
@Module({
  providers: [DatabaseService, TriggerCredentialsService],
  exports: [DatabaseService, TriggerCredentialsService]
})
export class DatabaseModule {}

