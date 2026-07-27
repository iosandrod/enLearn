import { Body, Controller, Get, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
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
  async listModels(@Query() query: WorkflowModelQuery) {
    return ok(await this.definitionService.listModels(query));
  }

  @Get(':modelId')
  async getModel(@Param('modelId') modelId: string) {
    return ok(await this.definitionService.getModel(modelId));
  }

  @Post()
  async saveModel(@Body() dto: SaveWorkflowModelDto, @Req() request: HeaderReader) {
    return ok(await this.definitionService.saveModel(dto, this.resolveActor(request, dto.tenantId)));
  }

  @Put(':modelId')
  async updateModel(
    @Param('modelId') modelId: string,
    @Body() dto: SaveWorkflowModelDto,
    @Req() request: HeaderReader
  ) {
    return ok(await this.definitionService.saveModel(dto, this.resolveActor(request, dto.tenantId), modelId));
  }

  @Post(':modelId/publish')
  async publishModel(
    @Param('modelId') modelId: string,
    @Body() dto: PublishWorkflowModelDto,
    @Req() request: HeaderReader
  ) {
    return ok(await this.definitionService.publishModel(modelId, dto, this.resolveActor(request)));
  }

  private resolveActor(request: HeaderReader, tenantId?: string) {
    const headerTenantId = request.header('x-tenant-id')?.trim();
    const headerUserId = request.header('x-user-id')?.trim();

    return {
      tenantId: tenantId?.trim() || headerTenantId || 'default',
      ...(headerUserId ? { userId: headerUserId } : {})
    };
  }
}

type HeaderReader = {
  header(name: string): string | undefined;
};
