import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { getRedisConnectionConfig } from '../common/utils/redis';
import { DOMAIN_SERVICE_CLIENT } from '../common/service-bus';
import { WorkflowModule } from '../workflow/workflow.module';
import { ServiceRouterService } from './service-router.service';

@Module({
  imports: [
    WorkflowModule,
    ClientsModule.register([
      {
        name: DOMAIN_SERVICE_CLIENT,
        transport: Transport.REDIS,
        options: getRedisConnectionConfig()
      }
    ])
  ],
  providers: [ServiceRouterService],
  exports: [ServiceRouterService]
})
export class DomainClientModule {}
