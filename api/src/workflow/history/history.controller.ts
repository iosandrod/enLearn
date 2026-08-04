import { Controller, Get, Inject, NotFoundException, Param, Req } from '@nestjs/common';
import { ok } from '../common/api-response';
import { RuntimeService } from '../runtime/runtime.service';

@Controller('history')
export class HistoryController {
  constructor(@Inject(RuntimeService) private readonly runtimeService: RuntimeService) {}

  @Get('instances/:instanceId/timeline')
  async getTimeline(@Param('instanceId') instanceId: string, @Req() request: HeaderReader) {
    const tenantId = request.header('x-tenant-id')?.trim();
    if (!tenantId) throw new NotFoundException('An active account set is required.');
    return ok(await this.runtimeService.getTimeline(instanceId, tenantId));
  }
}

type HeaderReader = { header(name: string): string | undefined };
