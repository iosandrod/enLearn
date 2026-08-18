import { Module } from '@nestjs/common';
import { MesService } from './mes.service';

@Module({
  providers: [MesService],
  exports: [MesService]
})
export class MesModule {}
