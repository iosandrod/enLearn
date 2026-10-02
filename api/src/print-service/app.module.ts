import { Module } from '@nestjs/common';
import { createServiceRpcController } from '../common/service-rpc.controller';
import { PrintModule } from './print.module';
import { PrintService } from './print.service';

const PrintRpcController = createServiceRpcController('print', PrintService);

@Module({
  imports: [PrintModule],
  controllers: [PrintRpcController]
})
export class AppModule {}
