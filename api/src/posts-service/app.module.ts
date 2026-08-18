import { Module } from '@nestjs/common';

import { createServiceRpcController } from '../common/service-rpc.controller';
import { PostsModule } from './posts.module';
import { PostsService } from './posts.service';

const PostsRpcController = createServiceRpcController('posts', PostsService);

@Module({
  imports: [PostsModule],
  controllers: [PostsRpcController]
})
export class AppModule {}
