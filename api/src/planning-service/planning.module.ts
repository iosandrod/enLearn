import { Module } from '@nestjs/common';
import { DatabaseModule } from '../workflow/common/database.module';
import { TriggerDevClient } from '../workflow/trigger/trigger-dev.client';
import { PlanningService } from './planning.service';

@Module({
  imports: [DatabaseModule],
  providers: [TriggerDevClient, PlanningService],
  exports: [PlanningService]
})
export class PlanningModule {}
