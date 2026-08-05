import { Module } from '@nestjs/common';

import { AccountModule } from '../account-service/account.module';
import { AdminModule } from '../admin-service/admin.module';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat-service/chat.module';
import { DomainServiceRouter } from '../domain-service/service-router.service';
import { EntityDesignModule } from '../entity-design-service/entity-design.module';
import { FilesModule } from '../files-service/files.module';
import { ServiceGatewayController } from '../gateway/service-gateway.controller';
import { ServiceRouterService } from '../gateway/service-router.service';
import { LowCodeModule } from '../lowcode-service/lowcode.module';
import { NotificationModule } from '../notification-service/notification.module';
import { PaymentModule } from '../payment-service/payment.module';
import { PostsModule } from '../posts-service/posts.module';
import { UserModule } from '../user-service/user.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { StandaloneServiceRouter } from './standalone-service-router.service';

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
    EntityDesignModule,
    FilesModule,
    ChatModule,
    WorkflowModule
  ],
  controllers: [ServiceGatewayController],
  providers: [
    DomainServiceRouter,
    StandaloneServiceRouter,
    {
      provide: ServiceRouterService,
      useExisting: StandaloneServiceRouter
    }
  ]
})
export class StandaloneAppModule {}
