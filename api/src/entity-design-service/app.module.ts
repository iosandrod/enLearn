import { Module } from '@nestjs/common';

import { createServiceRpcController } from '../common/service-rpc.controller';
import { EntityDesignModule } from './entity-design.module';
import { EntityDesignService } from './entity-design.service';

const EntityDesignRpcController = createServiceRpcController('entityDesign', EntityDesignService);

@Module({
  imports: [EntityDesignModule],
  controllers: [EntityDesignRpcController]
})
export class AppModule {}
