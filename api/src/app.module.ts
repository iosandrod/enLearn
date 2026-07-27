import { AccountModule } from './account/account.module';
import { AdminModule } from './admin/admin.module';
import { Module } from '@nestjs/common';
import { ServiceGatewayController } from './gateway/service-gateway.controller';
import { ServiceRouterService } from './gateway/service-router.service';
import { LowCodeModule } from './lowcode/lowcode.module';
import { PaymentModule } from './payment/payment.module';
import { AuthModule } from './auth/auth.module';
import { PostsModule } from './posts/posts.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [AuthModule, AccountModule, AdminModule, PaymentModule, UserModule, LowCodeModule, PostsModule],
  controllers: [ServiceGatewayController],
  providers: [ServiceRouterService]
})
export class AppModule {}
