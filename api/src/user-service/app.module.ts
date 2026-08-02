import { Module } from '@nestjs/common';

import { createServiceRpcController } from '../common/service-rpc.controller';
import { UserModule } from './user.module';
import { UserService } from './user.service';

const UserRpcController = createServiceRpcController('user', UserService);

@Module({
  imports: [UserModule],
  controllers: [UserRpcController]
})
export class AppModule {}
