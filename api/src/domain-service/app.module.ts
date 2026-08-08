import { Module } from '@nestjs/common';

import { AccountModule } from '../account-service/account.module';
import { AdminModule } from '../admin-service/admin.module';
import { ChatModule } from '../chat-service/chat.module';
import { EntityDesignModule } from '../entity-design-service/entity-design.module';
import { FilesModule } from '../files-service/files.module';
import { LowCodeModule } from '../lowcode-service/lowcode.module';
import { NotificationModule } from '../notification-service/notification.module';
import { PaymentModule } from '../payment-service/payment.module';
import { PostsModule } from '../posts-service/posts.module';
import { PlanningModule } from '../planning-service/planning.module';
import { UserModule } from '../user-service/user.module';
import { ServiceRpcController } from './service.rpc.controller';
import { DomainServiceRouter } from './service-router.service';

@Module({
  imports: [
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
    PlanningModule
  ],
  controllers: [ServiceRpcController],
  providers: [DomainServiceRouter]
})
export class AppModule {}
