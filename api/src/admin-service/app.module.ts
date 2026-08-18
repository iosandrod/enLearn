import { Module } from '@nestjs/common';

import { createServiceRpcController } from '../common/service-rpc.controller';
import { AdminModule } from './admin.module';
import { AdminService } from './admin.service';

const AdminRpcController = createServiceRpcController('admin', AdminService);

@Module({
  imports: [AdminModule],
  controllers: [AdminRpcController]
})
export class AppModule {}
