import { Module } from '@nestjs/common';
import { DefinitionService } from './definition.service';

@Module({
  providers: [DefinitionService],
  exports: [DefinitionService]
})
export class DefinitionModule {}
