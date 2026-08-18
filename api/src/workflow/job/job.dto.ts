import { Type } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';
import type { WorkflowJobStatus, WorkflowJobType } from './job.types';

export class CreateJobDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsIn(['once', 'cron', 'interval', 'manual', 'service_task'])
  type!: WorkflowJobType;

  @IsOptional()
  @IsString()
  triggerTaskId?: string;

  @IsOptional()
  @IsString()
  cronExpr?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  intervalSeconds?: number;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  retryPolicy?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  timeoutSeconds?: number;

  @IsOptional()
  @IsString()
  concurrencyKey?: string;
}

export class UpdateJobStatusDto {
  @IsIn(['draft', 'enabled', 'disabled', 'archived'])
  status!: WorkflowJobStatus;
}

export class UpsertJobDto extends CreateJobDto {}

export class RunJobDto {
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class JobQueryDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsIn(['once', 'cron', 'interval', 'manual', 'service_task'])
  type?: WorkflowJobType;

  @IsOptional()
  @IsIn(['draft', 'enabled', 'disabled', 'archived'])
  status?: WorkflowJobStatus;
}

export class JobRunQueryDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsIn(['queued', 'running', 'succeeded', 'failed', 'canceled'])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
