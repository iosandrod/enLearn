import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AccountService } from '../account/account.service';
import { AdminService } from '../admin/admin.service';
import type {
  ServiceContext,
  ServiceExecutor
} from '../common/interfaces/service-executor';
import { LowCodeService } from '../lowcode/lowcode.service';
import { NotificationService } from '../notification/notification.service';
import { PaymentService } from '../payment/payment.service';
import { PostsService } from '../posts/posts.service';
import { UserService } from '../user/user.service';
import { WorkflowService } from '../workflow/workflow.service';
import { EntityDesignService } from '../entity-design/entity-design.service';
import { FilesService } from '../files/files.service';
import { ChatService } from '../chat/chat.service';

@Injectable()
export class ServiceRouterService {
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
    @Inject(WorkflowService)
    private readonly workflowService: WorkflowService,
    @Inject(EntityDesignService)
    private readonly entityDesignService: EntityDesignService,
    @Inject(FilesService)
    private readonly filesService: FilesService,
    @Inject(ChatService)
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
      case 'workflow':
        return this.workflowService;
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
