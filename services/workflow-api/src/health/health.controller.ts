import { Controller, Get } from '@nestjs/common';
import { ok } from '../common/api-response';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return ok({
      service: 'workflow-api',
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  }
}
