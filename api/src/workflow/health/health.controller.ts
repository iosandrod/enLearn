import { Controller, Get } from '@nestjs/common';
import { ok } from '../common/api-response';
import { getTriggerEngineStatus } from '../trigger/trigger-engine.config';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return ok({
      service: 'workflow-api',
      status: 'ok',
      triggerEngine: getTriggerEngineStatus(),
      timestamp: new Date().toISOString()
    });
  }
}
