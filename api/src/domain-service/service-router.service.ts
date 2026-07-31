import { BadRequestException, Injectable } from '@nestjs/common';

import { AccountService } from '../account/account.service';
import { AdminService } from '../admin/admin.service';
import type { ServiceContext, ServiceExecutor } from '../common/interfaces/service-executor';
import { ChatService } from '../chat/chat.service';
import { EntityDesignService } from '../entity-design/entity-design.service';
import { FilesService } from '../files/files.service';
import { LowCodeService } from '../lowcode/lowcode.service';
import { NotificationService } from '../notification/notification.service';
import { PaymentService } from '../payment/payment.service';
import { PostsService } from '../posts/posts.service';
import { UserService } from '../user/user.service';

@Injectable()
export class DomainServiceRouter {
  constructor(
    private readonly accountService: AccountService,
    private readonly adminService: AdminService,
    private readonly paymentService: PaymentService,
    private readonly userService: UserService,
    private readonly lowCodeService: LowCodeService,
    private readonly postsService: PostsService,
    private readonly notificationService: NotificationService,
    private readonly entityDesignService: EntityDesignService,
    private readonly filesService: FilesService,
    private readonly chatService: ChatService
  ) {}

  async invoke(
    serviceName: string,
    serviceMethod: string,
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    const executor = this.resolveExecutor(serviceName);
    return executor.execute(serviceMethod, postData, context);
  }

  private resolveExecutor(serviceName: string): ServiceExecutor {
    switch (serviceName) {
      case 'account':
        return this.accountService;
      case 'admin':
        return this.adminService;
      case 'payment':
        return this.paymentService;
      case 'user':
        return this.userService;
      case 'lowcode':
        return this.lowCodeService;
      case 'posts':
        return this.postsService;
      case 'notification':
        return this.notificationService;
      case 'entityDesign':
        return this.entityDesignService;
      case 'files':
        return this.filesService;
      case 'chat':
        return this.chatService;
      default:
        throw new BadRequestException(`Unsupported serviceName: ${serviceName}`);
    }
  }
}
