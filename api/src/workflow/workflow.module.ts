import { ClientsModule, Transport } from '@nestjs/microservices';
import { Module } from '@nestjs/common';

import { getRedisConnectionConfig } from '../common/utils/redis';
import { WORKFLOW_SERVICE_CLIENT } from './workflow.transport';
import { WorkflowService } from './workflow.service';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: WORKFLOW_SERVICE_CLIENT,
        transport: Transport.REDIS,
        options: getRedisConnectionConfig()
      }
    ])
  ],
  providers: [WorkflowService],
  exports: [WorkflowService]
})
export class WorkflowModule {}
