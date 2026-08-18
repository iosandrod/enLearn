import { Module } from '@nestjs/common';

import { createServiceRpcController } from '../common/service-rpc.controller';
import { AccountModule } from './account.module';
import { AccountService } from './account.service';

const AccountRpcController = createServiceRpcController('account', AccountService);

@Module({
  imports: [AccountModule],
  controllers: [AccountRpcController]
})
export class AppModule {}
