import { AdminModule } from './admin/admin.module';
import { Module } from '@nestjs/common';
import { ServiceGatewayController } from './gateway/service-gateway.controller';
import { ServiceRouterService } from './gateway/service-router.service';
import { LowCodeModule } from './lowcode/lowcode.module';
import { PaymentModule } from './payment/payment.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [AdminModule, PaymentModule, UserModule, LowCodeModule],
  controllers: [ServiceGatewayController],
  providers: [ServiceRouterService]
})
export class AppModule {}
