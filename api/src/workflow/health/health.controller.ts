import { Controller, Get, Inject } from '@nestjs/common';
import { ok } from '../common/api-response';
import { TriggerCredentialsService } from '../trigger/trigger-credentials.service';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(TriggerCredentialsService)
    private readonly triggerCredentials: TriggerCredentialsService
  ) {}

  @Get()
  async health() {
    return ok({
      service: 'workflow-api',
      status: 'ok',
      triggerEngine: await this.triggerCredentials.getStatus(),
      timestamp: new Date().toISOString()
    });
  }
}
