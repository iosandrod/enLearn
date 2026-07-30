import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ok } from '../common/api-response';
import { RuntimeService } from '../runtime/runtime.service';

@Controller('history')
export class HistoryController {
  constructor(@Inject(RuntimeService) private readonly runtimeService: RuntimeService) {}

  @Get('instances/:instanceId/timeline')
  async getTimeline(@Param('instanceId') instanceId: string) {
    return ok(await this.runtimeService.getTimeline(instanceId));
  }
}
