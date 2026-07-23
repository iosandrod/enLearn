import { Module } from '@nestjs/common';
import { LowCodeService } from './lowcode.service';

@Module({
  providers: [LowCodeService],
  exports: [LowCodeService]
})
export class LowCodeModule {}
