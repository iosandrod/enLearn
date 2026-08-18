import { Module } from '@nestjs/common';

import { createServiceRpcController } from '../common/service-rpc.controller';
import { ChatModule } from './chat.module';
import { ChatService } from './chat.service';

const ChatRpcController = createServiceRpcController('chat', ChatService);

@Module({
  imports: [ChatModule],
  controllers: [ChatRpcController]
})
export class AppModule {}
