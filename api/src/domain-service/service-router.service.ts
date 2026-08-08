import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { AccountService } from '../account-service/account.service';
import { AdminService } from '../admin-service/admin.service';
import type { ServiceContext, ServiceExecutor } from '../common/interfaces/service-executor';
import { ChatService } from '../chat-service/chat.service';
import { EntityDesignService } from '../entity-design-service/entity-design.service';
import { FilesService } from '../files-service/files.service';
import { LowCodeService } from '../lowcode-service/lowcode.service';
import { NotificationService } from '../notification-service/notification.service';
import { PaymentService } from '../payment-service/payment.service';
import { PostsService } from '../posts-service/posts.service';
import { PlanningService } from '../planning-service/planning.service';
import { UserService } from '../user-service/user.service';
import { isDomainServiceName, type DomainServiceName } from '../common/service-bus';

@Injectable()
export class DomainServiceRouter {
  private readonly executors: Record<DomainServiceName, ServiceExecutor>;

  constructor(
    @Inject(AccountService)
    private readonly accountService: AccountService,
    @Inject(AdminService)
    private readonly adminService: AdminService,
    @Inject(PaymentService)
    private readonly paymentService: PaymentService,
    @Inject(UserService)
    private readonly userService: UserService,
    @Inject(LowCodeService)
    private readonly lowCodeService: LowCodeService,
    @Inject(PostsService)
    private readonly postsService: PostsService,
    @Inject(NotificationService)
    private readonly notificationService: NotificationService,
    @Inject(EntityDesignService)
    private readonly entityDesignService: EntityDesignService,
    @Inject(FilesService)
    private readonly filesService: FilesService,
    @Inject(ChatService)
    private readonly chatService: ChatService,
    @Inject(PlanningService)
    private readonly planningService: PlanningService
  ) {
    this.executors = {
      account: accountService,
      admin: adminService,
      payment: paymentService,
      user: userService,
      lowcode: lowCodeService,
      posts: postsService,
      notification: notificationService,
      entityDesign: entityDesignService,
      files: filesService,
      chat: chatService,
      planning: planningService
    };
  }

  async invoke(
    serviceName: string,
    serviceMethod: string,
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    if (serviceMethod === 'listItems' && serviceName === 'admin') {
      return this.adminService.execute('listItems', postData, context);
    }

    const executor = this.resolveExecutor(serviceName);
    return executor.execute(serviceMethod, postData, context);
  }

  private resolveExecutor(serviceName: string): ServiceExecutor {
    if (!isDomainServiceName(serviceName)) {
      throw new BadRequestException(`Unsupported serviceName: ${serviceName}`);
    }

    return this.executors[serviceName];
  }
}
