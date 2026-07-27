import { Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ok } from '../common/api-response';
import type { WorkflowDefinitionQuery } from './definition.dto';
import { DefinitionService } from './definition.service';

@Controller('definitions')
export class DefinitionController {
  constructor(@Inject(DefinitionService) private readonly definitionService: DefinitionService) {}

  @Get('capabilities')
  getCapabilities() {
    return ok(this.definitionService.getCapabilities());
  }

  @Get()
  async listDefinitions(@Query() query: WorkflowDefinitionQuery) {
    return ok(await this.definitionService.listDefinitions(query));
  }

  @Post(':definitionId/disable')
  async disableDefinition(@Param('definitionId') definitionId: string) {
    return ok(await this.definitionService.disableDefinition(definitionId));
  }
}
