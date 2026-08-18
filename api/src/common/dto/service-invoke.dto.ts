import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { PUBLIC_SERVICE_NAMES, type PublicServiceName } from '../service-bus';

export class ServiceInvokeDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(PUBLIC_SERVICE_NAMES)
  serviceName!: PublicServiceName;

  @IsString()
  @IsNotEmpty()
  serviceMethod!: string;

  @IsOptional()
  @IsObject()
  postData?: Record<string, unknown>;
}
