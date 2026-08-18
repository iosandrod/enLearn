import { Module } from '@nestjs/common';

import { createServiceRpcController } from '../common/service-rpc.controller';
import { NotificationModule } from './notification.module';
import { NotificationService } from './notification.service';

const NotificationRpcController = createServiceRpcController('notification', NotificationService);

@Module({
  imports: [NotificationModule],
  controllers: [NotificationRpcController]
})
export class AppModule {}
