import { IsObject, IsOptional, IsString } from 'class-validator';

export class SaveWorkflowModelDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  documentType?: string;

  @IsObject()
  schema!: Record<string, unknown>;
}

export class PublishWorkflowModelDto {
  @IsOptional()
  @IsString()
  remark?: string;
}

export type WorkflowModelQuery = {
  tenantId?: string;
  documentType?: string;
  status?: string;
};

export type WorkflowDefinitionQuery = {
  tenantId?: string;
  documentType?: string;
  status?: string;
};
