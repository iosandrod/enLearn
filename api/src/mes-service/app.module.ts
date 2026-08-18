import { Module } from '@nestjs/common';
import { createServiceRpcController } from '../common/service-rpc.controller';
import { MesModule } from './mes.module';
import { MesService } from './mes.service';

const MesRpcController = createServiceRpcController('mes', MesService);

@Module({
  imports: [MesModule],
  controllers: [MesRpcController]
})
export class AppModule {}
