import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { ok } from '../common/api-response';
import {
  CreateJobDto,
  JobQueryDto,
  JobRunQueryDto,
  RunJobDto,
  UpdateJobStatusDto
} from './job.dto';
import { JobService } from './job.service';

@Controller('jobs')
export class JobController {
  constructor(@Inject(JobService) private readonly jobService: JobService) {}

  @Get()
  async listJobs(@Query() query: JobQueryDto, @Req() request: HeaderReader) {
    return ok(await this.jobService.listJobs(query, resolveActor(request)));
  }

  @Post()
  async createJob(@Body() dto: CreateJobDto, @Req() request: HeaderReader) {
    return ok(await this.jobService.createJob(dto, resolveActor(request)));
  }

  @Get('runs')
  async listRuns(@Query() query: JobRunQueryDto, @Req() request: HeaderReader) {
    return ok(await this.jobService.listRuns(query, resolveActor(request)));
  }

  @Get(':jobId')
  async getJob(@Param('jobId') jobId: string, @Req() request: HeaderReader) {
    return ok(await this.jobService.getJob(jobId, resolveActor(request)));
  }

  @Post(':jobId/status')
  async updateJobStatus(
    @Param('jobId') jobId: string,
    @Body() dto: UpdateJobStatusDto,
    @Req() request: HeaderReader
  ) {
    return ok(await this.jobService.updateJobStatus(jobId, dto.status, resolveActor(request)));
  }

  @Post(':jobId/run')
  async runJob(@Param('jobId') jobId: string, @Body() dto: RunJobDto, @Req() request: HeaderReader) {
    return ok(await this.jobService.runJob(jobId, dto, resolveActor(request)));
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
