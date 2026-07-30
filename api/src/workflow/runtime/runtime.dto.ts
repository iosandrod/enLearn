import { IsObject, IsOptional, IsString } from 'class-validator';

export class StartWorkflowInstanceDto {
  @IsString()
  definitionId!: string;

  @IsString()
  businessKey!: string;

  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsString()
  documentId?: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;
}

export class CompleteTaskDto {
  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;
}

export class RejectTaskDto {
  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  targetNodeId?: string;
}

export class TransferTaskDto {
  @IsString()
  targetUserId!: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class AddSignTaskDto {
  @IsString()
  targetUserId!: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class InstanceActionDto {
  @IsOptional()
  @IsString()
  comment?: string;
}

export type WorkflowInstanceQuery = {
  tenantId?: string;
  status?: string;
  documentType?: string;
  documentId?: string;
};

export type WorkflowTaskQuery = {
  tenantId?: string;
  assigneeId?: string;
  status?: string;
};

export type WorkflowCcQuery = {
  tenantId?: string;
  userId?: string;
};
