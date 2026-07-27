import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AccountService } from '../account/account.service';
import { AdminService } from '../admin/admin.service';
import type {
  ServiceContext,
  ServiceExecutor
} from '../common/interfaces/service-executor';
import { LowCodeService } from '../lowcode/lowcode.service';
import { PaymentService } from '../payment/payment.service';
import { PostsService } from '../posts/posts.service';
import { UserService } from '../user/user.service';

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
    private readonly postsService: PostsService
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
      default:
        throw new BadRequestException(`Unsupported serviceName: ${serviceName}`);
    }
  }
}
