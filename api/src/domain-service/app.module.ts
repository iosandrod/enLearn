import { Module } from '@nestjs/common';

import { AccountModule } from '../account/account.module';
import { AdminModule } from '../admin/admin.module';
import { ChatModule } from '../chat/chat.module';
import { EntityDesignModule } from '../entity-design/entity-design.module';
import { FilesModule } from '../files/files.module';
import { LowCodeModule } from '../lowcode/lowcode.module';
import { NotificationModule } from '../notification/notification.module';
import { PaymentModule } from '../payment/payment.module';
import { PostsModule } from '../posts/posts.module';
import { UserModule } from '../user/user.module';
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
    ChatModule
  ],
  controllers: [ServiceRpcController],
  providers: [DomainServiceRouter]
})
export class AppModule {}
