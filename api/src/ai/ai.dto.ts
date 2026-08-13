import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  ValidateNested
} from 'class-validator';
import { AI_RUN_MODES, type AiRunMode } from './ai.types';

export class AiPageRefDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  route?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

export class AiSelectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  blockId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  actionCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  functionName?: string;
}

export class StartAiRunDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsIn(AI_RUN_MODES)
  mode!: AiRunMode;

  @IsString()
  @IsNotEmpty()
  @MaxLength(12_000)
  message!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AiPageRefDto)
  pageRef?: AiPageRefDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AiSelectionDto)
  selection?: AiSelectionDto;

  @IsOptional()
  @IsObject()
  clientContext?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  includeSampleData?: boolean;
}

export class RejectAiProposalDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
