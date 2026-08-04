import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { ok } from '../common/api-response';
import {
  InstanceActionDto,
  StartWorkflowInstanceDto,
  type WorkflowInstanceQuery
} from './runtime.dto';
import { RuntimeService } from './runtime.service';

@Controller('instances')
export class RuntimeController {
  constructor(@Inject(RuntimeService) private readonly runtimeService: RuntimeService) {}

  @Get()
  async listInstances(@Query() query: WorkflowInstanceQuery, @Req() request: HeaderReader) {
    return ok(
      await this.runtimeService.listInstances({
        ...query,
        tenantId: resolveActor(request).tenantId
      })
    );
  }

  @Get('started')
  async listStarted(@Query() query: WorkflowInstanceQuery, @Req() request: HeaderReader) {
    return ok(await this.runtimeService.listStarted(resolveActor(request), query));
  }

  @Get(':instanceId')
  async getInstance(@Param('instanceId') instanceId: string, @Req() request: HeaderReader) {
    return ok(await this.runtimeService.getInstance(instanceId, resolveActor(request).tenantId));
  }

  @Get(':instanceId/timeline')
  async getTimeline(@Param('instanceId') instanceId: string, @Req() request: HeaderReader) {
    return ok(await this.runtimeService.getTimeline(instanceId, resolveActor(request).tenantId));
  }

  @Post()
  async startInstance(@Body() dto: StartWorkflowInstanceDto, @Req() request: HeaderReader) {
    return ok(await this.runtimeService.startInstance(dto, resolveActor(request)));
  }

  @Post(':instanceId/withdraw')
  async withdrawInstance(
    @Param('instanceId') instanceId: string,
    @Body() dto: InstanceActionDto,
    @Req() request: HeaderReader
  ) {
    return ok(await this.runtimeService.withdrawInstance(instanceId, dto, resolveActor(request)));
  }

  @Post(':instanceId/terminate')
  async terminateInstance(
    @Param('instanceId') instanceId: string,
    @Body() dto: InstanceActionDto,
    @Req() request: HeaderReader
  ) {
    return ok(await this.runtimeService.terminateInstance(instanceId, dto, resolveActor(request)));
  }
}

type HeaderReader = {
  header(name: string): string | undefined;
};

function resolveActor(request: HeaderReader) {
  const tenantId = request.header('x-tenant-id')?.trim();
  if (!tenantId) throw new NotFoundException('An active account set is required.');
  const userId = request.header('x-user-id')?.trim();
  return {
    tenantId,
    ...(userId ? { userId } : {})
  };
}
