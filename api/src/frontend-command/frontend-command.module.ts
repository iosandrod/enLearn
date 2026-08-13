import { Module } from '@nestjs/common';
import { DatabaseModule } from '../workflow/common/database.module';
import { TriggerDevClient } from '../workflow/trigger/trigger-dev.client';
import { FrontendCommandService } from './frontend-command.service';

@Module({
  imports: [DatabaseModule],
  providers: [TriggerDevClient, FrontendCommandService],
  exports: [FrontendCommandService]
})
export class FrontendCommandModule {}
