import { Controller, Get, Inject, NotFoundException, Param, Query, Req } from '@nestjs/common';
import { ok } from '../common/api-response';
import {
  ApprovalConsoleService,
  type ApprovalConsoleQuery
} from './approval-console.service';

@Controller('console')
export class ApprovalConsoleController {
  constructor(
    @Inject(ApprovalConsoleService)
    private readonly approvalConsoleService: ApprovalConsoleService
  ) {}

  @Get('instances')
  async listInstances(@Query() query: ApprovalConsoleQuery, @Req() request: HeaderReader) {
    return ok(
      await this.approvalConsoleService.listInstances(resolveTenantId(request), query)
    );
  }

  @Get('instances/:instanceId')
  async getInstance(@Param('instanceId') instanceId: string, @Req() request: HeaderReader) {
    return ok(
      await this.approvalConsoleService.getInstanceDetail(
        instanceId,
        resolveTenantId(request)
      )
    );
  }
}

type HeaderReader = { header(name: string): string | undefined };

function resolveTenantId(request: HeaderReader) {
  const tenantId = request.header('x-tenant-id')?.trim();
  if (!tenantId) throw new NotFoundException('An active account set is required.');
  return tenantId;
}
