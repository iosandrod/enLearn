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
import { DatabaseModule } from '../workflow/common/database.module';
import { DefinitionModule } from '../workflow/definition/definition.module';
import { JobModule } from '../workflow/job/job.module';
import { RuntimeModule } from '../workflow/runtime/runtime.module';
import { WorkflowService } from '../workflow/workflow.service';
import { WORKFLOW_SERVICE_CLIENT } from '../workflow/workflow.transport';
import { WorkflowRpcController } from '../workflow-service/workflow.rpc.controller';
import { LocalWorkflowClient } from './local-workflow-client';
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
    DatabaseModule,
    DefinitionModule,
    RuntimeModule,
    JobModule
  ],
  controllers: [ServiceGatewayController],
  providers: [
    DomainServiceRouter,
    WorkflowRpcController,
    LocalWorkflowClient,
    {
      provide: WORKFLOW_SERVICE_CLIENT,
      useExisting: LocalWorkflowClient
    },
    WorkflowService,
    StandaloneServiceRouter,
    {
      provide: ServiceRouterService,
      useExisting: StandaloneServiceRouter
    }
  ]
})
export class StandaloneAppModule {}
