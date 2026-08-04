import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ok } from '../common/api-response';
import {
  PublishWorkflowModelDto,
  SaveWorkflowModelDto,
  type WorkflowModelQuery
} from './definition.dto';
import { DefinitionService } from './definition.service';

@Controller('models')
export class ModelController {
  constructor(@Inject(DefinitionService) private readonly definitionService: DefinitionService) {}

  @Get()
  async listModels(@Query() query: WorkflowModelQuery, @Req() request: HeaderReader) {
    return ok(await this.definitionService.listModels({ ...query, tenantId: this.requireTenant(request) }));
  }

  @Get(':modelId')
  async getModel(@Param('modelId') modelId: string, @Req() request: HeaderReader) {
    return ok(await this.definitionService.getModel(modelId, this.requireTenant(request)));
  }

  @Post()
  async saveModel(@Body() dto: SaveWorkflowModelDto, @Req() request: HeaderReader) {
    return ok(await this.definitionService.saveModel(dto, this.resolveActor(request)));
  }

  @Put(':modelId')
  async updateModel(
    @Param('modelId') modelId: string,
    @Body() dto: SaveWorkflowModelDto,
    @Req() request: HeaderReader
  ) {
    return ok(await this.definitionService.saveModel(dto, this.resolveActor(request), modelId));
  }

  @Post(':modelId/publish')
  async publishModel(
    @Param('modelId') modelId: string,
    @Body() dto: PublishWorkflowModelDto,
    @Req() request: HeaderReader
  ) {
    return ok(await this.definitionService.publishModel(modelId, dto, this.resolveActor(request)));
  }

  private resolveActor(request: HeaderReader) {
    const headerTenantId = this.requireTenant(request);
    const headerUserId = request.header('x-user-id')?.trim();

    return {
      tenantId: headerTenantId,
      ...(headerUserId ? { userId: headerUserId } : {})
    };
  }

  private requireTenant(request: HeaderReader) {
    const tenantId = request.header('x-tenant-id')?.trim();
    if (!tenantId) throw new NotFoundException('An active account set is required.');
    return tenantId;
  }
}

type HeaderReader = {
  header(name: string): string | undefined;
};
