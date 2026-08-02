import { Module } from '@nestjs/common';

import { createServiceRpcController } from '../common/service-rpc.controller';
import { PaymentModule } from './payment.module';
import { PaymentService } from './payment.service';

const PaymentRpcController = createServiceRpcController('payment', PaymentService);

@Module({
  imports: [PaymentModule],
  controllers: [PaymentRpcController]
})
export class AppModule {}
