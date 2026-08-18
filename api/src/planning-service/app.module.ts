import { Module } from '@nestjs/common';
import { createServiceRpcController } from '../common/service-rpc.controller';
import { PlanningModule } from './planning.module';
import { PlanningService } from './planning.service';

const PlanningRpcController = createServiceRpcController('planning', PlanningService);

@Module({
  imports: [PlanningModule],
  controllers: [PlanningRpcController]
})
export class AppModule {}
