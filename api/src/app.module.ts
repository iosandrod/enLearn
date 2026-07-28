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
import { NotificationModule } from './notification/notification.module';
import { WorkflowModule } from './workflow/workflow.module';
import { EntityDesignModule } from './entity-design/entity-design.module';

@Module({
  imports: [
    AuthModule,
    AccountModule,
    AdminModule,
    PaymentModule,
    UserModule,
    LowCodeModule,
    PostsModule,
    NotificationModule,
    WorkflowModule,
    EntityDesignModule
  ],
  controllers: [ServiceGatewayController],
  providers: [ServiceRouterService]
})
export class AppModule {}
