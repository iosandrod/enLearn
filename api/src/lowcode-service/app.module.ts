import { Module } from '@nestjs/common';

import { createServiceRpcController } from '../common/service-rpc.controller';
import { LowCodeModule } from './lowcode.module';
import { LowCodeService } from './lowcode.service';

const LowCodeRpcController = createServiceRpcController('lowcode', LowCodeService);

@Module({
  imports: [LowCodeModule],
  controllers: [LowCodeRpcController]
})
export class AppModule {}
