import { Controller, Get, Inject, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
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
  async listDefinitions(@Query() query: WorkflowDefinitionQuery, @Req() request: HeaderReader) {
    const tenantId = requireTenant(request);
    return ok(await this.definitionService.listDefinitions({ ...query, tenantId }));
  }

  @Post(':definitionId/disable')
  async disableDefinition(@Param('definitionId') definitionId: string, @Req() request: HeaderReader) {
    return ok(await this.definitionService.disableDefinition(definitionId, requireTenant(request)));
  }
}

type HeaderReader = { header(name: string): string | undefined };

function requireTenant(request: HeaderReader) {
  const tenantId = request.header('x-tenant-id')?.trim();
  if (!tenantId) throw new NotFoundException('An active account set is required.');
  return tenantId;
}
