import { Module } from '@nestjs/common';
import { RuntimeModule } from '../runtime/runtime.module';
import { HistoryController } from './history.controller';

@Module({
  imports: [RuntimeModule],
  controllers: [HistoryController]
})
export class HistoryModule {}
