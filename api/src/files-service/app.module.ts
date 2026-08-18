import { Module } from '@nestjs/common';

import { createServiceRpcController } from '../common/service-rpc.controller';
import { FilesModule } from './files.module';
import { FilesService } from './files.service';

const FilesRpcController = createServiceRpcController('files', FilesService);

@Module({
  imports: [FilesModule],
  controllers: [FilesRpcController]
})
export class AppModule {}
