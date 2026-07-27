import { Module } from '@nestjs/common';
import { RuntimeModule } from '../runtime/runtime.module';
import { TaskController } from './task.controller';

@Module({
  imports: [RuntimeModule],
  controllers: [TaskController]
})
export class TaskModule {}
