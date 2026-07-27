import { Module } from '@nestjs/common';
import { DefinitionController } from './definition.controller';
import { DefinitionService } from './definition.service';
import { ModelController } from './model.controller';

@Module({
  controllers: [DefinitionController, ModelController],
  providers: [DefinitionService],
  exports: [DefinitionService]
})
export class DefinitionModule {}
